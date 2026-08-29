import { apiFetch } from '../../utils/api-client'
import { storage } from '../../utils/offline-storage'

// Separate from the hook so auth-client can import it without a module cycle
// (the hook imports useSession from auth-client).
export const PUSH_TOKEN_KEY = 'push_device_token'

/**
 * Deletes this device's token server-side. Called from signOut — without it
 * the next account on the phone inherits the previous user's notifications.
 */
export async function unregisterPushToken(): Promise<void> {
  const token = storage.getString(PUSH_TOKEN_KEY)
  if (!token) {
    return
  }
  try {
    await apiFetch('/api/notifications/unregister-token', {
      method: 'DELETE',
      body: JSON.stringify({ token }),
    })
  }
  catch {
    // Offline logout: the server prunes dead tokens on FCM errors anyway
  }
  storage.set(PUSH_TOKEN_KEY, '')
}
