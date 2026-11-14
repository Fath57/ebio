import type { TerroirDepartures } from '../../terroir-api'
import { useEffect, useSyncExternalStore } from 'react'
import { fetchTerroirDepartures } from '../../terroir-api'

/**
 * Small shared memories for the Valise screens, outside React state so the
 * home card, the mode banner, the entry effect and the home section read the
 * same answer without each asking the server.
 */

// ---------------------------------------------------------------------------
// Departures, per destination and display currency

const DEPARTURES_TTL_MS = 5 * 60 * 1000

const departuresCache = new Map<string, { value: TerroirDepartures, at: number }>()
const departuresInflight = new Set<string>()
const departuresListeners = new Set<() => void>()

function departuresKey(country: string, currency: string): string {
  return `${country}:${currency}`
}

function emitDepartures(): void {
  departuresListeners.forEach(listener => listener())
}

function subscribeDepartures(listener: () => void): () => void {
  departuresListeners.add(listener)
  return () => {
    departuresListeners.delete(listener)
  }
}

/** Shares an answer fetched elsewhere (the home section loads it with the packs). */
export function primeValiseDepartures(country: string, currency: string, value: TerroirDepartures): void {
  departuresCache.set(departuresKey(country, currency), { value, at: Date.now() })
  emitDepartures()
}

function loadDepartures(country: string, currency: string): void {
  const key = departuresKey(country, currency)
  if (departuresInflight.has(key))
    return
  departuresInflight.add(key)
  fetchTerroirDepartures(country, currency)
    .then(value => primeValiseDepartures(country, currency, value))
    .catch(() => undefined)
    .finally(() => {
      departuresInflight.delete(key)
    })
}

/** The departures for a destination: the last known answer, refreshed when stale. */
export function useValiseDepartures(country: string | null, currency: string): TerroirDepartures | null {
  const key = country ? departuresKey(country, currency) : null
  const value = useSyncExternalStore(
    subscribeDepartures,
    () => key ? departuresCache.get(key)?.value ?? null : null,
  )
  useEffect(() => {
    if (!country)
      return
    const hit = departuresCache.get(departuresKey(country, currency))
    if (!hit || Date.now() - hit.at > DEPARTURES_TTL_MS)
      loadDepartures(country, currency)
  }, [country, currency])
  return value
}

export interface DepartureHeadline {
  city: string | null
  departsOn: string
  orderBefore: string | null
  /** FCFA per kilo, null when the departure list does not carry it. */
  pricePerKg: number | null
}

/** The next departure as the headline shows it, with the cheapest kilo on offer. */
export function departureHeadline(departures: TerroirDepartures | null): DepartureHeadline | null {
  if (!departures)
    return null
  const open = departures.items.filter(item => !item.full)
  const next = departures.next
  const first = open[0] ?? null
  const prices = open.map(item => item.pricePerKg).filter(price => price > 0)
  const pricePerKg = prices.length > 0 ? Math.min(...prices) : null
  if (next)
    return { city: next.city, departsOn: next.departsOn, orderBefore: next.orderBefore, pricePerKg }
  if (first)
    return { city: null, departsOn: first.departsOn, orderBefore: first.orderBefore, pricePerKg }
  return null
}

/** « 28 nov. » from an ISO day or instant. */
export function formatShortDay(iso: string | null): string {
  if (!iso)
    return ''
  const date = iso.length === 10 ? new Date(`${iso}T12:00:00`) : new Date(iso)
  if (Number.isNaN(date.getTime()))
    return ''
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

// ---------------------------------------------------------------------------
// Fill: what « Ma valise » last computed, for the banner's gauge

export interface ValiseFill {
  /** The item count the figures were computed for: stale once it differs. */
  itemCount: number
  weightKg: number
  billedKg: number
}

let fill: ValiseFill | null = null
const fillListeners = new Set<() => void>()

function subscribeFill(listener: () => void): () => void {
  fillListeners.add(listener)
  return () => {
    fillListeners.delete(listener)
  }
}

export function setValiseFill(next: ValiseFill | null): void {
  if (next && fill && next.itemCount === fill.itemCount && next.weightKg === fill.weightKg && next.billedKg === fill.billedKg)
    return
  fill = next
  fillListeners.forEach(listener => listener())
}

export function useValiseFill(): ValiseFill | null {
  return useSyncExternalStore(subscribeFill, () => fill)
}
