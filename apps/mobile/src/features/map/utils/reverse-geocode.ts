import { apiFetch } from '../../../utils/api-client'

/** Address text for a pin, or null when unknown or offline. */
export async function reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
  try {
    const res = await apiFetch(`/api/geocoding/reverse?${new URLSearchParams({ lat: String(latitude), lng: String(longitude) })}`)
    if (!res.ok) {
      return null
    }
    const data = await res.json() as { label?: unknown }
    return typeof data.label === 'string' && data.label.length > 0 ? data.label : null
  }
  catch {
    return null
  }
}
