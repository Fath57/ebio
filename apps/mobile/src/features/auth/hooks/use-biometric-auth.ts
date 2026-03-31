import * as LocalAuthentication from 'expo-local-authentication'
import { useCallback, useEffect, useState } from 'react'
import { apiFetch, setTokens } from '../../../utils/api-client'
import { storage } from '../../../utils/offline-storage'

const BIOMETRIC_DEVICE_KEY = 'biometric_device_id'
const BIOMETRIC_KEY = 'biometric_key'

export function useBiometricAuth() {
  const [isAvailable, setIsAvailable] = useState(false)
  const [isEnabled, setIsEnabled] = useState(false)

  useEffect(() => {
    checkAvailability()
  }, [])

  async function checkAvailability() {
    const compatible = await LocalAuthentication.hasHardwareAsync()
    const enrolled = await LocalAuthentication.isEnrolledAsync()
    setIsAvailable(compatible && enrolled)
    setIsEnabled(!!storage.getString(BIOMETRIC_KEY))
  }

  const enable = useCallback(async (): Promise<boolean> => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Activer l\'authentification biométrique',
      cancelLabel: 'Annuler',
      disableDeviceFallback: false,
    })

    if (!result.success)
      return false

    const deviceId = storage.getString(BIOMETRIC_DEVICE_KEY)
      ?? Math.random().toString(36).substring(2)
    const biometricKey = Math.random().toString(36).substring(2, 34)

    try {
      const res = await apiFetch('/api/auth/biometric/enable', {
        method: 'POST',
        body: JSON.stringify({ deviceId, biometricKey }),
      })

      if (res.ok) {
        storage.set(BIOMETRIC_DEVICE_KEY, deviceId)
        storage.set(BIOMETRIC_KEY, biometricKey)
        setIsEnabled(true)
        return true
      }
    }
    catch { /* silent */ }

    return false
  }, [])

  const authenticate = useCallback(async (): Promise<boolean> => {
    const deviceId = storage.getString(BIOMETRIC_DEVICE_KEY)
    const biometricKey = storage.getString(BIOMETRIC_KEY)

    if (!deviceId || !biometricKey)
      return false

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Se connecter à eBio',
      cancelLabel: 'Annuler',
      disableDeviceFallback: false,
    })

    if (!result.success)
      return false

    try {
      const res = await apiFetch('/api/auth/biometric/verify', {
        method: 'POST',
        body: JSON.stringify({ deviceId, biometricKey }),
      })

      if (res.ok) {
        const data = await res.json()
        await setTokens(data.accessToken, data.refreshToken)
        return true
      }
    }
    catch { /* silent */ }

    return false
  }, [])

  const disable = useCallback(() => {
    storage.delete(BIOMETRIC_KEY)
    storage.delete(BIOMETRIC_DEVICE_KEY)
    setIsEnabled(false)
  }, [])

  return { isAvailable, isEnabled, enable, authenticate, disable }
}
