import type { TerroirCountry, TerroirCountryInfo, TerroirLineInput } from './terroir-api'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as React from 'react'
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { deviceTimeZone } from '../common/utils/is-abroad'
import { cachedTerroirCountries, fetchTerroirCountries, fetchTerroirEnabled } from './terroir-api'

/**
 * The terroir basket, kept apart from the local cart (research §11): it ships
 * abroad in one parcel, may mix shops, and stays on the phone in v1.
 */

export interface TerroirCartLine {
  /** `P:<productId>:<variantId>` or `K:<packId>`. */
  key: string
  kind: 'PRODUCT' | 'PACK'
  productId?: string
  variantId?: string | null
  packId?: string
  name: string
  imageUrl: string | null
  /** FCFA, as shown when added; the preview reprices everything. */
  price: number
  quantity: number
  shopName: string | null
}

export type AddTerroirLineInput = Omit<TerroirCartLine, 'key' | 'quantity'> & { quantity?: number }

interface StoredTerroirCart {
  lines: TerroirCartLine[]
  country: TerroirCountry | null
}

interface TerroirCartValue {
  lines: TerroirCartLine[]
  /** The destination, among the offered countries; null while none is known or none is offered. */
  country: TerroirCountry | null
  countryInfo: TerroirCountryInfo | null
  /** Countries an open departure serves; null until the first answer. */
  countries: TerroirCountryInfo[] | null
  countriesError: string | null
  reloadCountries: () => void
  hydrated: boolean
  itemCount: number
  setCountry: (country: TerroirCountry) => void
  addLine: (input: AddTerroirLineInput) => void
  setQuantity: (key: string, quantity: number) => void
  removeLine: (key: string) => void
  clear: () => void
  /** The lines as the checkout endpoints take them. */
  toInput: () => TerroirLineInput[]
}

export const TERROIR_CART_KEY = 'ebio_terroir_cart'

const MAX_QUANTITY = 20

/** A few common time zones and the country they most likely sit in. */
const TIME_ZONE_COUNTRIES: Record<string, TerroirCountry> = {
  'Europe/Paris': 'FR',
  'Europe/Brussels': 'BE',
  'Europe/Amsterdam': 'NL',
  'Europe/Luxembourg': 'LU',
  'Europe/London': 'GB',
  'Europe/Zurich': 'CH',
  'Europe/Berlin': 'DE',
  'Europe/Rome': 'IT',
  'Europe/Madrid': 'ES',
  'Europe/Lisbon': 'PT',
  'America/Toronto': 'CA',
  'America/Montreal': 'CA',
  'America/Vancouver': 'CA',
  'America/Edmonton': 'CA',
  'America/Winnipeg': 'CA',
  'America/Halifax': 'CA',
  'America/New_York': 'US',
  'America/Chicago': 'US',
  'America/Denver': 'US',
  'America/Phoenix': 'US',
  'America/Los_Angeles': 'US',
}

/** The offered country the phone's time zone points to, else the first of the list. */
export function guessTerroirCountry(countries: TerroirCountryInfo[]): TerroirCountryInfo | null {
  const zone = deviceTimeZone()
  const code = zone ? TIME_ZONE_COUNTRIES[zone] : undefined
  return countries.find(country => country.code === code) ?? countries[0] ?? null
}

function lineKey(input: AddTerroirLineInput): string {
  return input.kind === 'PACK' ? `K:${input.packId ?? ''}` : `P:${input.productId ?? ''}:${input.variantId ?? ''}`
}

function readStored(raw: string | null): StoredTerroirCart | null {
  if (!raw)
    return null
  try {
    const parsed = JSON.parse(raw) as Partial<StoredTerroirCart>
    const lines = Array.isArray(parsed.lines)
      ? parsed.lines.filter(line => typeof line?.key === 'string' && typeof line.quantity === 'number' && line.quantity > 0)
      : []
    const country = typeof parsed.country === 'string' && /^[A-Z]{2}$/.test(parsed.country) ? parsed.country : null
    return { lines, country }
  }
  catch {
    return null
  }
}

const TerroirCartContext = createContext<TerroirCartValue | null>(null)

