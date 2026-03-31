import type { UpdateUser } from './contracts/user.contract'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, NotFoundException } from '@nestjs/common'
import { User, UserRole } from '../auth/auth.entity'

@Injectable()
export class UsersService {
  constructor(private readonly em: EntityManager) {}

  async findById(id: string): Promise<User> {
    const user = await this.em.findOne(User, { id })
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
