import type { PlaceSuggestion, ResolvedPlace } from './contracts/geocoding.contract'
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { config } from '../../config/env.config'

/**
 * Durées de cache. Les suggestions vieillissent peu — les villes ne changent
 * pas de nom — et les coordonnées d'un lieu, jamais.
 */
const SUGGESTIONS_TTL_MS = 24 * 60 * 60 * 1000
const PLACE_TTL_MS = 30 * 24 * 60 * 60 * 1000
/** Garde-fou mémoire : au-delà, les entrées les plus anciennes sont évincées. */
const MAX_ENTRIES = 2000

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

/**
 * Suggestions de lieux, en proxy devant Google Places.
 *
 * Le mobile ne parle jamais à Google directement : la clé resterait dans l'APK,
 * extractible par n'importe qui. Elle vit ici, et le cache absorbe les frappes
 * successives d'une même recherche — « Cot », « Coto », « Cotonou » — qui sont
 * autrement facturées à l'unité.
 *
 * Le cache est en mémoire de processus, suffisant pour un conteneur unique. Il
 * faudra passer à Redis le jour où l'API sera répliquée.
 */
@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name)
  private readonly cache = new Map<string, CacheEntry<unknown>>()

  private get apiKey(): string {
    const key = config.maps.googleApiKey
    if (!key) {
      throw new ServiceUnavailableException('Recherche de lieux indisponible')
    }
    return key
  }

  async autocomplete(query: string, sessionToken?: string): Promise<PlaceSuggestion[]> {
    const normalized = query.trim().toLowerCase()
    if (normalized.length < 2) {
      return []
    }

    const cacheKey = `ac:${normalized}`
    const cached = this.readCache<PlaceSuggestion[]>(cacheKey)
    if (cached) {
      return cached
    }

    const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json')
    url.searchParams.set('input', query)
    // `(cities)` restreint aux localités : on cherche une ville, pas un commerce.
    url.searchParams.set('types', '(cities)')
    url.searchParams.set('key', this.apiKey)
    if (sessionToken) {
      // Regroupe les frappes d'une même recherche en une seule session facturée.
      url.searchParams.set('sessiontoken', sessionToken)
    }

    const data = await this.callGoogle(url)
    const predictions = (data.predictions ?? []) as Array<Record<string, unknown>>

    const suggestions: PlaceSuggestion[] = predictions.map((prediction) => {
      const formatting = (prediction.structured_formatting ?? {}) as Record<string, string>
      return {
        placeId: prediction.place_id as string,
        label: formatting.main_text ?? (prediction.description as string),
        context: formatting.secondary_text ?? '',
      }
    })

    this.writeCache(cacheKey, suggestions, SUGGESTIONS_TTL_MS)
    return suggestions
  }

  async resolvePlace(placeId: string, sessionToken?: string): Promise<ResolvedPlace> {
    const cacheKey = `place:${placeId}`
    const cached = this.readCache<ResolvedPlace>(cacheKey)
    if (cached) {
      return cached
    }

    const url = new URL('https://maps.googleapis.com/maps/api/place/details/json')
    url.searchParams.set('place_id', placeId)
    url.searchParams.set('fields', 'geometry/location,name,formatted_address')
    url.searchParams.set('key', this.apiKey)
    if (sessionToken) {
      url.searchParams.set('sessiontoken', sessionToken)
    }

    const data = await this.callGoogle(url)
    const result = (data.result ?? {}) as Record<string, unknown>
    const location = ((result.geometry as Record<string, unknown>)?.location ?? {}) as Record<string, number>

    if (typeof location.lat !== 'number' || typeof location.lng !== 'number') {
      throw new ServiceUnavailableException('Lieu introuvable')
    }

    const resolved: ResolvedPlace = {
      placeId,
      label: (result.name as string) ?? (result.formatted_address as string) ?? '',
      latitude: location.lat,
      longitude: location.lng,
    }

    this.writeCache(cacheKey, resolved, PLACE_TTL_MS)
    return resolved
  }

  /**
   * Google répond 200 avec un `status` applicatif : une clé invalide ou un quota
   * dépassé n'est pas une erreur HTTP, il faut lire le corps.
   */
  private async callGoogle(url: URL): Promise<Record<string, unknown>> {
    let response: Response
    try {
      response = await fetch(url)
    }
    catch (error) {
      this.logger.error('Google Places unreachable', error)
      throw new ServiceUnavailableException('Recherche de lieux indisponible')
    }

    const data = await response.json() as Record<string, unknown>
    const status = data.status as string

    if (status === 'OK' || status === 'ZERO_RESULTS') {
      return data
    }

    this.logger.error(`Google Places returned ${status}: ${data.error_message ?? ''}`)
    throw new ServiceUnavailableException('Recherche de lieux indisponible')
  }

  private readCache<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) {
      return null
    }
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key)
      return null
    }
    return entry.value as T
  }

  private writeCache(key: string, value: unknown, ttlMs: number): void {
    if (this.cache.size >= MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value
      if (oldest) {
        this.cache.delete(oldest)
      }
    }
    this.cache.set(key, { value, expiresAt: Date.now() + ttlMs })
  }
}
