import * as Notifications from 'expo-notifications'
import { useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'
import { navigationRef } from '../../../app/navigation-ref'
import { apiFetch } from '../../../utils/api-client'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

export function useNotifications() {
  const [deviceToken, setDeviceToken] = useState<string | null>(null)
  const notificationListener = useRef<Notifications.EventSubscription>()
  const responseListener = useRef<Notifications.EventSubscription>()

  useEffect(() => {
    registerForPush().then(setDeviceToken)

    notificationListener.current = Notifications.addNotificationReceivedListener((_notification) => {
      // Foreground notification — handled by the notification handler above
    })

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data
      handleNotificationTap(data)
    })

    return () => {
      notificationListener.current?.remove()
      responseListener.current?.remove()
    }
  }, [])

  return { deviceToken }
}

async function registerForPush(): Promise<string | null> {
  if (Platform.OS === 'web') return null

  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') return null

  // Android: configure notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('ebio-default', {
      name: 'eBio',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
    })
  }

  try {
    // Get native FCM/APNs device token
    const tokenData = await Notifications.getDevicePushTokenAsync()
    const token = tokenData.data as string

    // Register token with backend
    await apiFetch('/api/notifications/register-token', {
      method: 'POST',
      body: JSON.stringify({ token, platform: Platform.OS }),
    })

    return token
  }
  catch {
    return null
  }
}

function handleNotificationTap(data: Record<string, unknown>) {
  if (!navigationRef.isReady()) return

  const type = data.type as string

  switch (type) {
    case 'ORDER_PLACED':
    case 'ORDER_ACCEPTED':
    case 'ORDER_REJECTED':
    case 'ORDER_READY':
    case 'ORDER_DELIVERED':
    case 'ORDER_CANCELLED':
      if (data.orderId) {
        navigationRef.navigate('Profil' as never, {
          screen: 'OrderTracking',
          params: { orderId: data.orderId },
        } as never)
      }
      break
    case 'NEW_MESSAGE':
      // TODO: navigation.navigate('Chat', { conversationId: data.conversationId })
      break
    case 'SUPPLIER_VALIDATED':
    case 'SUPPLIER_REJECTED':
    case 'SUPPLIER_COMPLEMENT':
      navigationRef.navigate('Profil' as never, {
        screen: 'SupplierDashboard',
      } as never)
      break
    case 'STOCK_ALERT':
      // TODO: navigation.navigate('ProductEdit', { productId: data.productId })
      break
    default:
      break
  }
}
