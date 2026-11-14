import type { TerroirCountry, TerroirLineInput } from './terroir-api'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as React from 'react'
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { deviceTimeZone } from '../common/utils/is-abroad'
import { isTerroirCountry } from './terroir-api'

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
  country: TerroirCountry
}

interface TerroirCartValue {
  lines: TerroirCartLine[]
  country: TerroirCountry
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

/** Paris → France, Brussels → Belgium; anywhere else starts on France. */
export function defaultTerroirCountry(): TerroirCountry {
  return deviceTimeZone() === 'Europe/Brussels' ? 'BE' : 'FR'
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
    return { lines, country: isTerroirCountry(parsed.country) ? parsed.country : defaultTerroirCountry() }
  }
  catch {
    return null
  }
}

const TerroirCartContext = createContext<TerroirCartValue | null>(null)

export function TerroirCartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<TerroirCartLine[]>([])
  const [country, setCountryState] = useState<TerroirCountry>(defaultTerroirCountry)
  const [hydrated, setHydrated] = useState(false)
  const hydratedRef = useRef(false)

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
          setCountryState(stored.country)
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
    const stored: StoredTerroirCart = { lines, country }
    AsyncStorage.setItem(TERROIR_CART_KEY, JSON.stringify(stored)).catch(() => undefined)
  }, [lines, country, hydrated])

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
    hydrated,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    setCountry: setCountryState,
    addLine,
    setQuantity,
    removeLine,
    clear,
    toInput,
  }), [lines, country, hydrated, addLine, setQuantity, removeLine, clear, toInput])

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
