import type { FamilyStatusEvent } from './family-texts'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, Logger } from '@nestjs/common'
import { SmsService } from '../../common/sms.service'
import { config } from '../../config/env.config'
import { User } from '../auth/auth.entity'
import { EmailService } from '../email/email.service'
import { NotificationChannel, NotificationType } from '../notifications/notification.entity'
import { NotificationsService } from '../notifications/notifications.service'
import { Order } from '../orders/entities/order.entity'
import { Checkout } from '../payments/entities/checkout.entity'
import { Wallet } from '../wallet/entities/wallet.entity'
import { FamilyMemberStatus, FamilyWalletMember } from './entities/family-wallet-member.entity'
import { FamilyWallet, FamilyWalletStatus } from './entities/family-wallet.entity'
import { effectiveLimits, spendable } from './family-limits'
import { spentThisMonthByMember } from './family-payment.service'
import { adminWalletStatusText, lowBalanceText, memberAddedText, memberInvitationSms, memberJoinedText, memberPendingText, purchaseText, statusText, topupText } from './family-texts'

const TITLE = 'Portefeuille famille'

/**
 * What the family wallet says, and to whom: the relative who was just added
 * (push and SMS, or an invitation SMS when they have no account yet), the
 * members after a top-up.
 *
 * Never throws: a refused SMS or an unreachable push service must not undo
 * an added member or a credited top-up.
 */
@Injectable()
export class FamilyNotifierService {
  private readonly logger = new Logger(FamilyNotifierService.name)

  constructor(
    private readonly em: EntityManager,
    private readonly sms: SmsService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
  ) {}

  /** Where an invited relative installs the app. */
  invitationLink(): string {
    return config.clients.publicSite.url
  }

