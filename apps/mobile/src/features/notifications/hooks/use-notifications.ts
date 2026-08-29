import * as Notifications from 'expo-notifications'
import { useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'
import { navigationRef } from '../../../app/navigation-ref'
import { useSession } from '../../../lib/auth-client'
import { apiFetch } from '../../../utils/api-client'
import { APP_VARIANT } from '../../../utils/app-variant'
import { storage } from '../../../utils/offline-storage'
import { PUSH_TOKEN_KEY } from '../push-token'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

// A tap arriving before the navigator is ready (cold start from a killed app)
// is parked here and flushed once navigation mounts, instead of being dropped.
let pendingTap: Record<string, unknown> | null = null

// The hook is mounted by each variant's navigation root; the guard keeps a
// stray second mount (e.g. during fast refresh) from double-registering
// listeners and firing every tap twice.
let hookActive = false

/**
 * Android channels, created unconditionally and BEFORE the permission gate:
 * FCM messages reference these ids, and a channel created after a late
 * permission grant would silently downgrade to low importance.
 */
async function setupAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') {
    return
  }
  await Notifications.setNotificationChannelAsync('ebio-default', {
    name: 'eBio',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
  })
  // Courier job offers: time-critical, must cut through
  await Notifications.setNotificationChannelAsync('ebio-offers', {
    name: 'Courses à livrer',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 400, 200, 400, 200, 400],
    bypassDnd: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  })
  await Notifications.setNotificationChannelAsync('ebio-messages', {
    name: 'Messages',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
  })
}

