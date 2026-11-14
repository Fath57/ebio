import type { CurrencyRates, DisplayCurrency } from '../../../common/currency-context'
import type { TerroirCountryInfo, TerroirDepartures } from '../../terroir-api'
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

let departuresVersion = 0

function emitDepartures(): void {
  departuresVersion += 1
  departuresListeners.forEach(listener => listener())
}

/** The currency a destination's prices show in: its own when a rate is known, else FCFA. */
export function countryCurrency(country: TerroirCountryInfo, rates: CurrencyRates): DisplayCurrency {
  return rates[country.displayCurrency] ? country.displayCurrency : 'XOF'
}

/** The last known answer for a destination, without asking. */
export function cachedValiseDepartures(country: string, currency: string): TerroirDepartures | null {
  return departuresCache.get(departuresKey(country, currency))?.value ?? null
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

export interface DepartureTarget {
  country: string
  currency: string
}

/**
 * The departures of several destinations at once (the departures board):
 * each one asked once, then read from the shared memory.
 */
export function useValiseDeparturesFor(targets: DepartureTarget[]): Record<string, TerroirDepartures | null> {
  // Re-render on any new answer; the values themselves come from the cache.
  useSyncExternalStore(subscribeDepartures, () => departuresVersion)
  const signature = targets.map(target => departuresKey(target.country, target.currency)).join(',')
  useEffect(() => {
    for (const target of targets) {
      const hit = departuresCache.get(departuresKey(target.country, target.currency))
      if (!hit || Date.now() - hit.at > DEPARTURES_TTL_MS)
        loadDepartures(target.country, target.currency)
    }
  }, [signature])
  const result: Record<string, TerroirDepartures | null> = {}
  for (const target of targets)
    result[target.country] = cachedValiseDepartures(target.country, target.currency)
  return result
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
  // Where the parcel is collected: the next departure's city, else its first pickup point's.
  const nextItem = next ? open.find(item => item.departureId === next.departureId) ?? null : null
  const pickupCity = (nextItem ?? first)?.pickupPoints.find(point => point.city)?.city ?? null
  if (next)
    return { city: next.city ?? pickupCity, departsOn: next.departsOn, orderBefore: next.orderBefore, pricePerKg }
  if (first)
    return { city: pickupCity, departsOn: first.departsOn, orderBefore: first.orderBefore, pricePerKg }
  return null
}

export type BoardStatus = 'BOARDING' | 'ON_TIME' | 'FULL' | 'SOON' | 'LOADING'

export const BOARD_STATUS_LABELS: Record<BoardStatus, string> = {
  BOARDING: 'Embarquement',
  ON_TIME: 'À l’heure',
  FULL: 'Complet',
  SOON: 'Bientôt',
  LOADING: 'Mise à jour',
}

const BOARDING_WINDOW_MS = 3 * 24 * 60 * 60 * 1000

/**
 * A destination's word on the board: « Embarquement » when the order deadline
 * is three days away or less, « Complet » when every departure is full,
 * « Bientôt » for a country without a departure.
 */
export function boardStatus(offered: boolean, departures: TerroirDepartures | null, now = Date.now()): BoardStatus {
  if (!offered)
    return 'SOON'
  if (!departures)
    return 'LOADING'
  const headline = departureHeadline(departures)
  if (!headline)
    return departures.items.length > 0 ? 'FULL' : 'SOON'
  const deadline = headline.orderBefore ?? headline.departsOn
  const at = deadline.length === 10 ? new Date(`${deadline}T23:59:59`).getTime() : new Date(deadline).getTime()
  return !Number.isNaN(at) && at - now <= BOARDING_WINDOW_MS ? 'BOARDING' : 'ON_TIME'
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
