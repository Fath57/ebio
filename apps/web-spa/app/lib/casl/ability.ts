import { AbilityBuilder, PureAbility } from '@casl/ability'

export type Actions = 'create' | 'read' | 'update' | 'delete' | 'manage'
export type Subjects
  = | 'Product'
    | 'ProductUnit'
    | 'Order'
    | 'Payment'
    | 'Supplier'
    | 'User'
    | 'Review'
    | 'Conversation'
    | 'Message'
    | 'CommunityGroup'
    | 'Publication'
    | 'TrainingModule'
    | 'Subscription'
    | 'Notification'
    | 'ContentReport'
    | 'Badge'
    | 'Category'
    | 'all'

export type AppAbility = PureAbility<[Actions, Subjects]>

export type UserRole = 'SUPPLIER' | 'ADMIN'

export function createAbilityForRole(role: UserRole): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(PureAbility)

  switch (role) {
    case 'SUPPLIER':
      can('create', 'Product')
      can('read', 'Product')
      can('update', 'Product')
      can('delete', 'Product')
      can('read', 'Supplier')
      can('update', 'Supplier')
      can('read', 'Order')
      can('update', 'Order')
      can('read', 'Conversation')
      can('create', 'Conversation')
      can('create', 'Message')
      can('read', 'Message')
      can('read', 'Review')
      can('read', 'CommunityGroup')
      can('create', 'Publication')
      can('read', 'Publication')
      can('read', 'TrainingModule')
      can('read', 'Subscription')
      can('create', 'Subscription')
      can('update', 'Subscription')
      can('read', 'Notification')
      can('read', 'Category')
      break

    case 'ADMIN':
      can('manage', 'all')
      break
  }

  return build()
}
