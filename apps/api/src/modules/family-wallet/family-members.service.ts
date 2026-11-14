import type { AddFamilyMember, FamilyLimitsInput } from './contracts/family-wallet.contract'
import { UniqueConstraintViolationException } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql'
import { HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { User } from '../auth/auth.entity'
import { SavedRelative } from '../relatives/entities/saved-relative.entity'
import { RelativesService } from '../relatives/relatives.service'
import { FamilyMemberStatus, FamilyWalletMember } from './entities/family-wallet-member.entity'
import { FamilyWallet, FamilyWalletStatus } from './entities/family-wallet.entity'
import { FamilyNotifierService } from './family-notifier.service'
import { familyError } from './family-texts'
import { assertCategoriesExist, FamilyWalletsService } from './family-wallets.service'

function memberExists() {
  return familyError(HttpStatus.CONFLICT, 'FAMILY_MEMBER_EXISTS', 'Ce proche est déjà membre de votre portefeuille famille.')
}

function memberIsPayer() {
  return familyError(HttpStatus.BAD_REQUEST, 'FAMILY_MEMBER_IS_PAYER', 'Vous ne pouvez pas être membre de votre propre portefeuille famille.')
}

function memberNone() {
  return familyError(HttpStatus.NOT_FOUND, 'FAMILY_MEMBER_NONE', 'Ce proche n\'est pas membre de votre portefeuille famille.')
}

function memberNotActive() {
  return familyError(HttpStatus.CONFLICT, 'FAMILY_MEMBER_NOT_ACTIVE', 'Ce proche n\'a pas encore rejoint votre portefeuille famille : il n\'y a rien à mettre en pause.')
}

function memberNotPending() {
  return familyError(HttpStatus.CONFLICT, 'FAMILY_MEMBER_NOT_PENDING', 'Ce proche a déjà rejoint votre portefeuille famille.')
}

function inviteTooSoon() {
  return familyError(HttpStatus.TOO_MANY_REQUESTS, 'FAMILY_INVITE_TOO_SOON', 'Une invitation est déjà partie il y a moins de 24 heures. Réessayez demain.')
}

function memberSuspendedByAdmin() {
  return familyError(HttpStatus.FORBIDDEN, 'FAMILY_MEMBER_SUSPENDED_BY_ADMIN', 'L\'accès de ce proche a été suspendu par eBio. Contactez le support pour le réactiver.')
}

/** One invitation SMS per member per day at most. */
const INVITE_INTERVAL_MS = 24 * 60 * 60 * 1000

/** `null` stays `null`; a number goes to the numeric column as a string. */
function toColumn(value: number | null): string | null {
  return value === null ? null : value.toFixed(2)
}

/**
 * Members whose suspension was decided by eBio (FR-033) and not lifted
 * since: their latest staff action is a suspension. Read from the audit
 * trail, which is where that decision is written.
 */
export async function adminSuspendedMemberIds(em: EntityManager, memberIds: string[]): Promise<Set<string>> {
  if (memberIds.length === 0) {
    return new Set()
  }
  const rows = await em.getConnection().execute<Array<{ target_id: string, action: string }>>(
    `SELECT DISTINCT ON (target_id) target_id, action
     FROM audit_logs
     WHERE target_type = 'family_member'
       AND target_id IN (${memberIds.map(() => '?').join(', ')})
       AND action IN ('FAMILY_MEMBER_SUSPENDED', 'FAMILY_MEMBER_RESUMED')
     ORDER BY target_id, created_at DESC`,
    memberIds,
  )
  return new Set(rows.filter(row => row.action === 'FAMILY_MEMBER_SUSPENDED').map(row => row.target_id))
}

/** Compares phone numbers whatever spaces were typed. */
function samePhone(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) {
    return false
  }
  return left.replace(/\s+/g, '') === right.replace(/\s+/g, '')
}

/**
 * Who may spend the family wallet.
 *
 * A member is linked to an account only through a phone number that account
 * proved by SMS (FR-004), the rule « Paniers reçus » already follows: a
 * number merely typed in a profile links nothing.
 */
@Injectable()
export class FamilyMembersService {
  private readonly logger = new Logger(FamilyMembersService.name)

  constructor(
    private readonly em: EntityManager,
    private readonly wallets: FamilyWalletsService,
    private readonly relatives: RelativesService,
    private readonly notifier: FamilyNotifierService,
  ) {}

