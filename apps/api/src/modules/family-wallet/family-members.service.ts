import type { AddFamilyMember } from './contracts/family-wallet.contract'
import { UniqueConstraintViolationException } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql'
import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common'
import { User } from '../auth/auth.entity'
import { SavedRelative } from '../relatives/entities/saved-relative.entity'
import { RelativesService } from '../relatives/relatives.service'
import { FamilyMemberStatus, FamilyWalletMember } from './entities/family-wallet-member.entity'
import { FamilyWallet } from './entities/family-wallet.entity'
import { FamilyNotifierService } from './family-notifier.service'
import { familyError } from './family-texts'
import { FamilyWalletsService } from './family-wallets.service'

function memberExists() {
  return familyError(HttpStatus.CONFLICT, 'FAMILY_MEMBER_EXISTS', 'Ce proche est déjà membre de votre portefeuille famille.')
}

function memberIsPayer() {
  return familyError(HttpStatus.BAD_REQUEST, 'FAMILY_MEMBER_IS_PAYER', 'Vous ne pouvez pas être membre de votre propre portefeuille famille.')
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
  constructor(
    private readonly em: EntityManager,
    private readonly wallets: FamilyWalletsService,
    private readonly relatives: RelativesService,
    private readonly notifier: FamilyNotifierService,
  ) {}

  /**
   * Adds a relative from the address book, or a new one — saved in the
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
