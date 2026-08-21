import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../../utils/api-client'
import { useLocation } from '../../common/location-context'

export interface NearbySupplier {
  id: string
  /** Identifiant et nom du point de vente quand le pin n'est pas la boutique. */
  salesPointId: string | null
  salesPointName: string | null
  shopName: string
  /** Photo de couverture de la boutique — `null` si le fournisseur n'en a pas. */
  coverPhoto: string | null
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
  loading: boolean
  error: string | null
  refresh: () => void
}

/**
 * Fournisseurs autour de la position de l'application. La position vient du
 * contexte partagé — GPS ou choix manuel de l'utilisateur — et non d'une
 * seconde géolocalisation : sinon la carte se centre à un endroit et affiche
 * les marqueurs d'un autre.
 */
export function useNearbySuppliers(radiusKm?: number): UseNearbyResult {
  const { latitude, longitude, loading: locationLoading } = useLocation()
  const [suppliers, setSuppliers] = useState<NearbySupplier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSuppliers = useCallback(async (lat: number, lng: number) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ latitude: String(lat), longitude: String(lng) })
      if (radiusKm)
        params.set('radius', String(radiusKm))
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

  useEffect(() => {
    if (locationLoading)
      return
    fetchSuppliers(latitude, longitude)
  }, [locationLoading, latitude, longitude, fetchSuppliers])

  const refresh = useCallback(() => {
    fetchSuppliers(latitude, longitude)
  }, [latitude, longitude, fetchSuppliers])

  return { suppliers, loading, error, refresh }
}
