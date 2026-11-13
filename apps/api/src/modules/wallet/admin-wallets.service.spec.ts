import { describe, expect, it } from 'vitest'
import { buildWalletConditions } from './admin-wallets.service'

describe('buildWalletConditions', () => {
  it('never lists eBio own accounts', () => {
    expect(buildWalletConditions({}).where).toBe('w.platform_account IS NULL')
  })

  it('combines owner, balance and search, the search bound', () => {
    const { where, values } = buildWalletConditions({ q: 'koffi', ownerType: 'SUPPLIER', balance: 'negative' })
    expect(where).toContain('w.supplier_id IS NOT NULL')
    expect(where).toContain('w.balance < 0')
    expect(where).not.toContain('koffi')
    expect(values).toEqual(['%koffi%'])
  })

  it('filters family wallets', () => {
    expect(buildWalletConditions({ ownerType: 'FAMILY' }).where).toContain('w.family_wallet_id IS NOT NULL')
  })
})
