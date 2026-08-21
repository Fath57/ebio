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
    | 'all'

export type Actions = 'create' | 'read' | 'update' | 'delete' | 'manage'

export type AppAbility = MongoAbility<[Actions, Subjects]>

@Injectable()
export class CaslAbilityFactory {
  constructor(private readonly em: EntityManager) {}

  async createForUser(user: User): Promise<AppAbility> {
    const builder = new AbilityBuilder<AppAbility>(createMongoAbility)
    const { can, build } = builder

    // Try to load role with permissions from DB
    if (user.userRole) {
      const role = await this.em.findOne(
        Role,
        { id: (user.userRole as unknown as Role).id ?? user.userRole },
        { populate: ['permissions'] },
      )

      if (role) {
        for (const permission of role.permissions.getItems()) {
          const conditions = permission.conditions
            ? this.interpolateConditions(permission.conditions, user)
            : undefined
          // eslint-disable-next-line ts/no-explicit-any
          can(permission.action as Actions, permission.subject as Subjects, conditions as any)
        }
        return build()
      }
    }

    // Fallback to enum-based role definitions
    switch (user.role) {
      case UserRole.ADMIN:
        can('manage', 'all')
        break

      case UserRole.SUPPLIER:
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
        break
    }

    return build()
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
