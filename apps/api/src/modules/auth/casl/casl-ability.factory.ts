import type { MongoAbility } from '@casl/ability'
import { AbilityBuilder, createMongoAbility } from '@casl/ability'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable } from '@nestjs/common'
import { User, UserRole } from '../auth.entity'
import { Role } from '../entities/role.entity'

export type Subjects
  = | 'Product'
    | 'ProductUnit'
    | 'Order'
    | 'Payment'
    | 'PaymentMethod'
    | 'Supplier'
    | 'User'
    | 'Review'
    | 'Conversation'
    | 'Message'
    | 'CommunityGroup'
    | 'Publication'
    | 'TrainingModule'
    | 'Notification'
    | 'ContentReport'
    | 'Badge'
    | 'Category'
    | 'Banner'
    | 'LandingContent'
    | 'Delivery'
    | 'CourierProfile'
    // Back-office only subjects (see admin-permissions.catalog.ts)
    | 'Withdrawal'
    | 'Promotion'
    | 'PromoCode'
    | 'Settings'
    | 'Staff'
    | 'all'

export type Actions = 'create' | 'read' | 'update' | 'delete' | 'manage'

export type AppAbility = MongoAbility<[Actions, Subjects]>

export interface GrantedPermission {
  action: Actions
  subject: Subjects
}

@Injectable()
export class CaslAbilityFactory {
  constructor(private readonly em: EntityManager) {}

  /**
   * The enum role is the audience (buyer, supplier, courier, staff) and keeps
   * its hardcoded abilities for the apps. A staff member (`ADMIN`) draws its
   * rights from the DB role assigned by the back-office; without one it is a
   * super administrator, which keeps the historical accounts working.
   */
  async createForUser(user: User): Promise<AppAbility> {
    const builder = new AbilityBuilder<AppAbility>(createMongoAbility)
    const { can, build } = builder

    if (user.role === UserRole.ADMIN) {
      const role = await this.loadStaffRole(user)
      if (!role) {
        can('manage', 'all')
        return build()
      }
      for (const permission of role.permissions.getItems()) {
        const conditions = permission.conditions
          ? this.interpolateConditions(permission.conditions, user)
          : undefined
        // eslint-disable-next-line ts/no-explicit-any
        can(permission.action as Actions, permission.subject as Subjects, conditions as any)
      }
      return build()
    }

    // App users: the DB role (seeded demo accounts carry one) is ignored, the
    // enum alone decides. Keeping both sources for them made abilities drift.
    switch (user.role) {
      case UserRole.SUPPLIER:
        // Also covers a supplier validated as courier: the courier app must
        // keep working while the role stays SUPPLIER.
        can('create', 'Product')
        can('read', 'Product')
        can('update', 'Product')
        can('delete', 'Product')
        can('read', 'Supplier')
        can('update', 'Supplier')
        can('create', 'Order')
        can('read', 'Order')
        can('update', 'Order')
        can('create', 'Payment')
        can('read', 'Payment')
        can('create', 'Review')
        can('read', 'Review')
        can('read', 'Conversation')
        can('create', 'Conversation')
        can('create', 'Message')
        can('read', 'Message')
        can('read', 'Review')
        can('read', 'CommunityGroup')
        can('create', 'Publication')
        can('read', 'Publication')
        can('read', 'TrainingModule')

        can('read', 'Notification')
        can('create', 'ContentReport')
        can('read', 'Category')
        can('create', 'Supplier')
        can('read', 'Delivery')
        can('update', 'Delivery')
        can('read', 'CourierProfile')
        can('update', 'CourierProfile')
        break

      case UserRole.COURIER:
        // A courier is still a buyer in the client app: the whole buyer
        // baseline applies, plus the fleet-specific abilities.
        can('read', 'Product')
        can('read', 'Supplier')
        can('read', 'Category')
        can('create', 'Order')
        can('read', 'Order')
        can('update', 'Order')
        can('create', 'Payment')
        can('read', 'Payment')
        can('read', 'Conversation')
        can('create', 'Conversation')
        can('create', 'Message')
        can('read', 'Message')
        can('create', 'Review')
        can('read', 'Review')
        can('read', 'CommunityGroup')
        can('create', 'Publication')
        can('read', 'Publication')
        can('read', 'TrainingModule')
        can('read', 'Notification')
        can('create', 'ContentReport')
        can('create', 'Supplier')
        can('read', 'Delivery')
        can('update', 'Delivery')
        can('read', 'CourierProfile')
        can('update', 'CourierProfile')
        break

      case UserRole.BUYER:
      default:
        can('read', 'Product')
        can('read', 'Supplier')
        can('read', 'Category')
        can('create', 'Order')
        can('read', 'Order')
        can('update', 'Order')
        can('create', 'Payment')
        can('read', 'Payment')
        can('read', 'Conversation')
        can('create', 'Conversation')
        can('create', 'Message')
        can('read', 'Message')
        can('create', 'Review')
        can('read', 'Review')
        can('read', 'CommunityGroup')
        can('create', 'Publication')
        can('read', 'Publication')
        can('read', 'TrainingModule')
        can('read', 'Notification')
        can('create', 'ContentReport')
        can('create', 'Supplier')
        can('read', 'Delivery')
        can('create', 'CourierProfile')
        break
    }

    return build()
  }

  /**
   * Flat list of what the user may do, for clients that gate their UI
   * (back-office nav, buttons). Only staff members get an explicit list; app
   * users rely on their audience and get an empty array.
   */
  async listGrantedPermissions(user: User): Promise<GrantedPermission[]> {
    if (user.role !== UserRole.ADMIN) {
      return []
    }
    const role = await this.loadStaffRole(user)
    if (!role) {
      return [{ action: 'manage', subject: 'all' }]
    }
    return role.permissions.getItems().map(p => ({
      action: p.action as Actions,
      subject: p.subject as Subjects,
    }))
  }

  private async loadStaffRole(user: User): Promise<Role | null> {
    if (!user.userRole) {
      return null
    }
    return this.em.findOne(
      Role,
      { id: (user.userRole as unknown as Role).id ?? user.userRole },
      { populate: ['permissions'] },
    )
  }

  private interpolateConditions(
    conditions: Record<string, unknown>,
    user: User,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(conditions)) {
      if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
        const path = value.slice(2, -1)
        result[key] = path === 'user.id' ? user.id : undefined
      }
      else {
        result[key] = value
      }
    }
    return result
  }
}
