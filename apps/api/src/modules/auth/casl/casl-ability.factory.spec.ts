import { describe, expect, it, vi } from 'vitest'
import { UserRole } from '../auth.entity'
import { CaslAbilityFactory } from './casl-ability.factory'

interface TestPermission {
  action: string
  subject: string
  conditions?: Record<string, unknown>
}

function buildFactory(rolePermissions: TestPermission[] | null) {
  const role = rolePermissions === null
    ? null
    : { id: 'role-1', permissions: { getItems: () => rolePermissions } }
  const em = { findOne: vi.fn().mockResolvedValue(role) }
  return { factory: new CaslAbilityFactory(em as never), em }
}

function buildUser(role: UserRole, withDbRole: boolean) {
  return {
    id: 'user-1',
    role,
    userRole: withDbRole ? { id: 'role-1' } : undefined,
  }
}

describe('createForUser', () => {
  it('adds the DB role of a staff member on top of the buyer baseline', async () => {
    const { factory } = buildFactory([
      { action: 'read', subject: 'Order' },
      { action: 'manage', subject: 'Delivery' },
    ])

    const ability = await factory.createForUser(buildUser(UserRole.ADMIN, true) as never)

    expect(ability.can('read', 'Order')).toBe(true)
    expect(ability.can('manage', 'Delivery')).toBe(true)
    // `manage` covers every action on its subject, nothing more.
    expect(ability.can('update', 'Delivery')).toBe(true)
    expect(ability.can('manage', 'Order')).toBe(false)
    expect(ability.can('manage', 'all')).toBe(false)
    // A staff member is a person too: ordering in the client app never
    // depends on a back-office role mentioning Order.
    expect(ability.can('create', 'Order')).toBe(true)
    expect(ability.can('read', 'Supplier')).toBe(true)
    // The baseline stays app-side: it grants no back-office ability.
    expect(ability.can('manage', 'Supplier')).toBe(false)
    expect(ability.can('manage', 'User')).toBe(false)
  })

  it('treats a staff member without DB role as super administrator', async () => {
    const { factory, em } = buildFactory(null)

    const ability = await factory.createForUser(buildUser(UserRole.ADMIN, false) as never)

    expect(ability.can('manage', 'all')).toBe(true)
    expect(ability.can('manage', 'Staff')).toBe(true)
    expect(em.findOne).not.toHaveBeenCalled()
  })

  it('ignores the DB role of app users and applies their audience abilities', async () => {
    // A seeded buyer carries a BUYER row lacking update:Delivery; the enum
    // path is the one that must win for the courier app to work.
    const { factory, em } = buildFactory([{ action: 'read', subject: 'Product' }])

    const ability = await factory.createForUser(buildUser(UserRole.COURIER, true) as never)

    expect(ability.can('update', 'Delivery')).toBe(true)
    expect(ability.can('update', 'CourierProfile')).toBe(true)
    expect(ability.can('manage', 'Supplier')).toBe(false)
    expect(em.findOne).not.toHaveBeenCalled()
  })
})

describe('listGrantedPermissions', () => {
  it('returns the flat DB permissions of a staff member', async () => {
    const { factory } = buildFactory([{ action: 'read', subject: 'Order' }])

    const granted = await factory.listGrantedPermissions(buildUser(UserRole.ADMIN, true) as never)

    expect(granted).toEqual([{ action: 'read', subject: 'Order' }])
  })

  it('returns manage:all for a super administrator and nothing for app users', async () => {
    const { factory } = buildFactory(null)

    expect(await factory.listGrantedPermissions(buildUser(UserRole.ADMIN, false) as never))
      .toEqual([{ action: 'manage', subject: 'all' }])
    expect(await factory.listGrantedPermissions(buildUser(UserRole.SUPPLIER, true) as never)).toEqual([])
  })
})
