import * as React from 'react'
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from '../../lib/auth-client'
import { apiFetch } from '../../utils/api-client'
import { storage } from '../../utils/offline-storage'

export type DisplayCurrency = 'XOF' | 'EUR' | 'USD' | 'CAD'

/** FCFA per unit of each foreign currency, eBio's margin already included. */
export type CurrencyRates = Partial<Record<Exclude<DisplayCurrency, 'XOF'>, number>>

interface CurrencyContextValue {
  currency: DisplayCurrency
  setCurrency: (currency: DisplayCurrency) => void
  rates: CurrencyRates
}

export const CURRENCY_STORAGE_KEY = 'ebio_display_currency'

const FOREIGN_CURRENCIES = ['EUR', 'USD', 'CAD'] as const

function isDisplayCurrency(value: unknown): value is DisplayCurrency {
  return value === 'XOF' || value === 'EUR' || value === 'USD' || value === 'CAD'
}

/** Keeps only positive numeric rates from the untyped `currencies` payload. */
function parseRates(raw: unknown): CurrencyRates {
  const rates: CurrencyRates = {}
  if (!raw || typeof raw !== 'object')
    return rates
  const currencies = raw as Record<string, unknown>
  for (const code of FOREIGN_CURRENCIES) {
    const entry = currencies[code] as Record<string, unknown> | undefined
    const rate = Number(entry?.rate)
    if (Number.isFinite(rate) && rate > 0)
      rates[code] = rate
  }
  return rates
}

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: 'XOF',
  setCurrency: () => {},
  rates: {},
})

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [preferred, setPreferred] = useState<DisplayCurrency>(() => {
    const stored = storage.getString(CURRENCY_STORAGE_KEY)
    return isDisplayCurrency(stored) ? stored : 'XOF'
  })
  const [rates, setRates] = useState<CurrencyRates>({})
  const { data: session } = useSession()
  const userId = session?.user.id ?? null
  const previousUserId = useRef<string | null>(null)

  // Rates: read once; without them every price stays in FCFA.
  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      try {
        const res = await apiFetch('/api/settings/public')
        if (res.ok && !cancelled) {
          const data = await res.json() as Record<string, unknown>
          setRates(parseRates(data.currencies))
        }
      }
      catch {
        // keep FCFA: a network hiccup must not break prices
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  // Profile: on sign-in the account's choice wins; on sign-out the choice,
  // which belongs to the account, goes back to FCFA.
  useEffect(() => {
    const previous = previousUserId.current
    previousUserId.current = userId
    if (!userId) {
      if (previous) {
        setPreferred('XOF')
        storage.delete(CURRENCY_STORAGE_KEY)
      }
      return
    }
    let cancelled = false
    async function syncFromProfile(): Promise<void> {
      try {
        const res = await apiFetch('/api/users/me')
        if (!res.ok || cancelled)
          return
        const data = await res.json() as Record<string, unknown>
        if (isDisplayCurrency(data.displayCurrency)) {
          setPreferred(data.displayCurrency)
          storage.set(CURRENCY_STORAGE_KEY, data.displayCurrency)
        }
      }
      catch {
        // keep the local copy
      }
    }
    syncFromProfile()
    return () => {
      cancelled = true
    }
  }, [userId])

  const setCurrency = useCallback((next: DisplayCurrency) => {
    setPreferred(next)
    storage.set(CURRENCY_STORAGE_KEY, next)
    if (!userId)
      return
    apiFetch('/api/users/me', {
      method: 'PUT',
      body: JSON.stringify({ displayCurrency: next }),
    }).catch(() => undefined)
  }, [userId])

  // A currency without a known rate cannot be shown: fall back to FCFA.
  const currency: DisplayCurrency = preferred !== 'XOF' && rates[preferred] ? preferred : 'XOF'

  const value = useMemo(() => ({
    currency,
    setCurrency,
    rates,
  }), [currency, setCurrency, rates])

  return (
    <CurrencyContext value={value}>
      {children}
    </CurrencyContext>
  )
}

export function useCurrency() {
  return use(CurrencyContext)
}