  /** An active member hears it by push and SMS; a pending one gets the invitation. */
  async onMemberAdded(memberId: string): Promise<void> {
    try {
      const em = this.em.fork()
      const member = await em.findOne(FamilyWalletMember, { id: memberId }, { populate: ['familyWallet.payer', 'user'] })
      if (!member) {
        return
      }
      const payerName = member.familyWallet.payer.name
      if (member.status === FamilyMemberStatus.ACTIVE && member.user) {
        await this.notifications.send({
          user: member.user as User,
          type: NotificationType.FAMILY_WALLET_STATUS,
          title: TITLE,
          body: memberAddedText(payerName),
          data: { memberId: member.id, event: 'ADDED' },
          channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP, NotificationChannel.SMS],
        })
        return
      }
      if (member.status === FamilyMemberStatus.PENDING) {
        await this.sendSms(member.phone, memberInvitationSms(payerName, this.invitationLink()), 'invitation')
      }
    }
    catch (error) {
      this.logger.error(`Annonce du membre ${memberId} impossible`, error instanceof Error ? error.stack : String(error))
    }
  }

  /**
   * A top-up landed on a wallet: if it is a family wallet, each active
   * member hears what they may now spend — their own figure, never the
   * balance (FR-011). Any other wallet is none of this module's business.
   */
  async onTopupCredited(walletId: string): Promise<void> {
    try {
      const em = this.em.fork()
      const wallet = await em.findOne(Wallet, { id: walletId }, { populate: ['familyWallet.payer'] })
      const familyWallet = wallet?.familyWallet as FamilyWallet | null | undefined
      if (!wallet || !familyWallet || familyWallet.status !== FamilyWalletStatus.ACTIVE) {
        return
      }
      const balance = Number(wallet.balance)

      // Back above the threshold: the next crossing may alert again.
      await em.execute(
        `UPDATE family_wallets SET low_balance_alerted = false
         WHERE id = ? AND low_balance_alerted AND low_balance_threshold <= ?`,
        [familyWallet.id, balance],
      )

      const members = await em.find(
        FamilyWalletMember,
        { familyWallet: { id: familyWallet.id }, status: FamilyMemberStatus.ACTIVE },
        { populate: ['user'] },
      )
      const spent = await spentThisMonthByMember(em, members.map(member => member.id), new Date())
      for (const member of members) {
        if (!member.user) {
          continue
        }
        const memberSpendable = spendable(balance, effectiveLimits(familyWallet, member), spent.get(member.id) ?? 0)
        await this.notifications.send({
          user: member.user as User,
          type: NotificationType.FAMILY_WALLET_TOPUP,
          title: TITLE,
          body: topupText(familyWallet.payer.name, memberSpendable),
          data: { memberId: member.id, spendable: memberSpendable },
          channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP, NotificationChannel.SMS],
        })
      }
    }
    catch (error) {
      this.logger.error(`Annonce de la recharge du portefeuille ${walletId} impossible`, error instanceof Error ? error.stack : String(error))
    }
  }

  private async sendSms(phone: string, message: string, what: string): Promise<void> {
    try {
      await this.sms.send(phone, message)
    }
    catch (error) {
      this.logger.error(`SMS « ${what} » du portefeuille famille non envoyé`, error instanceof Error ? error.stack : String(error))
    }
  }

  // ===== Control and invitation (US5, US6) =====

  /**
   * A status change told to the members it concerns: the given ones, or
   * every member with an account when the whole wallet changed. Push and
   * in-app only: nothing here costs an SMS.
   */
  async onStatusChanged(familyWalletId: string, event: FamilyStatusEvent, memberIds?: string[]): Promise<void> {
    try {
      const em = this.em.fork()
      const wallet = await em.findOne(FamilyWallet, { id: familyWalletId }, { populate: ['payer'] })
      if (!wallet) {
        return
      }
      const members = await em.find(
        FamilyWalletMember,
        memberIds
          ? { id: { $in: memberIds }, familyWallet: { id: familyWalletId } }
          : { familyWallet: { id: familyWalletId }, status: { $in: [FamilyMemberStatus.ACTIVE, FamilyMemberStatus.SUSPENDED] } },
        { populate: ['user'] },
      )
      for (const member of members) {
        if (!member.user) {
          continue
        }
        await this.notifications.send({
          user: member.user as User,
          type: NotificationType.FAMILY_WALLET_STATUS,
          title: TITLE,
          body: statusText(wallet.payer.name, event),
          data: { memberId: member.id, event },
          channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
        })
      }
    }
    catch (error) {
      this.logger.error(`Annonce « ${event} » du portefeuille ${familyWalletId} impossible`, error instanceof Error ? error.stack : String(error))
    }
  }

  /** eBio suspended or released the wallet: the payer hears it, with the reason. */
  async onAdminWalletStatus(familyWalletId: string, suspended: boolean, reason: string | null): Promise<void> {
    try {
      const em = this.em.fork()
      const wallet = await em.findOne(FamilyWallet, { id: familyWalletId }, { populate: ['payer'] })
      if (!wallet) {
        return
      }
      await this.notifications.send({
        user: wallet.payer as User,
        type: NotificationType.FAMILY_WALLET_STATUS,
        title: TITLE,
        body: adminWalletStatusText(suspended, reason),
        data: { familyWalletId, event: suspended ? 'WALLET_SUSPENDED_BY_EBIO' : 'WALLET_RESUMED_BY_EBIO' },
        channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      })
    }
    catch (error) {
      this.logger.error(`Annonce de suspension du portefeuille ${familyWalletId} impossible`, error instanceof Error ? error.stack : String(error))
    }
  }

  /** A pending relative proved their number: the payer hears they joined. */
  async onMemberJoined(memberId: string): Promise<void> {
    await this.toPayer(memberId, NotificationType.FAMILY_WALLET_MEMBER_JOINED, memberJoinedText, 'JOINED')
  }

  /** Still pending after 30 days: the payer may resend the invitation or remove them. */
  async onMemberStillPending(memberId: string): Promise<void> {
    await this.toPayer(memberId, NotificationType.FAMILY_WALLET_MEMBER_PENDING, memberPendingText, 'PENDING')
  }

  private async toPayer(memberId: string, type: NotificationType, text: (nickname: string) => string, event: string): Promise<void> {
    try {
      const em = this.em.fork()
      const member = await em.findOne(FamilyWalletMember, { id: memberId }, { populate: ['familyWallet.payer'] })
      if (!member) {
        return
      }
      await this.notifications.send({
        user: member.familyWallet.payer as User,
        type,
        title: TITLE,
        body: text(member.nickname),
        data: { memberId: member.id, event },
        channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      })
    }
    catch (error) {
      this.logger.error(`Annonce « ${event} » du membre ${memberId} impossible`, error instanceof Error ? error.stack : String(error))
    }
  }

  /**
   * A member paid a cart from the family wallet: the payer hears who bought
   * what, where (FR-018). If the payment took the balance under the payer's
   * threshold, they hear that too — once per crossing: the flag is set here
   * atomically and cleared when the balance is back above (top-up, refund).
   */
  async onFamilyPurchase(checkoutId: string): Promise<void> {
    try {
      const em = this.em.fork()
      const checkout = await em.findOne(Checkout, { id: checkoutId }, { populate: ['familyMember.familyWallet.payer'] })
      const member = checkout?.familyMember as FamilyWalletMember | null | undefined
      if (!checkout || !member) {
        return
      }
      const familyWallet = member.familyWallet as FamilyWallet
      const payer = familyWallet.payer as User
      const orders = await em.find(Order, { checkout: { id: checkoutId } }, { populate: ['supplier'], orderBy: { createdAt: 'ASC' } })
      const shopName = orders[0]?.supplier.shopName ?? 'eBio'
      await this.notifications.send({
        user: payer,
        type: NotificationType.FAMILY_WALLET_PURCHASE,
        title: TITLE,
        body: purchaseText(member.nickname, shopName, Number(checkout.totalAmount)),
        data: { memberId: member.id, checkoutId, orderId: orders[0]?.id ?? null },
        channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      })
      await this.alertLowBalance(em, familyWallet.id, payer)
    }
    catch (error) {
      this.logger.error(`Annonce de l'achat ${checkoutId} au payeur impossible`, error instanceof Error ? error.stack : String(error))
    }
  }

  /** Push and e-mail when the balance just went under the threshold and no alert is pending. */
  private async alertLowBalance(em: EntityManager, familyWalletId: string, payer: User): Promise<void> {
    const [crossed] = await em.execute<Array<{ balance: string }>>(
      `UPDATE family_wallets fw SET low_balance_alerted = true
       FROM wallets w
       WHERE w.family_wallet_id = fw.id AND fw.id = ? AND NOT fw.low_balance_alerted AND w.balance < fw.low_balance_threshold
       RETURNING w.balance`,
      [familyWalletId],
    )
    if (!crossed) {
      return
    }
    const body = lowBalanceText(Number(crossed.balance))
    await this.notifications.send({
      user: payer,
      type: NotificationType.FAMILY_WALLET_LOW_BALANCE,
      title: TITLE,
      body,
      data: { familyWalletId, balance: Number(crossed.balance) },
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
    })
    if (payer.email) {
      try {
        await this.email.sendEmail({ to: payer.email, subject: 'Solde bas — portefeuille famille eBio', content: `${body} Rechargez-le depuis l'application eBio pour que vos proches puissent continuer leurs courses.` })
      }
      catch (error) {
        this.logger.error(`E-mail de solde bas du portefeuille ${familyWalletId} non envoyé`, error instanceof Error ? error.stack : String(error))
      }
    }
  }
}
