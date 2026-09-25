import type { UpdateUser } from './contracts/user.contract'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, NotFoundException } from '@nestjs/common'
import { User, UserRole } from '../auth/auth.entity'

@Injectable()
export class UsersService {
  constructor(private readonly em: EntityManager) {}

  async findById(id: string): Promise<User> {
    // The staff role rides along for /users/me (null for app users).
    const user = await this.em.findOne(User, { id }, { populate: ['userRole'] })
    if (!user)
      throw new NotFoundException('User not found')
    return user
  }

  async findByPhone(phone: string): Promise<User | null> {
    return this.em.findOne(User, { phone })
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.em.findOne(User, { email })
  }

  /**
   * The version of the documents in force.
   *
   * A constant rather than a setting: changing the texts happens by deploying,
   * and the record has to say what was accepted that day. No re-consent is
   * asked of existing accounts when it changes.
   */
  private static readonly TERMS_VERSION = '2026-09'

  /**
   * Record the agreement, once and for all.
   *
   * The first acceptance is never overwritten: what matters is the moment
   * agreement was given, not the last time it was restated.
   */
  async acceptTerms(id: string, from: string): Promise<User> {
    const user = await this.findById(id)
    if (user.termsAcceptedAt) {
      return user
    }

    user.termsAcceptedAt = new Date()
    user.termsAcceptedFrom = from
    user.termsVersion = UsersService.TERMS_VERSION
    await this.em.flush()
    return user
  }

  async update(id: string, data: UpdateUser): Promise<User> {
    const user = await this.findById(id)
    if (data.name !== undefined)
      user.name = data.name
    if (data.email !== undefined)
      user.email = data.email
    if (data.phone !== undefined)
      user.phone = data.phone
    if (data.image !== undefined)
      user.image = data.image
    if (data.deviceId !== undefined)
      user.deviceId = data.deviceId
    await this.em.flush()
    return user
  }

  async activateSupplierRole(userId: string): Promise<User> {
    const user = await this.findById(userId)
    user.role = UserRole.SUPPLIER
    await this.em.flush()
    return user
  }
}