  /**
   * Adds a relative from the address book, or a new one, saved in the
   * address book too (FR-002). Active at once when an account proved that
   * number, pending with an invitation SMS otherwise.
   */
  async add(payerId: string, input: AddFamilyMember): Promise<FamilyWalletMember> {
    const wallet = await this.wallets.findOpenByPayer(payerId)
    const payer = await this.em.findOneOrFail(User, { id: payerId })

    const picked = input.savedRelativeId
      ? await this.ownedRelative(payerId, input.savedRelativeId)
      : null
    const phone = picked?.phone ?? input.relative?.phone
    const nickname = picked?.nickname ?? input.relative?.nickname
    if (!phone || !nickname) {
      throw new NotFoundException('Proche introuvable dans votre carnet')
    }

    // Checked before anything is written: a refused member must not leave a
    // new entry behind in the address book.
    if (samePhone(phone, payer.phone)) {
      throw memberIsPayer()
    }
    const linkedUser = await this.verifiedAccount(phone)
    if (linkedUser?.id === payerId) {
      throw memberIsPayer()
    }
    const duplicates = await this.em.count(FamilyWalletMember, {
      familyWallet: { id: wallet.id },
      phone,
      status: { $ne: FamilyMemberStatus.REMOVED },
    })
    if (duplicates > 0) {
      throw memberExists()
    }

    let member: FamilyWalletMember
    try {
      member = await this.em.transactional(async (em) => {
        const relative = picked ?? await this.relativeFor(payerId, input)
        const created = em.create(FamilyWalletMember, {
          familyWallet: em.getReference(FamilyWallet, wallet.id),
          savedRelative: em.getReference(SavedRelative, relative.id),
          nickname,
          phone,
          user: linkedUser ? em.getReference(User, linkedUser.id) : null,
          status: linkedUser ? FamilyMemberStatus.ACTIVE : FamilyMemberStatus.PENDING,
          invitedAt: linkedUser ? null : new Date(),
        })
        await em.flush()
        return created
      })
    }
    catch (error) {
      // Two additions of the same number at once: the partial unique index decides.
      if (error instanceof UniqueConstraintViolationException) {
        this.em.clear()
        throw memberExists()
      }
      throw error
    }

    await this.notifier.onMemberAdded(member.id)
    return member
  }

  /** One of the payer's members, not removed; 404 `FAMILY_MEMBER_NONE` otherwise. */
  async findOwned(payerId: string, memberId: string): Promise<FamilyWalletMember> {
    const wallet = await this.wallets.findByPayer(payerId)
    const member = await this.em.findOne(FamilyWalletMember, {
      id: memberId,
      familyWallet: { id: wallet.id },
      status: { $ne: FamilyMemberStatus.REMOVED },
    }, { populate: ['familyWallet'] })
    if (!member) {
      throw memberNone()
    }
    return member
  }

  /**
   * The member's own limits (FR-018). Only the limits sent change; null
   * goes back to the wallet's default. Applies from the next payment.
   */
  async updateLimits(payerId: string, memberId: string, limits: Partial<FamilyLimitsInput>): Promise<FamilyWalletMember> {
    await this.wallets.findOpenByPayer(payerId)
    const member = await this.findOwned(payerId, memberId)
    await assertCategoriesExist(this.em, limits.categoryIds)
    if (limits.monthlyCap !== undefined) {
      member.monthlyCap = toColumn(limits.monthlyCap)
    }
    if (limits.orderMax !== undefined) {
      member.orderMax = toColumn(limits.orderMax)
    }
    if (limits.categoryIds !== undefined) {
      member.categoryIds = limits.categoryIds
    }
    await this.em.flush()
    return member
  }

  /** Pauses one member (FR-006); the others keep paying. Pausing twice changes nothing. */
  async suspend(payerId: string, memberId: string): Promise<FamilyWalletMember> {
    await this.wallets.findOpenByPayer(payerId)
    const member = await this.findOwned(payerId, memberId)
    if (member.status === FamilyMemberStatus.PENDING) {
      throw memberNotActive()
    }
    if (member.status === FamilyMemberStatus.ACTIVE) {
      member.status = FamilyMemberStatus.SUSPENDED
      await this.em.flush()
      await this.notifier.onStatusChanged(member.familyWallet.id, 'MEMBER_SUSPENDED', [member.id])
    }
    return member
  }

