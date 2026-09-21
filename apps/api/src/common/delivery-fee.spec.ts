import { describe, expect, it } from 'vitest'
import { computeCourierFee, computeDeliveryFee, computeRunDistance, DEFAULT_DELIVERY_PRICING, DEFAULT_RUN_GROUPING, groupShopsIntoRuns, orderPickups } from './delivery-fee'

const base = { isDelivery: true, itemsTotal: 5_000, hasShopPosition: true }

describe('computeDeliveryFee', () => {
  it('charges nothing on a pickup or above the free threshold', () => {
    expect(computeDeliveryFee(DEFAULT_DELIVERY_PRICING, { ...base, isDelivery: false, distanceKm: 4 }).fee).toBe(0)
    const withThreshold = { ...DEFAULT_DELIVERY_PRICING, freeFrom: 20_000 }
    expect(computeDeliveryFee(withThreshold, { ...base, itemsTotal: 20_000, distanceKm: 4 })).toMatchObject({ fee: 0, reason: 'FREE_THRESHOLD' })
    expect(computeDeliveryFee(withThreshold, { ...base, itemsTotal: 19_999, distanceKm: 4 }).fee).toBe(700)
  })

  it('prices by distance, rounded up to the step and clamped', () => {
    expect(computeDeliveryFee(DEFAULT_DELIVERY_PRICING, { ...base, distanceKm: 4.2 })).toMatchObject({ fee: 800, reason: 'DISTANCE' })
    expect(computeDeliveryFee(DEFAULT_DELIVERY_PRICING, { ...base, distanceKm: 0.1 }).fee).toBe(400)
    expect(computeDeliveryFee({ ...DEFAULT_DELIVERY_PRICING, distance: { ...DEFAULT_DELIVERY_PRICING.distance, minFee: 500 } }, { ...base, distanceKm: 0.1 }).fee).toBe(500)
    expect(computeDeliveryFee(DEFAULT_DELIVERY_PRICING, { ...base, distanceKm: 24 }).fee).toBe(2500)
  })

  it('needs a drop-off point in distance mode and refuses beyond the limit', () => {
    expect(computeDeliveryFee(DEFAULT_DELIVERY_PRICING, { ...base, distanceKm: null })).toMatchObject({ fee: null, reason: 'NO_POSITION' })
    expect(computeDeliveryFee(DEFAULT_DELIVERY_PRICING, { ...base, distanceKm: 25.5 })).toMatchObject({ fee: null, reason: 'OUT_OF_RANGE' })
    // A shop without a position gets the flat fee rather than blocking sales.
    expect(computeDeliveryFee(DEFAULT_DELIVERY_PRICING, { ...base, hasShopPosition: false, distanceKm: null })).toMatchObject({ fee: 500, reason: 'NO_SHOP_POSITION' })
  })

  it('applies the flat mode whatever the distance', () => {
    const flat = { ...DEFAULT_DELIVERY_PRICING, mode: 'FLAT' as const }
    expect(computeDeliveryFee(flat, { ...base, distanceKm: null })).toMatchObject({ fee: 500, reason: 'FLAT' })
    expect(computeDeliveryFee(flat, { ...base, distanceKm: 40 }).fee).toBe(500)
  })

  it('picks the first ring containing the distance in zones mode', () => {
    const zones = { ...DEFAULT_DELIVERY_PRICING, mode: 'ZONES' as const }
    expect(computeDeliveryFee(zones, { ...base, distanceKm: 2.9 })).toMatchObject({ fee: 500, reason: 'ZONE' })
    expect(computeDeliveryFee(zones, { ...base, distanceKm: 3 }).fee).toBe(500)
    expect(computeDeliveryFee(zones, { ...base, distanceKm: 7 }).fee).toBe(1000)
    expect(computeDeliveryFee(zones, { ...base, distanceKm: 20 }).fee).toBe(1500)
    expect(computeDeliveryFee({ ...zones, maxDistanceKm: 50 }, { ...base, distanceKm: 30 })).toMatchObject({ fee: null, reason: 'OUT_OF_RANGE' })
  })
})

