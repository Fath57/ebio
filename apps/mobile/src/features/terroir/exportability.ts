import type { TerroirCountry, TerroirExportability } from './terroir-api'
import { useEffect, useSyncExternalStore } from 'react'
import { fetchTerroirExportability } from './terroir-api'
import { useValiseMode } from './valise-mode-context'

/**
 * Exportability of the products on screen, for the Valise mode.
 *
 * Every card asks for its own product; the asks of one render are gathered
 * for a moment and sent as one call per destination (100 ids at most), so a
 * list page costs one request. Answers are kept in memory per country and
 * product for a short while.
 */

const TTL_MS = 2 * 60 * 1000
/** A failed batch is not asked again before this. */
const RETRY_MS = 30 * 1000
const BATCH_DELAY_MS = 30
const MAX_IDS = 100

interface Entry {
  item: TerroirExportability
  at: number
}

const entries = new Map<string, Entry>()
const failedAt = new Map<string, number>()
const inflight = new Set<string>()
const queue = new Map<TerroirCountry, Set<string>>()
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setTimeout> | null = null
let version = 0

function keyOf(country: TerroirCountry, productId: string): string {
  return `${country}:${productId}`
}

function emit(): void {
  version += 1
  listeners.forEach(listener => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getVersion(): number {
  return version
}

/** Stores an answer that came another way (the product detail). */
export function primeExportability(country: TerroirCountry, item: TerroirExportability): void {
  entries.set(keyOf(country, item.productId), { item, at: Date.now() })
  emit()
}

function needsFetch(country: TerroirCountry, productId: string): boolean {
  const key = keyOf(country, productId)
  if (inflight.has(key))
    return false
  const now = Date.now()
  const entry = entries.get(key)
  if (entry && now - entry.at < TTL_MS)
    return false
  const failed = failedAt.get(key)
  return !(failed !== undefined && now - failed < RETRY_MS)
}

async function fetchCountry(country: TerroirCountry, productIds: string[]): Promise<void> {
  for (let start = 0; start < productIds.length; start += MAX_IDS) {
    const chunk = productIds.slice(start, start + MAX_IDS)
    try {
      const items = await fetchTerroirExportability(country, chunk)
      const now = Date.now()
      const answered = new Set<string>()
      for (const item of items) {
        entries.set(keyOf(country, item.productId), { item, at: now })
        answered.add(item.productId)
      }
      // A product the server left out is not asked again at once.
      for (const id of chunk) {
        if (!answered.has(id))
          failedAt.set(keyOf(country, id), now)
      }
    }
    catch {
      const now = Date.now()
      for (const id of chunk)
        failedAt.set(keyOf(country, id), now)
    }
    finally {
      for (const id of chunk)
        inflight.delete(keyOf(country, id))
    }
  }
  emit()
}

function flush(): void {
  timer = null
  const batches = [...queue.entries()]
  queue.clear()
  for (const [country, ids] of batches)
    void fetchCountry(country, [...ids])
}

function request(country: TerroirCountry, productId: string): void {
  if (!needsFetch(country, productId))
    return
  const ids = queue.get(country) ?? new Set<string>()
  ids.add(productId)
  queue.set(country, ids)
  inflight.add(keyOf(country, productId))
  if (timer === null)
    timer = setTimeout(flush, BATCH_DELAY_MS)
}

/**
 * The product's exportability towards a country; null while unknown or when
 * no country is given. A stale answer stays shown while it is asked again.
 */
export function useExportability(productId: string | null | undefined, country: TerroirCountry | null): TerroirExportability | null {
  const current = useSyncExternalStore(subscribe, getVersion)

  useEffect(() => {
    if (productId && country)
      request(country, productId)
  }, [productId, country, current])

  if (!productId || !country)
    return null
  return entries.get(keyOf(country, productId))?.item ?? null
}

/** Same, towards the Valise mode's country; null while the mode is off. */
export function useProductExportability(productId: string | null | undefined): TerroirExportability | null {
  const { active, country } = useValiseMode()
  return useExportability(productId, active ? country : null)
}
