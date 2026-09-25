import * as LocalAuthentication from 'expo-local-authentication'
import * as SecureStore from 'expo-secure-store'
import { useCallback, useEffect, useState } from 'react'
import { AppState, Platform } from 'react-native'
import { apiFetch, setSessionToken } from '../../../utils/api-client'

/**
 * What this phone keeps, and where.
 *
 * In the keystore, not in the ordinary cache: the secret opens the account
 * without a password, so it is a credential and belongs where the system puts
 * credentials. The device identifier lives there too, only because it must
 * survive alongside it.
 */
const DEVICE_KEY = 'ebio_device_id'
const SECRET_KEY = 'ebio_biometric_secret'

/**
 * A plain marker saying a secret exists.
 *
 * The secret itself is locked behind the fingerprint, so merely asking whether
 * it is there would raise a prompt — on the login screen, before anyone had
 * asked for anything. This flag answers that question without touching it.
 */
const HAS_SECRET_KEY = 'ebio_biometric_on'

/**
 * Locked by the system, not by us.
 *
 * The keystore asks for the fingerprint itself when the secret is read, and —
 * the reason for doing it this way — Android destroys the entry when the
 * enrolled fingerprints change. A finger added to the phone after the fact
 * therefore opens nothing.
 */
const LOCKED: SecureStore.SecureStoreOptions = {
  requireAuthentication: true,
  authenticationPrompt: 'Se connecter à eBio',
}

export interface TrustedDeviceRow {
  id: string
  label: string
  createdAt: string
  lastUsedAt: string | null
  current: boolean
}

/** A name its owner will recognise in the list of trusted devices. */
function deviceLabel(): string {
  const model = (Platform.constants as { Model?: string } | undefined)?.Model
  if (typeof model === 'string' && model.trim().length > 0) {
    return model.trim().slice(0, 120)
  }
  return Platform.OS === 'ios' ? 'iPhone' : 'Téléphone Android'
}

/**
 * This phone's identifier, drawn once and kept.
 *
 * Not the hardware id: an app-scoped identifier is enough to tell devices
 * apart, and reinstalling the app starts a fresh one — which is correct, since
 * the keystore went with it.
 */
