import * as Notifications from 'expo-notifications'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Linking, Platform } from 'react-native'
import { askForPush } from './use-notifications'

interface PushDisabledState {
  /** The phone will not ring: the permission is not granted. */
  disabled: boolean
  /** Opens the system dialog, or the settings once the system no longer asks. */
  enable: () => Promise<void>
}

/**
 * Whether notifications are off on this phone, read again each time the app
 * comes back: the permission is often changed in the settings, out of our sight.
 * Seen granted after having been off, the device is registered at once rather
 * than at the next sign-in.
 */
export function usePushDisabled(): PushDisabledState {
  const [disabled, setDisabled] = useState(false)
  const wasDisabled = useRef(false)

  const check = useCallback(async () => {
    if (Platform.OS === 'web') {
      return
    }
    try {
      const { status } = await Notifications.getPermissionsAsync()
      const isOff = status !== 'granted'
      if (!isOff && wasDisabled.current) {
        await askForPush()
      }
      wasDisabled.current = isOff
      setDisabled(isOff)
    }
    catch {
      // A permission we cannot read must not raise a false alarm.
    }
  }, [])

  useEffect(() => {
    check()
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        check()
      }
    })
    return () => {
      sub.remove()
    }
  }, [check])

  const enable = useCallback(async () => {
    const { status, canAskAgain } = await Notifications.getPermissionsAsync()
    if (status !== 'granted' && !canAskAgain) {
      await Linking.openSettings()
      return
    }
    await askForPush()
    await check()
  }, [check])

  return { disabled, enable }
}
