import type { DepartureFacts, PackLine, RateTerms } from './terroir-math'
import { describe, expect, it } from 'vitest'
import {
  availableDepartures,
  estimateWeight,
  fillRatio,
  insurancePrice,
  marginKg,
  orderDeadline,
  packSplit,
  shippingPrice,
  supplementFor,
} from './terroir-math'

const RATE: RateTerms = { pricePerKg: 8500, minBilledKg: 5, maxWeightKg: 30, homeDeliveryFee: 3900 }
const NOW = new Date('2026-11-13T10:00:00Z')

function departure(overrides: Partial<DepartureFacts> = {}): DepartureFacts {
  return {
    id: 'dep',
    status: 'OPEN',
    departsOn: '2026-11-22',
    depositDeadline: new Date('2026-11-20T18:00:00Z'),
    capacityKg: 100,
    reservedG: 0,
    rates: [{ country: 'FR', ...RATE }],
    ...overrides,
  }
}

describe('terroir, poids et prix', () => {
  it('estime le poids avec l\'emballage forfaitaire, rien pour un panier vide', () => {
    expect(estimateWeight([{ weightG: 250, quantity: 2 }, { weightG: 1200, quantity: 1 }], 300)).toBe(2000)
    expect(estimateWeight([], 300)).toBe(0)
  })

  it('facture au moins le minimum, puis au poids, arrondi au franc supérieur', () => {
    expect(shippingPrice(1800, RATE)).toBe(42_500)
    expect(shippingPrice(6200, RATE)).toBe(52_700)
    // 3,2 kg × 8 500 = 27 200 exactly: no franc added by float noise.
    expect(shippingPrice(3200, { pricePerKg: 8500, minBilledKg: 0 })).toBe(27_200)
    expect(shippingPrice(3201, { pricePerKg: 8500, minBilledKg: 0 })).toBe(27_209)
  })

  it('indique la marge restante sous le minimum facturé', () => {
    expect(marginKg(3200, RATE)).toBe(1.8)
    expect(marginKg(6000, RATE)).toBe(0)
  })

  it('calcule l\'assurance en pourcentage de la valeur, jamais sous le minimum', () => {
    expect(insurancePrice(60_000, 300, 1000)).toBe(1800)
    expect(insurancePrice(10_000, 300, 1000)).toBe(1000)
    expect(insurancePrice(60_001, 300, 1000)).toBe(1801)
  })
})

describe('terroir, départs proposables', () => {
  it('propose un départ ouvert qui dessert le pays, avec son prix et sa date limite', () => {
    const [offer] = availableDepartures([departure()], 'FR', 1800, NOW, 3)

    expect(offer.departure.id).toBe('dep')
    expect(offer.shippingPrice).toBe(42_500)
    expect(offer.orderBefore.toISOString()).toBe('2026-11-17T18:00:00.000Z')
  })

  it('exclut un départ échu compte tenu du délai de collecte', () => {
    const tooLate = departure({ depositDeadline: new Date('2026-11-15T18:00:00Z') })
    expect(availableDepartures([tooLate], 'FR', 1800, NOW, 3)).toEqual([])
    expect(availableDepartures([tooLate], 'FR', 1800, NOW, 0)).toHaveLength(1)
  })

  it('exclut un départ plein, fermé, d\'un autre pays ou trop lourd pour le colis', () => {
    expect(availableDepartures([departure({ reservedG: 99_000 })], 'FR', 1800, NOW, 3)).toEqual([])
    expect(availableDepartures([departure({ reservedG: 98_000 })], 'FR', 2000, NOW, 3)).toHaveLength(1)
    expect(availableDepartures([departure({ status: 'FULL' })], 'FR', 1800, NOW, 3)).toEqual([])
    expect(availableDepartures([departure()], 'BE', 1800, NOW, 3)).toEqual([])
    expect(availableDepartures([departure()], 'FR', 31_000, NOW, 3)).toEqual([])
    expect(availableDepartures([departure({ capacityKg: null, reservedG: 10_000_000 })], 'FR', 1800, NOW, 3)).toHaveLength(1)
  })

  it('trie les départs du plus proche au plus lointain', () => {
    const later = departure({ id: 'later', departsOn: '2026-12-06', depositDeadline: new Date('2026-12-04T18:00:00Z') })
    const sooner = departure({ id: 'sooner' })
    expect(availableDepartures([later, sooner], 'FR', 1800, NOW, 3).map(offer => offer.departure.id)).toEqual(['sooner', 'later'])
  })

  it('calcule la date limite de commande', () => {
    expect(orderDeadline(new Date('2026-11-20T18:00:00Z'), 3).toISOString()).toBe('2026-11-17T18:00:00.000Z')
  })
})

describe('terroir, remplissage et complément', () => {
  it('rapporte les kilos réservés à la capacité', () => {
    expect(fillRatio(82_400, 100)).toBe(0.824)
    expect(fillRatio(5_000, null)).toBeNull()
  })

  it('n\'exige un complément qu\'au-delà du seuil de tolérance', () => {
    const rate = { pricePerKg: 8500, minBilledKg: 0 }
    // 10 % of 5 kg: up to 5,5 kg eBio absorbs.
    expect(supplementFor(5000, 5500, rate, 10)).toBeNull()
    expect(supplementFor(5000, 6200, rate, 10)).toBe(10_200)
  })

  it('n\'exige rien quand le poids réel reste sous le minimum facturé', () => {
    expect(supplementFor(2000, 3000, RATE, 10)).toBeNull()
  })
})

describe('terroir, packs', () => {
  const lines: PackLine[] = [
    { productId: 'karite', variantId: null, supplierId: 'fatou', unitPrice: 3000, quantity: 2 },
    { productId: 'moringa', variantId: null, supplierId: 'koffi', unitPrice: 2500, quantity: 1 },
  ]

  it('paie chaque boutique à son prix ; eBio compense un pack moins cher', () => {
    const split = packSplit({ price: 7500, supplierId: null }, lines)

    expect(split.bySupplier).toEqual([
      { supplierId: 'fatou', lines: [lines[0]], total: 6000 },
      { supplierId: 'koffi', lines: [lines[1]], total: 2500 },
    ])
    expect(split.linesTotal).toBe(8500)
    expect(split.compensation).toBe(1000)
    expect(split.margin).toBe(0)
  })

  it('garde la marge d\'un pack eBio plus cher que ses produits', () => {
    const split = packSplit({ price: 9500, supplierId: null }, lines, 2)

    expect(split.bySupplier[0].lines[0].quantity).toBe(4)
    expect(split.linesTotal).toBe(17_000)
    expect(split.packTotal).toBe(19_000)
    expect(split.margin).toBe(2000)
    expect(split.compensation).toBe(0)
  })

  it('porte l\'écart d\'un pack boutique sur la boutique elle-même', () => {
    const own = lines.map(line => ({ ...line, supplierId: 'fatou' }))
    const split = packSplit({ price: 8000, supplierId: 'fatou' }, own)

    expect(split.bySupplier).toHaveLength(1)
    expect(split.supplierAdjustment).toBe(-500)
    expect(split.compensation).toBe(0)
    expect(split.margin).toBe(0)
  })
})
