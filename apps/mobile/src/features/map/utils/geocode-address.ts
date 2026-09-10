import { apiFetch } from '../../../utils/api-client'

export interface GeocodedAddress {
  latitude: number
  longitude: number
  label: string
}

/**
 * Best-effort coordinates for a free-text address: first Places suggestion,
 * then its position. Null when nothing matches or the network fails — the
 * caller falls back to the device position.
 */
export async function geocodeAddress(address: string): Promise<GeocodedAddress | null> {
  const query = address.trim()
  if (query.length < 3) {
    return null
  }
  try {
    const session = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    const search = await apiFetch(`/api/geocoding/autocomplete?${new URLSearchParams({ q: query, kind: 'address', session })}`)
    if (!search.ok) {
      return null
    }
    const data = await search.json() as { suggestions?: Array<{ placeId: string }> }
    const first = data.suggestions?.[0]
    if (!first) {
      return null
    }
    const place = await apiFetch(`/api/geocoding/place?${new URLSearchParams({ placeId: first.placeId, session })}`)
    if (!place.ok) {
      return null
    }
    const coords = await place.json() as Record<string, unknown>
    if (typeof coords.latitude !== 'number' || typeof coords.longitude !== 'number') {
      return null
    }
    return { latitude: coords.latitude, longitude: coords.longitude, label: typeof coords.label === 'string' ? coords.label : query }
  }
  catch {
    return null
  }
}
