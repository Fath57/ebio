import * as SecureStore from 'expo-secure-store'

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'
const SESSION_KEY = 'ebio_session_token'

export async function getSessionToken(): Promise<string | null> {
  return SecureStore.getItemAsync(SESSION_KEY)
}

export async function setSessionToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, token)
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY)
}

/**
 * API fetch wrapper with Bearer token auth.
 */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getSessionToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Origin': API_URL,
    ...(options.headers as Record<string, string> ?? {}),
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  return fetch(`${API_URL}${path}`, { ...options, headers })
}
