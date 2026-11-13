import { EntityManager } from '@mikro-orm/postgresql'
import { ConflictException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { AuditService } from '../admin/audit.service'
import { User } from '../auth/auth.entity'

/** Order states that still involve the account: money or goods are in motion. */
const OPEN_ORDER_STATUSES = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'IN_DELIVERY', 'DISPUTED']

/**
 * Self-service account deletion, required by both stores.
 *
 * The person disappears, the books do not: orders, payments and wallet
 * movements are accounting records the platform must keep, so the user row
 * survives with every personal field wiped instead of being dropped. Whatever
 * let the account be reached — sessions, passwords, social links, trusted
 * devices, push tokens — is deleted outright.
 */
@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name)

  constructor(
    private readonly em: EntityManager,
    private readonly auditService: AuditService,
  ) {}

  async deleteOwnAccount(userId: string): Promise<void> {
    const user = await this.em.findOne(User, { id: userId })
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable')
    }

    await this.assertNothingPending(userId)

    await this.em.transactional(async (tx) => {
      const conn = tx.getConnection()

      // A shop without an owner must stop selling at once: hidden from the
      // catalogue and refused at checkout, like a suspended one.
      await conn.execute(
        `UPDATE suppliers SET validation_status = 'SUSPENDED' WHERE user_id = ?`,
        [userId],
      )

      // A member leaves the family wallets they belonged to; their purchases
      // stay in the payer's history.
      await conn.execute(
        `UPDATE family_wallet_members SET status = 'REMOVED', updated_at = NOW() WHERE user_id = ? AND status <> 'REMOVED'`,
        [userId],
      )

      await conn.execute(`DELETE FROM device_tokens WHERE "userId" = ?`, [userId])
      await conn.execute(`DELETE FROM trusted_devices WHERE user_id = ?`, [userId])
      await conn.execute(`DELETE FROM account WHERE "userId" = ?`, [userId])
      await conn.execute(`DELETE FROM session WHERE "userId" = ?`, [userId])

      const target = await tx.findOneOrFail(User, { id: userId })
      target.name = 'Compte supprimé'
      // Unique and unreachable: frees the real address for a future sign-up.
      target.email = `deleted-${userId}@deleted.e-bio.org`
      target.emailVerified = false
      target.phone = undefined
      target.image = undefined
      target.deviceId = undefined
      target.referralCode = undefined
      target.status = 'DELETED'
      target.statusReason = undefined
      target.suspendedUntil = undefined
      target.statusChangedAt = new Date()
      target.statusChangedBy = userId
    })

    await this.auditService.record({
      actorUserId: userId,
      action: 'USER_SELF_DELETED',
      targetType: 'user',
      targetId: userId,
    })
    this.logger.warn(`User ${userId} deleted their account`)
  }

  /**
   * Refuses while the account still owes or is owed something.
   *
   * Deleting mid-order would leave a buyer, a shop or a courier with nobody
   * to answer them, and a non-zero balance is money someone has to receive.
   */
  private async assertNothingPending(userId: string): Promise<void> {
    const conn = this.em.getConnection()
    const placeholders = OPEN_ORDER_STATUSES.map(() => '?').join(', ')

    const [orders] = await conn.execute<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count
       FROM orders o
       LEFT JOIN suppliers s ON s.id = o.supplier_id
       WHERE (o.buyer_id = ? OR s.user_id = ?)
         AND o.status IN (${placeholders})`,
      [userId, userId, ...OPEN_ORDER_STATUSES],
    )
    if (Number(orders?.count ?? 0) > 0) {
      throw new ConflictException(
        'Des commandes sont encore en cours sur ce compte. Attendez qu\'elles soient terminées avant de le supprimer.',
      )
    }

    // A payer closes their family wallet first: its balance then lands on the
    // personal wallet, checked just below (FR-031).
    const [familyWallets] = await conn.execute<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count FROM family_wallets WHERE payer_id = ? AND status <> 'CLOSED'`,
      [userId],
    )
    if (Number(familyWallets?.count ?? 0) > 0) {
      throw new ConflictException({
        statusCode: HttpStatus.CONFLICT,
        code: 'FAMILY_WALLET_OPEN',
        message: 'Votre portefeuille famille est encore ouvert. Fermez-le d\'abord : son solde rejoindra votre portefeuille eBio.',
      })
    }

    const [wallets] = await conn.execute<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count
       FROM wallets w
       LEFT JOIN suppliers s ON s.id = w.supplier_id
       LEFT JOIN courier_profiles c ON c.id = w.courier_profile_id
       WHERE (w.user_id = ? OR s.user_id = ? OR c.user_id = ?)
         AND w.balance <> 0`,
      [userId, userId, userId],
    )
    if (Number(wallets?.count ?? 0) > 0) {
      throw new ConflictException(
        'Un solde reste sur votre portefeuille. Contactez le support pour le récupérer avant de supprimer votre compte.',
      )
    }
  }
}
