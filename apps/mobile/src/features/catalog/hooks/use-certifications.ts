import { useEffect, useState } from 'react'
import { apiFetch } from '../../../utils/api-client'
import { LABEL_CODES, LABEL_LABELS } from '../composition'

export interface Certification {
  code: string
  name: string
  description: string | null
  logoUrl: string | null
}

/**
 * The labels the platform shipped with. They stand in until the list is
 * fetched, and after a failed fetch: a label named from a slightly stale
 * list reads better than a bare code.
 */
const FALLBACK: Certification[] = LABEL_CODES.map(code => ({
  code,
  name: LABEL_LABELS[code],
  description: null,
  logoUrl: null,
}))

/** Shared across screens: the list changes only when an admin edits it. */
let cached: Certification[] | null = null

/**
 * Name of a label code, usable outside hooks. Reads the same cache as the
 * hook; the built-in list covers the original codes until it is fetched.
 */
export function certificationName(code: string): string {
  const list = cached ?? FALLBACK
  return list.find(item => item.code === code)?.name ?? code
}

/** Labels and certifications, as managed from the back office. */
export function useCertifications(): Certification[] {
  const [items, setItems] = useState<Certification[]>(cached ?? FALLBACK)

  useEffect(() => {
    if (cached) {
      return
    }
    let cancelled = false
    async function load(): Promise<void> {
      try {
        const res = await apiFetch('/api/certifications/active')
        if (!res.ok || cancelled) {
          return
        }
        const data = await res.json() as { items?: Certification[] }
        const list = data.items ?? []
        if (list.length > 0) {
          cached = list
          setItems(list)
        }
      }
      catch {
        // Keep the built-in list; the next screen mount retries.
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return items
}
