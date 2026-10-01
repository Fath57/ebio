import type { ReferralSummary } from './contracts/referral.contract'
import { randomInt } from 'node:crypto'
import { EntityManager } from '@mikro-orm/postgresql'
import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { config } from '../../config/env.config'
import { User } from '../auth/auth.entity'
import { NotificationChannel, NotificationType } from '../notifications/notification.entity'
import { NotificationsService } from '../notifications/notifications.service'
import { PlatformSettingsService } from '../settings/platform-settings.service'
import { WalletTransactionType } from '../wallet/entities/wallet-transaction.entity'
import { PlatformAccount } from '../wallet/entities/wallet.entity'
import { WalletService } from '../wallet/wallet.service'
import { REFERRAL_CODE_ALPHABET, REFERRAL_CODE_LENGTH } from './contracts/referral.contract'
import { Referral, ReferralStatus } from './referral.entity'

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name)

  constructor(
    private readonly em: EntityManager,
    private readonly wallet: WalletService,
    private readonly settings: PlatformSettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Le code du compte, créé au premier besoin.
   *
   * Tiré au sort plutôt que dérivé du nom : deux Fatou auraient le même, et un
   * code qui contient le nom de quelqu'un se promène ensuite dans des groupes
   * WhatsApp. Une collision se retente — à 32 caractères sur 6, elle est rare
   * et la contrainte d'unicité la rattrape de toute façon.
   */
  async codeFor(userId: string): Promise<string> {
    const user = await this.em.findOneOrFail(User, { id: userId })
    if (user.referralCode) {
      return user.referralCode
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = Array.from(
        { length: REFERRAL_CODE_LENGTH },
        () => REFERRAL_CODE_ALPHABET[randomInt(REFERRAL_CODE_ALPHABET.length)],
      ).join('')
      const taken = await this.em.count(User, { referralCode: code })
      if (taken > 0) {
        continue
      }
      user.referralCode = code
      try {
        await this.em.flush()
        return code
      }
      catch {
        // Deux premiers affichages en même temps : l'un des deux perd la
        // course sur la contrainte d'unicité, il retire un autre code.
        this.em.clear()
      }
    }
    throw new BadRequestException('Impossible de créer votre code pour le moment')
  }

  /** Le tableau de bord d'un acheteur : son code, ses filleuls, ses gains. */
  async summary(userId: string): Promise<ReferralSummary> {
    const code = await this.codeFor(userId)
    const rewards = await this.settings.getReferralRewards()

    const given = await this.em.find(Referral, { sponsor: { id: userId } })
    const received = await this.em.findOne(
      Referral,
      { referee: { id: userId } },
      { populate: ['sponsor'] },
    )

    return {
      code,
      // Le site public, pas le back-office : c'est lui qui porte déjà les
      // liens partagés vers une boutique ou un produit, et qui sait renvoyer
      // vers l'app installée.
      link: `${config.clients.webSsr.url}/parrainage/${code}`,
      pending: given.filter(item => item.status === ReferralStatus.PENDING).length,
      rewarded: given.filter(item => item.status === ReferralStatus.REWARDED).length,
      earned: given.reduce((total, item) => total + item.sponsorAmount, 0),
      sponsorReward: rewards.sponsorAmount,
      refereeReward: rewards.refereeAmount,
      minOrderAmount: rewards.minOrderAmount,
      active: rewards.active,
      sponsoredBy: received
        ? { name: received.sponsor.name, status: received.status }
        : null,
    }
  }

  /**
   * Rattache un parrain au compte courant.
   *
   * Refusé après la première commande livrée : le parrainage paie une
   * rencontre, pas un client qui commandait déjà. Refusé sur son propre code,
   * et une seule fois par personne — la contrainte d'unicité sur le filleul
   * le garantit même si deux requêtes arrivent ensemble.
   */
  async claim(userId: string, code: string): Promise<{ sponsorName: string }> {
    const rewards = await this.settings.getReferralRewards()
    if (!rewards.active) {
      throw new BadRequestException('Le parrainage est suspendu pour le moment')
    }

    const existing = await this.em.count(Referral, { referee: { id: userId } })
    if (existing > 0) {
      throw new BadRequestException('Vous avez déjà un parrain')
    }

    const sponsor = await this.em.findOne(User, { referralCode: code })
    if (!sponsor) {
      throw new BadRequestException('Ce code de parrainage n\'existe pas')
    }
    if (sponsor.id === userId) {
      throw new BadRequestException('On ne peut pas être son propre parrain')
    }

    const delivered = await this.hasDeliveredOrder(userId)
    if (delivered) {
      throw new BadRequestException('Le code doit être saisi avant votre première commande livrée')
    }

    const referral = this.em.create(Referral, {
      sponsor,
      referee: this.em.getReference(User, userId),
      code,
    })
    await this.em.persistAndFlush(referral)

    return { sponsorName: sponsor.name }
  }

  /**
   * La première commande livrée d'un filleul paie les deux.
   *
   * Appelé au passage à « livrée », et jamais en travers du chemin : une
   * récompense qui échoue ne doit pas empêcher une commande d'être livrée.
   * Le tout est idempotent — seule une ligne encore en attente est versée,
   * et elle ne passe « récompensée » que si les deux crédits ont eu lieu.
   */
  async onOrderDelivered(orderId: string, buyerId: string, orderTotal: number): Promise<void> {
    try {
      const referral = await this.em.findOne(
        Referral,
        { referee: { id: buyerId }, status: ReferralStatus.PENDING },
        { populate: ['sponsor', 'referee'] },
      )
      if (!referral) {
        return
      }

      const rewards = await this.settings.getReferralRewards()
      if (!rewards.active) {
        return
      }
      if (orderTotal < rewards.minOrderAmount) {
        this.logger.log(`Parrainage ${referral.id} — commande de ${orderTotal} sous le plancher de ${rewards.minOrderAmount}, on attend la suivante`)
        return
      }

      // Le passage à REWARDED et les crédits forment un tout : un crédit qui
      // échoue annule le reste et la ligne attend la livraison suivante. La
      // mise à jour conditionnelle arbitre deux livraisons simultanées.
      const isPaid = await this.em.transactional(async (em) => {
        const claim = await em.execute<{ affectedRows?: number }>(
          `UPDATE referrals
           SET status = ?, sponsor_amount = ?, referee_amount = ?, order_id = ?, rewarded_at = NOW()
           WHERE id = ? AND status = ?`,
          [ReferralStatus.REWARDED, rewards.sponsorAmount, rewards.refereeAmount, orderId, referral.id, ReferralStatus.PENDING],
          'run',
        )
        if ((claim.affectedRows ?? 0) === 0) {
          return false
        }

        await this.pay(referral.sponsor, rewards.sponsorAmount, orderId, `Parrainage — ${referral.referee.name}`)
        await this.pay(referral.referee, rewards.refereeAmount, orderId, `Bienvenue — parrainé par ${referral.sponsor.name}`)

        // eBio porte la dépense : c'est de l'acquisition, pas une remise de
        // boutique. Elle atterrit donc sur le compte marketing.
        await this.wallet.post(PlatformAccount.MARKETING, 'debit', {
          type: WalletTransactionType.PLATFORM_MARKETING,
          amount: rewards.sponsorAmount + rewards.refereeAmount,
          description: `Parrainage — ${referral.sponsor.name} et ${referral.referee.name}`,
          orderId,
        })
        return true
      })
      if (!isPaid) {
        return
      }

      await this.tell(referral.sponsor, 'Parrainage récompensé', `${referral.referee.name} a reçu sa première commande. ${rewards.sponsorAmount} FCFA ont été versés sur votre portefeuille.`)
      await this.tell(referral.referee, 'Bienvenue sur eBio', `${rewards.refereeAmount} FCFA ont été versés sur votre portefeuille, grâce à ${referral.sponsor.name}.`)
    }
    catch (error) {
      this.logger.error(`Parrainage non versé pour la commande ${orderId}`, error instanceof Error ? error.stack : String(error))
    }
  }

  private async pay(user: User, amount: number, orderId: string, description: string): Promise<void> {
    if (amount <= 0) {
      return
    }
    const wallet = await this.wallet.getOrCreate({ userId: user.id })
    await this.wallet.credit(wallet.id, {
      type: WalletTransactionType.REFERRAL_REWARD,
      amount,
      description,
      orderId,
    })
  }

  private async tell(user: User, title: string, body: string): Promise<void> {
    await this.notifications.send({
      user,
      type: NotificationType.REFERRAL_REWARD,
      title,
      body,
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
    })
  }

  /** En SQL brut : le module des commandes dépend déjà de celui-ci. */
  private async hasDeliveredOrder(userId: string): Promise<boolean> {
    const rows = await this.em.getConnection().execute(
      `SELECT 1 FROM orders WHERE buyer_id = ? AND status = 'DELIVERED' LIMIT 1`,
      [userId],
    )
    return rows.length > 0
  }
}
