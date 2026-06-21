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
  cachedChatToken = null
  await SecureStore.deleteItemAsync(SESSION_KEY)
}

// ─── Chat token (JWT) ─────────────────────────────────────────────────────────
// Le module chat (REST + socket) exige un JWT distinct de la session Better Auth.
let cachedChatToken: string | null = null

export async function getChatToken(forceRefresh = false): Promise<string | null> {
  if (cachedChatToken && !forceRefresh)
    return cachedChatToken
  try {
    const res = await apiFetch('/api/otp-auth/chat-token')
    if (!res.ok)
      return null
    const data = await res.json() as { token?: string }
    cachedChatToken = data.token ?? null
    return cachedChatToken
  }
  catch {
    return null
  }
}

/** Fetch authentifié avec le JWT chat (et refresh auto sur 401). */
export async function chatFetch(path: string, options: RequestInit = {}): Promise<Response> {
  function doFetch(token: string | null): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Origin': API_URL,
      'Cache-Control': 'no-cache',
      ...(options.headers as Record<string, string> ?? {}),
    }
    if (token)
      headers.Authorization = `Bearer ${token}`
    return fetch(`${API_URL}${path}`, { cache: 'no-store', ...options, headers })
  }

  let res = await doFetch(await getChatToken())
  if (res.status === 401) {
    res = await doFetch(await getChatToken(true))
  }
  return res
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