export function useNotifications() {
  const [deviceToken, setDeviceToken] = useState<string | null>(null)
  const { data: session } = useSession()
  const userId = session?.user.id ?? null
  const notificationListener = useRef<Notifications.EventSubscription | null>(null)
  const responseListener = useRef<Notifications.EventSubscription | null>(null)

  // Listeners + cold-start tap: once per app lifetime
  useEffect(() => {
    if (hookActive) {
      return
    }
    hookActive = true

    setupAndroidChannels().catch(() => {
      // Channel creation failing is non-fatal; FCM falls back to defaults
    })

    notificationListener.current = Notifications.addNotificationReceivedListener((_notification) => {
      // Foreground notification — handled by the notification handler above
    })

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data
      handleNotificationTap(data)
    })

    // Cold start from a killed app: the launch tap never reaches the listener
    // above in time, so it is replayed explicitly.
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) {
          handleNotificationTap(response.notification.request.content.data)
        }
      })
      .catch(() => {
        // No launch notification — normal start
      })

    // Flush the parked tap as soon as the navigator can route it
    const flushTimer = setInterval(() => {
      if (pendingTap && navigationRef.isReady()) {
        const tap = pendingTap
        pendingTap = null
        handleNotificationTap(tap)
      }
    }, 500)
    const flushStop = setTimeout(() => {
      clearInterval(flushTimer)
      pendingTap = null
    }, 20000)

    return () => {
      hookActive = false
      notificationListener.current?.remove()
      responseListener.current?.remove()
      clearInterval(flushTimer)
      clearTimeout(flushStop)
    }
  }, [])

  // Token registration: needs an authenticated session, and re-runs when the
  // account changes so the token always points at the signed-in user.
  useEffect(() => {
    if (!userId) {
      return
    }
    let cancelled = false
    registerForPush().then((token) => {
      if (!cancelled) {
        setDeviceToken(token)
      }
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  return { deviceToken }
}

async function registerForPush(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return null
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') {
    return null
  }

  try {
    // Native FCM/APNs device token — throws when the build has no
    // google-services file (supplier/courier before their Firebase apps exist)
    const tokenData = await Notifications.getDevicePushTokenAsync()
    const token = tokenData.data as string

    const res = await apiFetch('/api/notifications/register-token', {
      method: 'POST',
      body: JSON.stringify({ token, platform: Platform.OS, app: APP_VARIANT }),
    })
    if (!res.ok) {
      console.warn(`Push token registration failed (${res.status})`)
      return null
    }

    // Remembered for the logout cleanup
    storage.set(PUSH_TOKEN_KEY, token)
    return token
  }
  catch (error) {
    console.warn(`Push token unavailable: ${(error as Error).message}`)
    return null
  }
}

export function handleNotificationTap(data: Record<string, unknown>) {
  if (!navigationRef.isReady()) {
    pendingTap = data
    return
  }

  const type = data.type as string

  if (APP_VARIANT === 'courier') {
    handleCourierTap(type, data)
    return
  }
  if (APP_VARIANT === 'supplier') {
    handleSupplierTap(type, data)
    return
  }

  switch (type) {
    case 'ORDER_PLACED':
    case 'ORDER_ACCEPTED':
    case 'ORDER_REJECTED':
    case 'ORDER_READY':
    case 'ORDER_DELIVERED':
    case 'ORDER_CANCELLED':
    case 'DELIVERY_ASSIGNED':
    case 'DELIVERY_PICKED_UP':
    case 'DELIVERY_FAILED':
      // OrderTracking lives in the Commandes stack: order statuses and
      // delivery progress (assigned courier, confirmation code) land there.
      if (data.orderId) {
        navigationRef.navigate('Commandes', {
          screen: 'OrderTracking',
          params: { orderId: data.orderId },
        })
      }
      break
    case 'NEW_MESSAGE':
      if (data.conversationId) {
        navigationRef.navigate('Chat', {
          screen: 'ChatDetail',
          params: {
            conversationId: data.conversationId,
            peerName: (data.peerName as string) ?? 'Discussion',
            isSupplier: false,
            orderId: null,
            kind: data.kind === 'COURIER' ? 'COURIER' : 'SUPPLIER',
          },
        })
      }
      else {
        navigationRef.navigate('Chat', { screen: 'ChatHome' })
      }
      break
    case 'SUPPLIER_VALIDATED':
    case 'SUPPLIER_REJECTED':
    case 'SUPPLIER_COMPLEMENT':
      // In the client variant the supplier space moved to the dedicated app;
      // the profile screen shows the migration banner.
      navigationRef.navigate('Profil')
      break
    case 'STOCK_ALERT':
    case 'STOCK_AVAILABLE':
      navigationRef.navigate('Accueil')
      break
    default:
      break
  }
}

/** Courier variant tabs: Courses / Historique / Profil. */
function handleCourierTap(type: string, data: Record<string, unknown>) {
  switch (type) {
    case 'DELIVERY_OFFER':
    case 'DELIVERY_REASSIGNED':
    case 'ORDER_CANCELLED':
      navigationRef.navigate('Courses')
      break
    case 'NEW_MESSAGE':
      // Buyer thread of a delivery: lives in the Courses branch
      if (data.conversationId) {
        navigationRef.navigate('Courses', {
          screen: 'CourierChat',
          params: {
            conversationId: data.conversationId,
            peerName: (data.peerName as string) ?? 'Client',
            kind: 'COURIER',
          },
        })
      }
      else {
        navigationRef.navigate('Courses')
      }
      break
    case 'COURIER_VALIDATED':
    case 'COURIER_REJECTED':
    case 'COURIER_SUSPENDED':
    case 'SYSTEM':
      // The gate re-fetches the profile when the app comes to foreground;
      // landing on Profil is enough once validated.
      navigationRef.navigate('Profil')
      break
    default:
      break
  }
}

/** Supplier variant tabs: Accueil (dashboard) / Commandes / Chat / Profil. */
function handleSupplierTap(type: string, data: Record<string, unknown>) {
  switch (type) {
    case 'ORDER_PLACED':
    case 'ORDER_CANCELLED':
    case 'DELIVERY_ASSIGNED':
    case 'DELIVERY_PICKED_UP':
    case 'DELIVERY_FAILED':
    case 'DISPUTE_OPENED':
    case 'DISPUTE_RESOLVED':
      // Straight to the order when the payload carries it
      if (data.orderId) {
        navigationRef.navigate('Commandes', {
          screen: 'SupplierOrderDetail',
          params: { orderId: data.orderId },
        })
      }
      else {
        navigationRef.navigate('Commandes')
      }
      break
    case 'NEW_MESSAGE':
      if (data.conversationId) {
        navigationRef.navigate('Chat', {
          screen: 'ChatDetail',
          params: {
            conversationId: data.conversationId,
            peerName: (data.peerName as string) ?? 'Discussion',
            isSupplier: true,
            orderId: null,
            kind: data.kind === 'COURIER' ? 'COURIER' : 'SUPPLIER',
          },
        })
      }
      else {
        navigationRef.navigate('Chat')
      }
      break
    case 'PAYMENT_RECEIVED':
    case 'PAYMENT_RELEASED':
    case 'ESCROW_REMINDER':
      navigationRef.navigate('Accueil', { screen: 'SupplierWallet' })
      break
    case 'NEW_REVIEW':
      navigationRef.navigate('Accueil', { screen: 'SupplierReviews' })
      break
    case 'STOCK_ALERT':
      navigationRef.navigate('Accueil', { screen: 'SupplierProducts' })
      break
    case 'SUPPLIER_VALIDATED':
    case 'SUPPLIER_REJECTED':
    case 'SUPPLIER_COMPLEMENT':
      // Behind the gate these routes may not exist; the gate itself refreshes
      // on foreground, so a failed navigate is harmless.
      navigationRef.navigate('Accueil')
      break
    default:
      break
  }
}
