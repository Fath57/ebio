import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Location from 'expo-location'
import * as React from 'react'
import { createContext, use, useCallback, useEffect, useMemo, useState } from 'react'

interface Coords {
  latitude: number
  longitude: number
}

type LocationSource = 'default' | 'gps' | 'manual'

interface LocationState {
  latitude: number
  longitude: number
  /** Libellé ville/région pour l'affichage. */
  label: string
  source: LocationSource
  loading: boolean
}

interface LocationContextValue extends LocationState {
  /** Fixe une position choisie manuellement (carte) et la persiste. */
  setManualLocation: (coords: Coords & { label?: string }) => Promise<void>
  /** Repasse sur la position GPS de l'appareil et oublie le choix manuel. */
  useDeviceLocation: () => Promise<void>
}

// Repli quand la permission est refusée ou la position indisponible.
const DEFAULT_LOCATION = { latitude: 14.6928, longitude: -17.4467, label: 'Dakar' }
const STORAGE_KEY = 'user_location'

const LocationContext = createContext<LocationContextValue | null>(null)

async function reverseLabel(coords: Coords): Promise<string> {
  try {
    const geo = await Location.reverseGeocodeAsync(coords)
    const place = geo[0]
    if (place) {
      return place.city ?? place.subregion ?? place.region ?? 'Ma position'
    }
  }
  catch {
    // Reverse-geocoding optionnel
  }
  return 'Ma position'
}

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<LocationState>({
    ...DEFAULT_LOCATION,
    source: 'default',
    loading: true,
  })

  const detectDevice = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        setState({ ...DEFAULT_LOCATION, source: 'default', loading: false })
        return
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude }
      const label = await reverseLabel(coords)
      setState({ ...coords, label, source: 'gps', loading: false })
    }
    catch {
      setState({ ...DEFAULT_LOCATION, source: 'default', loading: false })
    }
  }, [])

  // Au démarrage : restaure un choix manuel persisté, sinon détecte le GPS.
  useEffect(() => {
    let cancelled = false
    async function init() {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY)
        if (raw) {
          const saved = JSON.parse(raw) as Coords & { label?: string }
          if (!cancelled) {
            setState({
              latitude: saved.latitude,
              longitude: saved.longitude,
              label: saved.label ?? 'Position choisie',
              source: 'manual',
              loading: false,
            })
          }
          return
        }
      }
      catch {
        // Lecture du stockage échouée — on bascule sur la détection
      }
      if (!cancelled) {
        await detectDevice()
      }
    }
    init()
    return () => {
      cancelled = true
    }
  }, [detectDevice])

  const setManualLocation = useCallback(async (coords: Coords & { label?: string }) => {
    // Coordonnées appliquées immédiatement ; le libellé se précise ensuite.
    setState({
      latitude: coords.latitude,
      longitude: coords.longitude,
      label: coords.label ?? 'Position choisie',
      source: 'manual',
      loading: false,
    })
    const label = coords.label ?? await reverseLabel(coords)
    setState(s => ({ ...s, label }))
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ latitude: coords.latitude, longitude: coords.longitude, label }))
    }
    catch {
      // Persistance best-effort
    }
  }, [])

  const useDeviceLocation = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY)
    }
    catch {
      // Best-effort
    }
    setState(s => ({ ...s, loading: true }))
    await detectDevice()
  }, [detectDevice])

  const value = useMemo<LocationContextValue>(
    () => ({ ...state, setManualLocation, useDeviceLocation }),
    [state, setManualLocation, useDeviceLocation],
  )

  return <LocationContext value={value}>{children}</LocationContext>
}

export function useLocation(): LocationContextValue {
  const ctx = use(LocationContext)
  if (!ctx) {
    throw new Error('useLocation must be used within a LocationProvider')
  }
  return ctx
}
