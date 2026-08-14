import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '../../../utils/api-client'

export interface PlaceSuggestion {
  placeId: string
  label: string
  context: string
}

/** Laisse le temps de finir un mot avant d'interroger l'API — et de facturer. */
const DEBOUNCE_MS = 350
/** En deçà, toute recherche de ville est trop ambiguë pour être utile. */
const MIN_QUERY_LENGTH = 2

/**
 * Recherche de villes via l'API, qui relaie Google Places.
 *
 * Le jeton de session regroupe les frappes d'une même recherche et la
 * résolution finale en une seule session facturée par Google ; il est
 * renouvelé après chaque sélection.
 */
export function usePlaceSearch() {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [searching, setSearching] = useState(false)
  const sessionToken = useRef(createSessionToken())
  /**
   * Text written into the field by a selection. Without this guard, writing the
   * chosen city's name restarts the search and reopens the list the user has
   * just closed.
   */
  const acceptedQuery = useRef<string | null>(null)

  useEffect(() => {
    const trimmed = query.trim()
    if (query === acceptedQuery.current || trimmed.length < MIN_QUERY_LENGTH) {
      setSuggestions([])
      return
    }

    let cancelled = false
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const params = new URLSearchParams({ q: trimmed, session: sessionToken.current })
        const res = await apiFetch(`/api/geocoding/autocomplete?${params}`)
        if (res.ok && !cancelled) {
          const data = await res.json()
          setSuggestions((data.suggestions ?? []) as PlaceSuggestion[])
        }
      }
      catch {
        if (!cancelled) {
          setSuggestions([])
        }
      }
      finally {
        if (!cancelled) {
          setSearching(false)
        }
      }
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  const resolve = useCallback(async (placeId: string) => {
    const params = new URLSearchParams({ placeId, session: sessionToken.current })
    const res = await apiFetch(`/api/geocoding/place?${params}`)
    // La session s'achève avec la résolution : la suivante doit repartir à neuf.
    sessionToken.current = createSessionToken()
    if (!res.ok) {
      return null
    }
    return (await res.json()) as { latitude: number, longitude: number, label: string }
  }, [])

  /** Writes the chosen city into the field and closes the list for good. */
  const accept = useCallback((label: string) => {
    acceptedQuery.current = label
    setQuery(label)
    setSuggestions([])
  }, [])

  const reset = useCallback(() => {
    acceptedQuery.current = null
    setQuery('')
    setSuggestions([])
  }, [])

  return { query, setQuery, suggestions, searching, resolve, accept, reset }
}

function createSessionToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
