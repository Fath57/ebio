import type { SearchResult } from '../search/hooks/use-search'
import { apiFetch } from '../../utils/api-client'

export interface FavoriteItem extends SearchResult {
  /** When it was kept. The list comes back newest first. */
  savedAt: string
}

/**
 * The kept products, in the order they were kept.
 *
 * The server returns the very shape the product card already reads, so the
 * list reuses that card rather than growing one of its own.
 */
export async function fetchFavorites(position?: { latitude: number, longitude: number }): Promise<FavoriteItem[]> {
  const query = position
    ? `?${new URLSearchParams({ latitude: String(position.latitude), longitude: String(position.longitude) })}`
    : ''
  const res = await apiFetch(`/api/favorites${query}`)
  if (!res.ok) {
    throw new Error('Impossible de charger vos favoris.')
  }
  const data = await res.json() as { items?: FavoriteItem[] }
  return data.items ?? []
}

/** Which of these are kept — asked once for a whole page of cards. */
export async function fetchKeptIds(productIds: string[]): Promise<string[]> {
  if (productIds.length === 0) {
    return []
  }
  const res = await apiFetch(`/api/favorites/ids?productIds=${productIds.join(',')}`)
  if (!res.ok) {
    return []
  }
  const data = await res.json() as { productIds?: string[] }
  return data.productIds ?? []
}

export async function keepProduct(productId: string): Promise<void> {
  const res = await apiFetch(`/api/favorites/${productId}`, { method: 'POST' })
  if (!res.ok) {
    throw new Error('Impossible d\'ajouter aux favoris.')
  }
}

export async function dropProduct(productId: string): Promise<void> {
  const res = await apiFetch(`/api/favorites/${productId}`, { method: 'DELETE' })
  if (!res.ok) {
    throw new Error('Impossible de retirer des favoris.')
  }
}