export function TerroirCartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<TerroirCartLine[]>([])
  // What the buyer picked (or what was saved); the effective country is derived below.
  const [chosen, setChosen] = useState<TerroirCountry | null>(null)
  const [countries, setCountries] = useState<TerroirCountryInfo[] | null>(() => cachedTerroirCountries())
  const [countriesError, setCountriesError] = useState<string | null>(null)
  const [countriesKey, setCountriesKey] = useState(0)
  const [hydrated, setHydrated] = useState(false)
  const hydratedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    // The module off, nothing to ask: the countries load once it opens.
    fetchTerroirEnabled()
      .then(enabled => enabled ? fetchTerroirCountries() : null)
      .then((result) => {
        if (result === null)
          return
        if (cancelled)
          return
        setCountries(result)
        setCountriesError(null)
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setCountriesError(error instanceof Error ? error.message : 'Impossible de charger les pays desservis.')
      })
    return () => {
      cancelled = true
    }
  }, [countriesKey])

  const reloadCountries = useCallback(() => {
    setCountriesKey(key => key + 1)
  }, [])

  // A saved country no longer offered gives way to the first offered one; no
  // choice yet follows the time zone.
  const countryInfo = useMemo<TerroirCountryInfo | null>(() => {
    if (!hydrated || !countries)
      return null
    if (chosen === null)
      return guessTerroirCountry(countries)
    return countries.find(entry => entry.code === chosen) ?? countries[0] ?? null
  }, [hydrated, countries, chosen])
  const country = countryInfo?.code ?? null

  useEffect(() => {
    let cancelled = false
    AsyncStorage.getItem(TERROIR_CART_KEY)
      .then((raw) => {
        if (cancelled)
          return
        const stored = readStored(raw)
        if (stored) {
          // Lines added before the read finished stay on top of the stored ones.
          setLines(current => current.length > 0 ? current : stored.lines)
          setChosen(stored.country)
        }
      })
      .catch(() => undefined)
      .finally(() => {
        hydratedRef.current = true
        setHydrated(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!hydratedRef.current)
      return
    const stored: StoredTerroirCart = { lines, country: country ?? chosen }
    AsyncStorage.setItem(TERROIR_CART_KEY, JSON.stringify(stored)).catch(() => undefined)
  }, [lines, country, chosen, hydrated])

  const addLine = useCallback((input: AddTerroirLineInput) => {
    const key = lineKey(input)
    const quantity = input.quantity ?? 1
    setLines((current) => {
      const existing = current.find(line => line.key === key)
      if (existing) {
        return current.map(line => line.key === key
          ? { ...line, price: input.price, quantity: Math.min(MAX_QUANTITY, line.quantity + quantity) }
          : line)
      }
      return [...current, { ...input, key, quantity: Math.min(MAX_QUANTITY, quantity) }]
    })
  }, [])

  const setQuantity = useCallback((key: string, quantity: number) => {
    setLines(current => quantity <= 0
      ? current.filter(line => line.key !== key)
      : current.map(line => line.key === key ? { ...line, quantity: Math.min(MAX_QUANTITY, quantity) } : line))
  }, [])

  const removeLine = useCallback((key: string) => {
    setLines(current => current.filter(line => line.key !== key))
  }, [])

  const clear = useCallback(() => {
    setLines([])
  }, [])

  const toInput = useCallback((): TerroirLineInput[] => lines.map(line => line.kind === 'PACK'
    ? { packId: line.packId, quantity: line.quantity }
    : { productId: line.productId, variantId: line.variantId ?? null, quantity: line.quantity }), [lines])

  const value = useMemo<TerroirCartValue>(() => ({
    lines,
    country,
    countryInfo,
    countries,
    countriesError,
    reloadCountries,
    hydrated,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    setCountry: setChosen,
    addLine,
    setQuantity,
    removeLine,
    clear,
    toInput,
  }), [lines, country, countryInfo, countries, countriesError, reloadCountries, hydrated, addLine, setQuantity, removeLine, clear, toInput])

  return (
    <TerroirCartContext value={value}>
      {children}
    </TerroirCartContext>
  )
}

export function useTerroirCart(): TerroirCartValue {
  const value = use(TerroirCartContext)
  if (!value)
    throw new Error('useTerroirCart must be used inside TerroirCartProvider')
  return value
}
