import type { MongoAbility, RawRuleOf } from '@casl/ability'
import { createMongoAbility } from '@casl/ability'

export type Actions = 'create' | 'read' | 'update' | 'delete' | 'manage'
export type Subjects
  = | 'Product' | 'Order' | 'Payment' | 'Supplier' | 'User'
    | 'Review' | 'Conversation' | 'Message' | 'CommunityGroup'
    | 'Publication' | 'TrainingModule'
    | 'Notification' | 'ContentReport' | 'Badge' | 'Category' | 'all'

export type AppAbility = MongoAbility<[Actions, Subjects]>

type AppRawRule = RawRuleOf<AppAbility>

export function createAbility(permissions: Array<{ action: string, subject: string }> = []): AppAbility {
  return createMongoAbility<AppAbility>(
    permissions.map(p => ({ action: p.action as Actions, subject: p.subject as Subjects })) as AppRawRule[],
  )
}

export function createAbilityForRole(role: string): AppAbility {
  switch (role) {
    case 'ADMIN':
      return createMongoAbility<AppAbility>([{ action: 'manage', subject: 'all' }] as AppRawRule[])
    case 'SUPPLIER':
      return createMongoAbility<AppAbility>([
        { action: 'create', subject: 'Product' },
        { action: 'read', subject: 'Product' },
        { action: 'update', subject: 'Product' },
        { action: 'delete', subject: 'Product' },
        { action: 'read', subject: 'Supplier' },
        { action: 'update', subject: 'Supplier' },
        { action: 'read', subject: 'Order' },
        { action: 'update', subject: 'Order' },
        { action: 'read', subject: 'Conversation' },
        { action: 'create', subject: 'Message' },
        { action: 'read', subject: 'Review' },
        { action: 'read', subject: 'Notification' },
      ] as AppRawRule[])
    case 'MODERATOR':
      return createMongoAbility<AppAbility>([
        { action: 'read', subject: 'Product' },
        { action: 'update', subject: 'Product' },
        { action: 'read', subject: 'User' },
        { action: 'read', subject: 'Review' },
        { action: 'delete', subject: 'Review' },
        { action: 'read', subject: 'ContentReport' },
        { action: 'update', subject: 'ContentReport' },
        { action: 'read', subject: 'Publication' },
        { action: 'update', subject: 'Publication' },
        { action: 'delete', subject: 'Publication' },
        { action: 'read', subject: 'Notification' },
      ] as AppRawRule[])
    case 'BUYER':
    default:
      return createMongoAbility<AppAbility>([
        { action: 'read', subject: 'Product' },
        { action: 'read', subject: 'Supplier' },
        { action: 'create', subject: 'Order' },
        { action: 'read', subject: 'Order' },
        { action: 'create', subject: 'Review' },
        { action: 'read', subject: 'Review' },
        { action: 'read', subject: 'Notification' },
      ] as AppRawRule[])
  }
}
