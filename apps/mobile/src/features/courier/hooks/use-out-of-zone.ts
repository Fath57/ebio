import type { CourierProfile } from '../types'
import { useFocusEffect } from '@react-navigation/native'
import * as Location from 'expo-location'
import { useCallback, useState } from 'react'

const EARTH_RADIUS_KM = 6371

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))
}

/**
 * Distance between the device and the courier's declared zone when the courier
 * is clearly outside it — beyond twice the zone radius. Dispatch uses the live
 * position first, so a courier far from their zone silently stops receiving
 * offers; this surfaces the reason. `null` while inside, unknown or unavailable.
 * The permission is never prompted here: the availability toggle owns that.
 */
export function useOutOfZone(profile: CourierProfile | null): number | null {
  const [distanceKm, setDistanceKm] = useState<number | null>(null)

  const zoneLat = profile?.zoneLatitude ?? null
  const zoneLng = profile?.zoneLongitude ?? null
  const zoneRadiusKm = profile?.zoneRadiusKm ?? null
  const isAvailable = profile?.isAvailable ?? false

  const check = useCallback(async () => {
    if (!isAvailable || zoneLat === null || zoneLng === null || zoneRadiusKm === null) {
      setDistanceKm(null)
      return
    }
    try {
      const { status } = await Location.getForegroundPermissionsAsync()
      if (status !== 'granted') {
        setDistanceKm(null)
        return
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const km = haversineKm(position.coords.latitude, position.coords.longitude, zoneLat, zoneLng)
      setDistanceKm(km > zoneRadiusKm * 2 ? km : null)
    }
    catch {
      setDistanceKm(null)
    }
  }, [isAvailable, zoneLat, zoneLng, zoneRadiusKm])

  useFocusEffect(
    useCallback(() => {
      check()
    }, [check]),
  )

  return distanceKm
}