  /** Lifts the payer's pause; one decided by eBio stays (403). */
  async resume(payerId: string, memberId: string): Promise<FamilyWalletMember> {
    await this.wallets.findOpenByPayer(payerId)
    const member = await this.findOwned(payerId, memberId)
    if (member.status === FamilyMemberStatus.PENDING) {
      throw memberNotActive()
    }
    if (member.status === FamilyMemberStatus.SUSPENDED) {
      if ((await adminSuspendedMemberIds(this.em, [member.id])).has(member.id)) {
        throw memberSuspendedByAdmin()
      }
      member.status = FamilyMemberStatus.ACTIVE
      await this.em.flush()
      await this.notifier.onStatusChanged(member.familyWallet.id, 'MEMBER_RESUMED', [member.id])
    }
    return member
  }

  /**
   * Takes a member out (FR-006). The row stays, so their past purchases keep
   * their name in the history, and so does the address-book entry.
   */
  async remove(payerId: string, memberId: string): Promise<void> {
    const member = await this.findOwned(payerId, memberId)
    const wasLinked = Boolean(member.user)
    member.status = FamilyMemberStatus.REMOVED
    await this.em.flush()
    if (wasLinked) {
      await this.notifier.onStatusChanged(member.familyWallet.id, 'MEMBER_REMOVED', [member.id])
    }
  }

  /** Sends the invitation SMS again to a pending member, once a day at most. */
  async resendInvitation(payerId: string, memberId: string, now: Date = new Date()): Promise<FamilyWalletMember> {
    await this.wallets.findOpenByPayer(payerId)
    const member = await this.findOwned(payerId, memberId)
    if (member.status !== FamilyMemberStatus.PENDING) {
      throw memberNotPending()
    }
    if (member.invitedAt && now.getTime() - member.invitedAt.getTime() < INVITE_INTERVAL_MS) {
      throw inviteTooSoon()
    }
    member.invitedAt = now
    await this.em.flush()
    await this.notifier.onMemberAdded(member.id)
    return member
  }

  /**
   * A number was just proven by SMS at sign-up: every pending member with
   * that number becomes active on this account (FR-005), and each payer
   * hears it. Never throws, the sign-up stands whatever happens here.
   *
   * A payer is never made a member of their own wallet.
   */
  async linkPendingByPhone(userId: string, phone: string): Promise<number> {
    try {
      const em = this.em.fork()
      const pending = await em.find(FamilyWalletMember, {
        phone,
        status: FamilyMemberStatus.PENDING,
        familyWallet: { status: { $ne: FamilyWalletStatus.CLOSED }, payer: { id: { $ne: userId } } },
      })
      for (const member of pending) {
        member.user = em.getReference(User, userId)
        member.status = FamilyMemberStatus.ACTIVE
      }
      await em.flush()
      for (const member of pending) {
        await this.notifier.onMemberJoined(member.id)
      }
      return pending.length
    }
    catch (error) {
      this.logger.error(`Rattachement des membres en attente au compte ${userId} impossible`, error instanceof Error ? error.stack : String(error))
      return 0
    }
  }

  /**
   * The new relative's address-book entry. A number already in the book is
   * that entry: typing it again is not a reason to refuse the member.
   */
  private async relativeFor(payerId: string, input: AddFamilyMember): Promise<SavedRelative> {
    const data = input.relative!
    const existing = await this.em.findOne(SavedRelative, { owner: { id: payerId }, phone: data.phone })
    return existing ?? this.relatives.create(payerId, data)
  }

  /** The account that proved this number by SMS, if any. */
  private async verifiedAccount(phone: string): Promise<{ id: string } | null> {
    const rows = await this.em.execute<Array<{ id: string }>>(
      `SELECT id FROM users WHERE phone = ? AND phone_verified_at IS NOT NULL LIMIT 1`,
      [phone],
    )
    return rows[0] ?? null
  }

  /** An entry of the payer's address book, never someone else's: 404 otherwise. */
  private async ownedRelative(ownerId: string, relativeId: string): Promise<SavedRelative> {
    const relative = await this.em.findOne(SavedRelative, { id: relativeId, owner: { id: ownerId } })
    if (!relative) {
      throw new NotFoundException('Proche introuvable dans votre carnet')
    }
    return relative
  }
}
