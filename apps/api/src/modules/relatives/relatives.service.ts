import type { CreateRelative, UpdateRelative } from './contracts/relative.contract'
import { UniqueConstraintViolationException } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql'
import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common'
import { User } from '../auth/auth.entity'
import { RELATIVES_LIMIT } from './contracts/relative.contract'
import { SavedRelative } from './entities/saved-relative.entity'

function phoneExists(): HttpException {
  return new HttpException({
    statusCode: HttpStatus.CONFLICT,
    code: 'RELATIVE_PHONE_EXISTS',
    message: 'Ce numéro est déjà dans vos proches',
  }, HttpStatus.CONFLICT)
}

function limitReached(): HttpException {
  return new HttpException({
    statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    code: 'RELATIVES_LIMIT_REACHED',
    message: `Vous avez déjà ${RELATIVES_LIMIT} proches enregistrés. Supprimez-en un pour en ajouter un autre.`,
  }, HttpStatus.UNPROCESSABLE_ENTITY)
}

/**
 * The payer's address book of relatives.
 *
 * Owner-only: an entry of someone else answers 404, as if it did not exist.
 * Editing or deleting an entry never touches a past checkout — those copied
 * what they used, and their link is `ON DELETE SET NULL`.
 */
@Injectable()
export class RelativesService {
  constructor(private readonly em: EntityManager) {}

  async list(ownerId: string): Promise<SavedRelative[]> {
    return this.em.find(SavedRelative, { owner: { id: ownerId } }, { orderBy: { createdAt: 'DESC' } })
  }

  async create(ownerId: string, data: CreateRelative): Promise<SavedRelative> {
    const count = await this.em.count(SavedRelative, { owner: { id: ownerId } })
    if (count >= RELATIVES_LIMIT) {
      throw limitReached()
    }
    await this.assertPhoneFree(ownerId, data.phone)

    const relative = this.em.create(SavedRelative, {
      owner: this.em.getReference(User, ownerId),
      ...data,
    })
    await this.flushOrConflict(relative)
    return relative
  }

  async update(ownerId: string, relativeId: string, data: UpdateRelative): Promise<SavedRelative> {
    const relative = await this.owned(ownerId, relativeId)
    if (data.phone !== undefined && data.phone !== relative.phone) {
      await this.assertPhoneFree(ownerId, data.phone)
    }
    this.em.assign(relative, data)
    await this.flushOrConflict(relative)
    return relative
  }

  async remove(ownerId: string, relativeId: string): Promise<void> {
    const relative = await this.owned(ownerId, relativeId)
    await this.em.remove(relative).flush()
  }

  private async owned(ownerId: string, relativeId: string): Promise<SavedRelative> {
    const relative = await this.em.findOne(SavedRelative, { id: relativeId, owner: { id: ownerId } })
    if (!relative) {
      throw new NotFoundException('Proche introuvable dans votre carnet')
    }
    return relative
  }

  private async assertPhoneFree(ownerId: string, phone: string): Promise<void> {
    const existing = await this.em.count(SavedRelative, { owner: { id: ownerId }, phone })
    if (existing > 0) {
      throw phoneExists()
    }
  }

  /** Two saves at once can both pass the check: the unique index decides. */
  private async flushOrConflict(relative: SavedRelative): Promise<void> {
    try {
      await this.em.persist(relative).flush()
    }
    catch (error) {
      if (error instanceof UniqueConstraintViolationException) {
        this.em.clear()
        throw phoneExists()
      }
      throw error
    }
  }
}