async function deviceId(): Promise<string> {
  const stored = await SecureStore.getItemAsync(DEVICE_KEY)
  if (stored) {
    return stored
  }
  const created = `${Platform.OS}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  await SecureStore.setItemAsync(DEVICE_KEY, created)
  return created
}

async function promptFingerprint(message: string): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: message,
    cancelLabel: 'Annuler',
    disableDeviceFallback: false,
  })
  return result.success
}

/** Whether a secret is held here — cheap enough to ask before showing a button. */
export async function hasBiometricSecret(): Promise<boolean> {
  return (await SecureStore.getItemAsync(HAS_SECRET_KEY)) === '1'
}

async function forgetSecret(): Promise<void> {
  await SecureStore.deleteItemAsync(SECRET_KEY, LOCKED)
  await SecureStore.deleteItemAsync(HAS_SECRET_KEY)
}

/**
 * Signs in with the fingerprint alone.
 *
 * Lives outside the hook because the login screen calls it before anything is
 * mounted, and it needs no state of its own.
 */
export async function signInWithBiometrics(): Promise<{ ok: boolean, error: string | null }> {
  if (!(await hasBiometricSecret())) {
    return { ok: false, error: null }
  }

  // Reading raises the fingerprint prompt, and throws when it is refused or
  // when the system dropped the entry after the fingerprints changed.
  let secret: string | null = null
  try {
    secret = await SecureStore.getItemAsync(SECRET_KEY, LOCKED)
  }
  catch {
    return { ok: false, error: null }
  }

  if (!secret) {
    await forgetSecret()
    return { ok: false, error: 'La connexion par empreinte a été désactivée sur ce téléphone.' }
  }

  try {
    const res = await apiFetch('/api/otp-auth/biometric/verify', {
      method: 'POST',
      body: JSON.stringify({ deviceId: await deviceId(), secret }),
    })

    if (!res.ok) {
      // The server refuses a device it no longer trusts — revoked from another
      // phone, most often. Keeping the secret would offer a button that can
      // only fail.
      await forgetSecret()
      return { ok: false, error: 'Cet appareil n\'est plus reconnu. Connectez-vous autrement.' }
    }

    const data = await res.json() as { accessToken?: string }
    if (!data.accessToken) {
      return { ok: false, error: 'Connexion impossible pour le moment.' }
    }

    await setSessionToken(data.accessToken)
    return { ok: true, error: null }
  }
  catch {
    return { ok: false, error: 'Connexion impossible : vérifiez votre réseau.' }
  }
}

/**
 * Trusting this phone, and the list of phones already trusted.
 *
 * The secret is drawn by the server and handed over once; it is written to the
 * keystore before anything else, because nothing can ask for it again.
 */
export function useBiometricAuth() {
  const [isAvailable, setIsAvailable] = useState(false)
  const [isEnabled, setIsEnabled] = useState(false)
  const [devices, setDevices] = useState<TrustedDeviceRow[]>([])
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    setIsEnabled(await hasBiometricSecret())
    try {
      const res = await apiFetch(`/api/otp-auth/biometric/devices?deviceId=${encodeURIComponent(await deviceId())}`)
      if (res.ok) {
        const data = await res.json() as { devices?: TrustedDeviceRow[] }
        setDevices(data.devices ?? [])
      }
    }
    catch {
      // The list is a convenience; the switch above is what matters.
    }
  }, [])

  const check = useCallback(async (): Promise<void> => {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync()
      const enrolled = await LocalAuthentication.isEnrolledAsync()
      setIsAvailable(compatible && enrolled)
      if (!compatible || !enrolled) {
        // Said out loud, because the switch simply is not drawn and the
        // absence looks the same whatever the reason: no sensor, no
        // fingerprint recorded on the phone, or a build without the native
        // half. Three different things to do about it.
        console.warn(`[empreinte] masquée — capteur ${compatible ? 'présent' : 'absent'}, empreinte ${enrolled ? 'enrôlée' : 'non enrôlée'}`)
      }
    }
    catch (caught) {
      // Swallowed, this left the switch hidden with no trace at all.
      console.warn('[empreinte] impossible d\'interroger le capteur', caught)
      setIsAvailable(false)
    }
    await refresh()
  }, [refresh])

  useEffect(() => {
    check()

    // Asked again whenever the app comes back to the front.
    //
    // Recording a fingerprint means leaving for the phone's settings and
    // coming back — and the answer was only ever asked for once, at mount. So
    // one did exactly what the switch requires and the switch still was not
    // there, which reads as the feature being broken.
    const watch = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void check()
      }
    })
    return () => {
      watch.remove()
    }
  }, [check])

  const enable = useCallback(async (): Promise<boolean> => {
    if (!(await promptFingerprint('Activer la connexion par empreinte'))) {
      return false
    }

    setBusy(true)
    try {
      const res = await apiFetch('/api/otp-auth/biometric/enroll', {
        method: 'POST',
        body: JSON.stringify({ deviceId: await deviceId(), label: deviceLabel() }),
      })
      if (!res.ok) {
        return false
      }

      const data = await res.json() as { secret?: string }
      if (!data.secret) {
        return false
      }

      await SecureStore.setItemAsync(SECRET_KEY, data.secret, LOCKED)
      await SecureStore.setItemAsync(HAS_SECRET_KEY, '1')
      setIsEnabled(true)
      await refresh()
      return true
    }
    catch {
      return false
    }
    finally {
      setBusy(false)
    }
  }, [refresh])

  /** Revokes a phone; forgets the local secret when it is this one. */
  const revoke = useCallback(async (id: string, isCurrent: boolean): Promise<boolean> => {
    setBusy(true)
    try {
      const res = await apiFetch(`/api/otp-auth/biometric/devices/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        return false
      }
      if (isCurrent) {
        await forgetSecret()
        setIsEnabled(false)
      }
      await refresh()
      return true
    }
    catch {
      return false
    }
    finally {
      setBusy(false)
    }
  }, [refresh])

  return { isAvailable, isEnabled, devices, busy, enable, revoke, refresh }
}
