import type { FamilyLimits, FamilyRefusalInput } from './family-limits'
import { describe, expect, it } from 'vitest'
import { effectiveLimits, monthStart, refusalFor, spendable } from './family-limits'

const FRUITS = '6f1b4c7e-0000-4000-8000-000000000001'
const LEGUMES = '6f1b4c7e-0000-4000-8000-000000000002'
const BOISSONS = '6f1b4c7e-0000-4000-8000-000000000003'

const NO_LIMITS: FamilyLimits = { monthlyCap: null, orderMax: null, categoryIds: null }

function input(overrides: Partial<FamilyRefusalInput> = {}): FamilyRefusalInput {
  return {
    wallet: { status: 'ACTIVE' },
    member: { status: 'ACTIVE' },
    effective: NO_LIMITS,
    spent: 0,
    balance: 50_000,
    total: 5_000,
    productCategoryIds: [{ productId: 'tomates', categoryId: LEGUMES }],
    ...overrides,
  }
}

describe('limites du portefeuille famille', () => {
  describe('limites effectives', () => {
    it('prend la limite propre du membre quand elle existe', () => {
      const effective = effectiveLimits(
        { defaultMonthlyCap: '2000.00', defaultOrderMax: '1500.00', defaultCategoryIds: [FRUITS] },
        { monthlyCap: '4000.00', orderMax: null, categoryIds: [LEGUMES] },
      )

      expect(effective).toEqual({ monthlyCap: 4000, orderMax: 1500, categoryIds: [LEGUMES] })
    })

    it('reprend la limite par défaut quand la limite propre est vide', () => {
      const effective = effectiveLimits(
        { defaultMonthlyCap: '2000.00', defaultOrderMax: null, defaultCategoryIds: [FRUITS] },
        { monthlyCap: null, orderMax: undefined, categoryIds: null },
      )

      expect(effective).toEqual({ monthlyCap: 2000, orderMax: null, categoryIds: [FRUITS] })
    })

    it('sans aucune limite, seul le solde compte', () => {
      const effective = effectiveLimits({}, {})

      expect(effective).toEqual(NO_LIMITS)
      expect(spendable(12_000, effective, 30_000)).toBe(12_000)
      expect(refusalFor(input({ effective, balance: 12_000, total: 12_000 }))).toBeNull()
      expect(refusalFor(input({ effective, balance: 12_000, total: 12_001 }))).toEqual({ reason: 'INSUFFICIENT' })
    })
  })

  describe('montant dépensable', () => {
    it('est le plus petit du solde et du reste du plafond', () => {
      const effective = { ...NO_LIMITS, monthlyCap: 40_000 }

      expect(spendable(64_000, effective, 25_000)).toBe(15_000)
      expect(spendable(10_000, effective, 25_000)).toBe(10_000)
    })

    it('ne descend jamais sous zéro', () => {
      expect(spendable(64_000, { ...NO_LIMITS, monthlyCap: 10_000 }, 12_000)).toBe(0)
      expect(spendable(-500, NO_LIMITS, 0)).toBe(0)
    })
  })

  describe('refus', () => {
    it('suit l\'ordre : inactif, catégorie, maximum par commande, plafond, solde', () => {
      const everythingWrong = input({
        effective: { monthlyCap: 1_000, orderMax: 2_000, categoryIds: [FRUITS] },
        spent: 900,
        balance: 100,
        total: 5_000,
      })

      expect(refusalFor({ ...everythingWrong, member: { status: 'SUSPENDED' } })).toEqual({ reason: 'INACTIVE' })
      expect(refusalFor({ ...everythingWrong, wallet: { status: 'SUSPENDED' } })).toEqual({ reason: 'INACTIVE' })
      expect(refusalFor(everythingWrong)).toEqual({ reason: 'CATEGORY', blockedProductIds: ['tomates'] })

      const categoryFine = { ...everythingWrong, effective: { ...everythingWrong.effective, categoryIds: [LEGUMES] } }
      expect(refusalFor(categoryFine)).toEqual({ reason: 'ORDER_MAX' })

      const orderFine = { ...categoryFine, effective: { ...categoryFine.effective, orderMax: null } }
      expect(refusalFor(orderFine)).toEqual({ reason: 'MONTHLY_CAP' })

      const capFine = { ...orderFine, effective: { ...orderFine.effective, monthlyCap: null } }
      expect(refusalFor(capFine)).toEqual({ reason: 'INSUFFICIENT' })

      expect(refusalFor({ ...capFine, balance: 5_000 })).toBeNull()
    })

    it('signale chacun des produits hors des catégories autorisées, une seule fois', () => {
      const refusal = refusalFor(input({
        effective: { ...NO_LIMITS, categoryIds: [FRUITS, LEGUMES] },
        productCategoryIds: [
          { productId: 'mangues', categoryId: FRUITS },
          { productId: 'bissap', categoryId: BOISSONS },
          { productId: 'tomates', categoryId: LEGUMES },
          { productId: 'bissap', categoryId: BOISSONS },
          { productId: 'sans-categorie', categoryId: null },
        ],
      }))

      expect(refusal).toEqual({ reason: 'CATEGORY', blockedProductIds: ['bissap', 'sans-categorie'] })
    })

    it('accepte une commande qui atteint exactement le plafond restant', () => {
      const effective = { ...NO_LIMITS, monthlyCap: 4_000 }

      expect(refusalFor(input({ effective, spent: 1_000, total: 3_000 }))).toBeNull()
      expect(refusalFor(input({ effective, spent: 1_000, total: 3_001 }))).toEqual({ reason: 'MONTHLY_CAP' })
    })
  })

  describe('début du mois au Bénin', () => {
    it('le 1er novembre à 0 h 30 heure de Paris, le mois de novembre a commencé au Bénin', () => {
      // Paris is UTC+1 in November, like Cotonou.
      const now = new Date('2026-10-31T23:30:00Z')

      expect(monthStart(now).toISOString()).toBe('2026-10-31T23:00:00.000Z')
    })

    it('le 1er juillet à 0 h 30 heure de Paris, c\'est encore juin au Bénin', () => {
      // Paris is UTC+2 in summer: 0 h 30 in Paris is 23 h 30 on June 30 in Cotonou.
      const now = new Date('2026-06-30T22:30:00Z')

      expect(monthStart(now).toISOString()).toBe('2026-05-31T23:00:00.000Z')
    })

    it('change de mois à minuit pile au Bénin', () => {
      expect(monthStart(new Date('2026-11-30T22:59:59Z')).toISOString()).toBe('2026-10-31T23:00:00.000Z')
      expect(monthStart(new Date('2026-11-30T23:00:00Z')).toISOString()).toBe('2026-11-30T23:00:00.000Z')
    })
  })
})
