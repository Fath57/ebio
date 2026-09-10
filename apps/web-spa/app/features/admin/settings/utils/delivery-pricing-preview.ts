import type { DeliveryPricingConfig } from '@boilerstone/openapi-generator/client/types.gen'

/**
 * Client-side mirror of the server fee computation, used for the live
 * preview under the pricing form. Returns `null` when the distance is not
 * served (beyond `maxDistanceKm`, or past the last ring in ZONES mode).
 */
export function previewFee(config: DeliveryPricingConfig, km: number): number | null {
  if (km > config.maxDistanceKm)
    return null

  switch (config.mode) {
    case 'FLAT':
      return config.flat.fee
    case 'DISTANCE': {
      const { baseFee, perKm, minFee, maxFee, roundTo } = config.distance
      const step = roundTo >= 1 ? roundTo : 1
      const raw = Math.ceil((baseFee + perKm * km) / step) * step
      return Math.min(Math.max(raw, minFee), maxFee)
    }
    case 'ZONES': {
      const ring = [...config.zones]
        .sort((a, b) => a.maxKm - b.maxKm)
        .find(zone => km <= zone.maxKm)
      return ring ? ring.fee : null
    }
    default:
      return null
  }
}
