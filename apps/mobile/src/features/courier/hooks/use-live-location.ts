import * as Location from 'expo-location'
import { useEffect } from 'react'
import { apiFetch } from '../../../utils/api-client'

/**
 * Streams the courier position to the API while a delivery is in progress,
 * feeding the buyer's live tracking map. Foreground only (v1): the watcher
 * pauses with the app, and the map shows the position's age.
 */
export function useLiveLocation(active: boolean) {
  useEffect(() => {
    if (!active) {
      return
    }

    let cancelled = false
    let subscription: Location.LocationSubscription | null = null

    const start = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted' || cancelled) {
        return
      }
      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 20000,
          distanceInterval: 50,
        },
        (location) => {
          apiFetch('/api/couriers/me/location', {
            method: 'PATCH',
            body: JSON.stringify({
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            }),
          }).catch(() => {
            // Offline blips are fine — the next fix will go through
          })
        },
      )
      // The permission prompt can outlive the screen: drop a late subscription
      if (cancelled) {
        subscription.remove()
        subscription = null
      }
    }

    start()

    return () => {
      cancelled = true
      subscription?.remove()
    }
  }, [active])
}