describe('computeCourierFee', () => {
  it('leaves the courier the fee minus the platform rate, rounded', () => {
    expect(computeCourierFee(1000, 0.1)).toBe(900)
    expect(computeCourierFee(0, 0.1)).toBe(0)
    expect(computeCourierFee(1000, 1.5)).toBe(0)
  })
})

describe('computeRunDistance', () => {
  // Cotonou. Environ 1,1 km entre chaque point sur cet axe.
  const shopA = { latitude: 6.3700, longitude: 2.3912 }
  const shopB = { latitude: 6.3800, longitude: 2.3912 }
  const buyer = { latitude: 6.3900, longitude: 2.3912 }

  it('mesure le trajet réel du livreur, pas la somme boutique → acheteur', () => {
    const run = computeRunDistance([shopA, shopB], buyer)
    // A→B then B→buyer, so two legs — and not A→buyer plus
    // B→buyer, which would count the same road twice.
    expect(run).toBeCloseTo(2.22, 1)
    const naiveSum = computeRunDistance([shopA], buyer)! + computeRunDistance([shopB], buyer)!
    expect(run!).toBeLessThan(naiveSum)
  })

  it('retombe sur la distance boutique → acheteur quand il n\'y a qu\'une boutique', () => {
    expect(computeRunDistance([shopA], buyer)).toBeCloseTo(2.22, 1)
  })

  it('ne renvoie rien dès qu\'un point manque', () => {
    expect(computeRunDistance([], buyer)).toBeNull()
    expect(computeRunDistance([shopA, { latitude: null, longitude: null }], buyer)).toBeNull()
    expect(computeRunDistance([shopA], { latitude: null, longitude: null })).toBeNull()
  })

  it('tarife une tournée comme n\'importe quelle distance, forfait si un point manque', () => {
    const run = computeRunDistance([shopA, shopB], buyer)
    expect(computeDeliveryFee(DEFAULT_DELIVERY_PRICING, { ...base, distanceKm: run })).toMatchObject({ reason: 'DISTANCE' })
    // A single unlocated shop in the run: flat fee, not a block.
    expect(computeDeliveryFee(DEFAULT_DELIVERY_PRICING, { ...base, hasShopPosition: false, distanceKm: null }))
      .toMatchObject({ fee: 500, reason: 'NO_SHOP_POSITION' })
  })
})

describe('groupShopsIntoRuns', () => {
  // Cotonou: Ganhi, Jericho and Calavi. The first two are neighbours, the
  // third is across the lake.
  const ganhi = { supplierId: 'ganhi', latitude: 6.3600, longitude: 2.4300 }
  const jericho = { supplierId: 'jericho', latitude: 6.3660, longitude: 2.4100 }
  const proche = { supplierId: 'proche', latitude: 6.3610, longitude: 2.4320 }
  const calavi = { supplierId: 'calavi', latitude: 6.4500, longitude: 2.3500 }

  it('laisse une boutique seule dans sa tournée', () => {
    expect(groupShopsIntoRuns([ganhi], DEFAULT_RUN_GROUPING)).toEqual([
      { supplierIds: ['ganhi'], pickupSpreadKm: 0 },
    ])
  })

  it('réunit deux boutiques proches', () => {
    const groups = groupShopsIntoRuns([ganhi, jericho], DEFAULT_RUN_GROUPING)
    expect(groups).toHaveLength(1)
    expect(groups[0].supplierIds).toHaveLength(2)
    expect(groups[0].pickupSpreadKm).toBeLessThan(DEFAULT_RUN_GROUPING.maxPickupSpreadKm)
  })

  it('sépare deux boutiques trop éloignées, même si elles ne sont que deux', () => {
    const groups = groupShopsIntoRuns([ganhi, calavi], DEFAULT_RUN_GROUPING)
    expect(groups).toHaveLength(2)
    expect(groups.map(group => group.supplierIds)).toEqual([['calavi'], ['ganhi']])
  })

  it('coupe au-delà de deux boutiques, même toutes proches', () => {
    const groups = groupShopsIntoRuns([ganhi, jericho, proche], DEFAULT_RUN_GROUPING)
    expect(groups).toHaveLength(2)
    expect(groups.flatMap(group => group.supplierIds).sort()).toEqual(['ganhi', 'jericho', 'proche'])
    expect(groups.every(group => group.supplierIds.length <= 2)).toBe(true)
  })

  it('isole une boutique sans position : son écart n\'est pas mesurable', () => {
    const groups = groupShopsIntoRuns(
      [{ supplierId: 'inconnue', latitude: null, longitude: null }, ganhi, jericho],
      DEFAULT_RUN_GROUPING,
    )
    expect(groups).toContainEqual({ supplierIds: ['inconnue'], pickupSpreadKm: null })
    expect(groups.find(group => group.supplierIds.includes('ganhi'))?.supplierIds).toHaveLength(2)
  })

  it('rend le même découpage quel que soit l\'ordre du panier', () => {
    const forward = groupShopsIntoRuns([ganhi, jericho, proche, calavi], DEFAULT_RUN_GROUPING)
    const backward = groupShopsIntoRuns([calavi, proche, jericho, ganhi], DEFAULT_RUN_GROUPING)
    expect(backward).toEqual(forward)
  })

  it('respecte une limite relevée, seuil d\'écart compris', () => {
    const groups = groupShopsIntoRuns([ganhi, jericho, proche], { maxShops: 3, maxPickupSpreadKm: 3 })
    expect(groups).toHaveLength(1)
    expect(groups[0].supplierIds).toHaveLength(3)
    // The kept spread is the widest pair of the batch, not the last addition.
    expect(groups[0].pickupSpreadKm).toBeGreaterThan(0)
  })

  it('n\'ouvre aucune tournée pour un panier vide', () => {
    expect(groupShopsIntoRuns([], DEFAULT_RUN_GROUPING)).toEqual([])
  })
})

