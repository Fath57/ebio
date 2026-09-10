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
    | 'Notification'
    | 'ContentReport'
    | 'Badge'
    | 'Category'
    | 'Delivery'
    | 'CourierProfile'
    | 'Banner'
    | 'LandingContent'
    | 'Withdrawal'
    | 'PromoCode'
    | 'Promotion'
    | 'Settings'
    | 'Staff'
    | 'all'

export type AppAbility = PureAbility<[Actions, Subjects]>

export type UserRole = 'BUYER' | 'SUPPLIER' | 'COURIER' | 'ADMIN'

export interface ServerPermission {
  action: string
  subject: string
}

/**
 * Builds the ability of a staff member from the permissions the API returns
 * on `GET /users/me`. A super administrator gets `manage all`.
 */
export function createAbilityFromPermissions(permissions: ServerPermission[]): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(PureAbility)

  for (const permission of permissions)
    can(permission.action as Actions, permission.subject as Subjects)

  return build()
}

/** Hardcoded abilities for app users; staff abilities come from the server. */
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
      can('read', 'Notification')
      can('read', 'Category')
      break

    case 'ADMIN':
      can('manage', 'all')
      break

    case 'BUYER':
    case 'COURIER':
      // App-only roles: nothing to do in the back office.
      break
  }

  return build()
}
