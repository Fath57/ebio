import type { TerroirCountry, TerroirCountryInfo } from './terroir-api'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as React from 'react'
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { readTerroirSwitch } from './terroir-api'
import { useTerroirCart } from './terroir-cart-context'

/**
 * The « mode Valise »: while it is on, the whole shopping app (home, search,
 * shops, product pages) fills the valise instead of the local cart, and the
 * cart tab becomes « Ma valise ». The local cart is never touched.
 *
 * The destination is the valise's own country (terroir cart context): the
 * mode only says whether the app shops for it.
 */

export const TERROIR_MODE_KEY = 'ebio_terroir_mode'

interface StoredMode {
  active: boolean
  country: TerroirCountry | null
}

interface ValiseModeValue {
  /** On, with a known destination: the shopping screens act for the valise. */
  active: boolean
  country: TerroirCountry | null
  countryInfo: TerroirCountryInfo | null
  /** Turns the mode on, optionally for a given destination. */
  enter: (country?: TerroirCountry) => void
  exit: () => void
}

function readStored(raw: string | null): StoredMode | null {
  if (!raw)
    return null
  try {
    const parsed = JSON.parse(raw) as Partial<StoredMode>
    return {
      active: parsed.active === true,
      country: typeof parsed.country === 'string' && /^[A-Z]{2}$/.test(parsed.country) ? parsed.country : null,
    }
  }
  catch {
    return null
  }
}

const ValiseModeContext = createContext<ValiseModeValue | null>(null)

export function ValiseModeProvider({ children }: { children: React.ReactNode }) {
  const { country, countryInfo, countries, countriesError, setCountry, reloadCountries } = useTerroirCart()
  const [wanted, setWanted] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const loadedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    AsyncStorage.getItem(TERROIR_MODE_KEY)
      .then((raw) => {
        if (cancelled)
          return
        const stored = readStored(raw)
        if (stored?.active)
          setWanted(true)
      })
      .catch(() => undefined)
      .finally(() => {
        loadedRef.current = true
        setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!loadedRef.current)
      return
    const stored: StoredMode = { active: wanted, country }
    AsyncStorage.setItem(TERROIR_MODE_KEY, JSON.stringify(stored)).catch(() => undefined)
  }, [wanted, country, loaded])

  // No country offered any more: the mode has nothing to shop for.
  useEffect(() => {
    if (wanted && countries !== null && countries.length === 0)
      setWanted(false)
  }, [wanted, countries])

  // The provider asked for the countries once, maybe while the module was off.
  const countriesMissing = countries === null && countriesError === null
  useEffect(() => {
    if (wanted && countriesMissing)
      reloadCountries()
  }, [wanted, countriesMissing, reloadCountries])

  // The switch turned off in the back-office: leave quietly, on arrival and
  // whenever the app comes back to the foreground. An unreadable switch
  // (offline) keeps the mode as it is.
  useEffect(() => {
    if (!wanted)
      return
    let cancelled = false
    const check = (): void => {
      readTerroirSwitch()
        .then((enabled) => {
          if (!cancelled && enabled === false)
            setWanted(false)
        })
        .catch(() => undefined)
    }
    check()
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active')
        check()
    })
    return () => {
      cancelled = true
      subscription.remove()
    }
  }, [wanted])

  const enter = useCallback((target?: TerroirCountry) => {
    if (target)
      setCountry(target)
    setWanted(true)
  }, [setCountry])

  const exit = useCallback(() => {
    setWanted(false)
  }, [])

  const active = wanted && countryInfo !== null
  const value = useMemo<ValiseModeValue>(() => ({
    active,
    country: active ? country : null,
    countryInfo: active ? countryInfo : null,
    enter,
    exit,
  }), [active, country, countryInfo, enter, exit])

  return (
    <ValiseModeContext value={value}>
      {children}
    </ValiseModeContext>
  )
}

export function useValiseMode(): ValiseModeValue {
  const value = use(ValiseModeContext)
  if (!value)
    throw new Error('useValiseMode must be used inside ValiseModeProvider')
  return value
}