describe('orderPickups', () => {
  // One street: the courier is west, the buyer east.
  const ouest = { id: 'ouest', latitude: 6.3600, longitude: 2.4100 }
  const est = { id: 'est', latitude: 6.3600, longitude: 2.4300 }
  const acheteur = { latitude: 6.3600, longitude: 2.4400 }

  it('fait commencer le livreur par la boutique la plus proche de lui', () => {
    const depuisLOuest = { latitude: 6.3600, longitude: 2.4000 }
    expect(orderPickups([est, ouest], depuisLOuest, acheteur)).toEqual(['ouest', 'est'])
  })

  it('inverse l\'ordre quand le livreur arrive de l\'autre côté', () => {
    const depuisLEst = { latitude: 6.3600, longitude: 2.4350 }
    expect(orderPickups([ouest, est], depuisLEst, acheteur)).toEqual(['est', 'ouest'])
  })

  it('sans livreur connu, garde le dernier tronçon le plus court', () => {
    // The shop farthest from the buyer comes first: what travels
    // loaded is the end of the run.
    expect(orderPickups([est, ouest], null, acheteur)).toEqual(['ouest', 'est'])
  })

  it('laisse une collecte sans position en dernier', () => {
    const inconnue = { id: 'inconnue', latitude: null, longitude: null }
    const depuisLOuest = { latitude: 6.3600, longitude: 2.4000 }
    expect(orderPickups([inconnue, est, ouest], depuisLOuest, acheteur)).toEqual(['ouest', 'est', 'inconnue'])
  })

  it('ne change rien à une tournée d\'une seule boutique', () => {
    expect(orderPickups([ouest], null, acheteur)).toEqual(['ouest'])
    expect(orderPickups([], null, acheteur)).toEqual([])
  })

  it('rend un ordre qui raccourcit bien le trajet', () => {
    const depuisLOuest = { latitude: 6.3600, longitude: 2.4000 }
    const ordre = orderPickups([est, ouest], depuisLOuest, acheteur)
    const parOrdre = new Map([[ouest.id, ouest], [est.id, est]])
    const bon = computeRunDistance(ordre.map(id => parOrdre.get(id)!), acheteur)!
    const mauvais = computeRunDistance([est, ouest], acheteur)!
    expect(bon).toBeLessThan(mauvais)
  })
})
