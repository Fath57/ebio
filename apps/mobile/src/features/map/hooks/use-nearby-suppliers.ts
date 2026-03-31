import { useCallback, useEffect, useState } from 'react'
import * as Location from 'expo-location'
import { apiFetch } from '../../../utils/api-client'

export interface NearbySupplier {
  id: string
  shopName: string
  latitude: number
  longitude: number
  rating: number | null
  isOpen: boolean
  isValidated: boolean
  mode: 'CONTACT' | 'ORDER'
  topProduct: string | null
  distance: number
}

interface UseNearbyResult {
  suppliers: NearbySupplier[]
  userLocation: { latitude: number, longitude: number } | null
  loading: boolean
  error: string | null
  refresh: () => void
}

const DEFAULT_LOCATION = { latitude: 14.6928, longitude: -17.4467 } // Dakar

export function useNearbySuppliers(radiusKm?: number): UseNearbyResult {
  const [suppliers, setSuppliers] = useState<NearbySupplier[]>([])
  const [userLocation, setUserLocation] = useState<{ latitude: number, longitude: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSuppliers = useCallback(async (lat: number, lng: number) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ latitude: String(lat), longitude: String(lng) })
      if (radiusKm) params.set('radius', String(radiusKm))
      const res = await apiFetch(`/api/suppliers/nearby?${params}`)
      if (res.ok) {
        const data = (await res.json()) as NearbySupplier[]
        setSuppliers(data)
      }
    }
    catch {
      setError('Impossible de charger les fournisseurs')
    }
    finally {
      setLoading(false)
    }
  }, [radiusKm])

  const detectLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        setUserLocation(DEFAULT_LOCATION)
        await fetchSuppliers(DEFAULT_LOCATION.latitude, DEFAULT_LOCATION.longitude)
        return
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      })
      const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude }
      setUserLocation(coords)
      await fetchSuppliers(coords.latitude, coords.longitude)
    }
    catch {
      setUserLocation(DEFAULT_LOCATION)
      await fetchSuppliers(DEFAULT_LOCATION.latitude, DEFAULT_LOCATION.longitude)
    }
  }, [fetchSuppliers])

  useEffect(() => {
    detectLocation()
  }, [detectLocation])

  const refresh = useCallback(() => {
    if (userLocation) {
      fetchSuppliers(userLocation.latitude, userLocation.longitude)
    }
    else {
      detectLocation()
    }
  }, [userLocation, fetchSuppliers, detectLocation])

  return { suppliers, userLocation, loading, error, refresh }
}
