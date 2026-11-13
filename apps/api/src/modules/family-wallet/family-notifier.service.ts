import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, Logger } from '@nestjs/common'
import { SmsService } from '../../common/sms.service'
import { config } from '../../config/env.config'
import { User } from '../auth/auth.entity'
import { NotificationChannel, NotificationType } from '../notifications/notification.entity'
import { NotificationsService } from '../notifications/notifications.service'
import { Wallet } from '../wallet/entities/wallet.entity'
import { FamilyMemberStatus, FamilyWalletMember } from './entities/family-wallet-member.entity'
import { FamilyWallet, FamilyWalletStatus } from './entities/family-wallet.entity'
import { effectiveLimits, spendable } from './family-limits'
import { spentThisMonthByMember } from './family-payment.service'
import { memberAddedText, memberInvitationSms, topupText } from './family-texts'

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
}
