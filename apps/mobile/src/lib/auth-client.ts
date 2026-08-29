import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin'
import { useEffect, useState } from 'react'
import { unregisterPushToken } from '../features/notifications/push-token'
import { apiFetch, clearTokens, setSessionToken } from '../utils/api-client'

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? ''

const AUTH_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Origin': API_URL,
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface AuthUser {
  id: string
  name: string
  email: string
  phone: string | null
  image: string | null
}

interface AuthResponse {
  user: AuthUser | null
  error: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractFullToken(res: Response): string | null {
  // React Native exposes set-cookie on Android but not always on iOS
  const setCookie = res.headers.get('set-cookie') ?? ''
  const match = setCookie.match(/better-auth\.session_token=([^;]+)/)
  if (match?.[1]) {
    return decodeURIComponent(match[1])
  }
  return null
}

// ─── Auth API calls ──────────────────────────────────────────────────────────

export async function signInWithEmail(email: string, password: string): Promise<AuthResponse> {
  try {
    const res = await fetch(`${API_URL}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ email, password }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { user: null, error: data.message ?? 'Email ou mot de passe incorrect' }
    }

    const data = await res.json()

    // Try to get the full token from set-cookie (works on Android)
    const fullToken = extractFullToken(res)
    if (fullToken) {
      await setSessionToken(fullToken)
    }
    else if (data.token) {
      // Fallback: store the short token (may not work for all API calls)
      await setSessionToken(data.token)
    }

    return { user: data.user ?? null, error: null }
  }
  catch {
    return { user: null, error: 'Erreur de connexion. Vérifiez votre réseau.' }
  }
}

export async function signUpWithEmail(name: string, email: string, password: string): Promise<AuthResponse> {
  try {
    const res = await fetch(`${API_URL}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ name, email, password }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { user: null, error: data.message ?? 'Impossible de créer le compte' }
    }

    const data = await res.json()
    const fullToken = extractFullToken(res)
    if (fullToken) {
      await setSessionToken(fullToken)
      return { user: data.user ?? null, error: null }
    }

    // Signup may not return a session — auto login
    const loginResult = await signInWithEmail(email, password)
    return loginResult
  }
  catch {
    return { user: null, error: 'Erreur de connexion. Vérifiez votre réseau.' }
  }
}

// ─── Google OAuth (native) ───────────────────────────────────────────────────

let googleConfigured = false

function ensureGoogleConfigured(): void {
  if (googleConfigured)
    return
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    offlineAccess: false,
  })
  googleConfigured = true
}

/**
 * Connexion / inscription via Google (Sign-In natif).
 * Récupère un idToken Google, l'envoie à Better Auth (`/sign-in/social`) qui le
 * vérifie, crée la session et lie/crée le compte. `error: null` sans user = annulé.
 */
export async function signInWithGoogle(): Promise<AuthResponse> {
  try {
    ensureGoogleConfigured()
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
    const response = await GoogleSignin.signIn()

    if (response.type !== 'success') {
      return { user: null, error: null }
    }

    const idToken = response.data.idToken
    if (!idToken) {
      return { user: null, error: 'Impossible de récupérer le jeton Google.' }
    }

    const res = await fetch(`${API_URL}/api/auth/sign-in/social`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ provider: 'google', idToken: { token: idToken } }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { user: null, error: data.message ?? 'Connexion Google échouée.' }
    }

    const data = await res.json()
    const fullToken = extractFullToken(res)
    if (fullToken) {
      await setSessionToken(fullToken)
    }
    else if (data.token) {
      await setSessionToken(data.token)
    }

    return { user: data.user ?? null, error: null }
  }
  catch (err) {
    const code = (err as { code?: string }).code
    const message = (err as { message?: string }).message
    console.warn('[google-signin] error', { code, message })
    if (code === statusCodes.SIGN_IN_CANCELLED) {
      return { user: null, error: null }
    }
    if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      return { user: null, error: 'Google Play Services indisponible.' }
    }
    // Code 10 = DEVELOPER_ERROR : la signature de l'app installée n'est pas
    // déclarée sur le client OAuth Android. Réessayer n'y changera rien, c'est
    // une configuration. La constante n'est pas exposée par `statusCodes`,
    // d'où la comparaison au littéral.
    if (code === '10') {
      return {
        user: null,
        error: 'Cette version de l\'application n\'est pas autorisée pour la connexion Google. Contactez le support.',
      }
    }
    if (code === statusCodes.IN_PROGRESS) {
      return { user: null, error: null }
    }
    return { user: null, error: 'Connexion Google impossible. Réessayez.' }
  }
}

export async function getSession(): Promise<{ user: AuthUser | null, isLoggedIn: boolean }> {
  try {
    // Use our Bearer-compatible session endpoint
    const res = await apiFetch('/api/otp-auth/session')
    if (res.ok) {
      const data = await res.json()
      if (data?.user) {
        return { user: data.user, isLoggedIn: true }
      }
    }
    return { user: null, isLoggedIn: false }
  }
  catch {
    return { user: null, isLoggedIn: false }
  }
}

// ─── OTP auth ───────────────────────────────────────────────────────────────

export async function requestOtp(phone: string): Promise<{ error: string | null }> {
  try {
    const res = await fetch(`${API_URL}/api/otp-auth/request`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ phone }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { error: data.message ?? 'Impossible d\u2019envoyer le code' }
    }
    return { error: null }
  }
  catch {
    return { error: 'Erreur de connexion. Vérifiez votre réseau.' }
  }
}

export async function verifyOtp(phone: string, code: string, password?: string): Promise<{
  user: AuthUser | null
  error: string | null
  needsRegistration?: boolean
  registrationToken?: string
}> {
  try {
    const res = await fetch(`${API_URL}/api/otp-auth/verify`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ phone, code, ...(password ? { password } : {}) }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { user: null, error: data.message ?? 'Code invalide' }
    }
    const data = await res.json()
    if (data.needsRegistration) {
      return { user: null, error: null, needsRegistration: true, registrationToken: data.registrationToken }
    }
    if (data.accessToken) {
      await setSessionToken(data.accessToken)
    }
    return { user: data.user ?? null, error: null }
  }
  catch {
    return { user: null, error: 'Erreur de connexion. Vérifiez votre réseau.' }
  }
}

export async function registerWithToken(phone: string, registrationToken: string, name: string, password: string): Promise<AuthResponse> {
  try {
    const res = await fetch(`${API_URL}/api/otp-auth/register`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ phone, registrationToken, name, password }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { user: null, error: data.message ?? 'Impossible de créer le compte' }
    }
    const data = await res.json()
    if (data.accessToken) {
      await setSessionToken(data.accessToken)
    }
    return { user: data.user ?? null, error: null }
  }
  catch {
    return { user: null, error: 'Erreur de connexion. Vérifiez votre réseau.' }
  }
}

// ─── Email OTP (registration) ───────────────────────────────────────────────

export async function requestEmailOtp(email: string): Promise<{ error: string | null }> {
  try {
    const res = await fetch(`${API_URL}/api/otp-auth/email/request`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ email }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { error: data.message ?? 'Impossible d\u2019envoyer le code' }
    }
    return { error: null }
  }
  catch {
    return { error: 'Erreur de connexion. Vérifiez votre réseau.' }
  }
}

export async function registerWithEmailOtp(email: string, code: string, name: string, password: string): Promise<AuthResponse> {
  try {
    const res = await fetch(`${API_URL}/api/otp-auth/email/register`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ email, code, name, password }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { user: null, error: data.message ?? 'Impossible de créer le compte' }
    }
    const data = await res.json()
    if (data.accessToken) {
      await setSessionToken(data.accessToken)
    }
    return { user: data.user ?? null, error: null }
  }
  catch {
    return { user: null, error: 'Erreur de connexion. Vérifiez votre réseau.' }
  }
}

// ─── Password reset via OTP ─────────────────────────────────────────────────

export async function requestPasswordResetOtp(identifier: string): Promise<{ error: string | null }> {
  try {
    const res = await fetch(`${API_URL}/api/otp-auth/password-reset/request`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ identifier }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { error: data.message ?? 'Erreur lors de l\u2019envoi du code' }
    }
    return { error: null }
  }
  catch {
    return { error: 'Erreur de connexion. Vérifiez votre réseau.' }
  }
}

export async function verifyPasswordResetOtp(identifier: string, code: string): Promise<{ verified: boolean, error: string | null }> {
  try {
    const res = await fetch(`${API_URL}/api/otp-auth/password-reset/verify`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ identifier, code }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { verified: false, error: data.message ?? 'Code invalide' }
    }
    return { verified: true, error: null }
  }
  catch {
    return { verified: false, error: 'Erreur de connexion. Vérifiez votre réseau.' }
  }
}

export async function resetPasswordWithOtp(identifier: string, newPassword: string): Promise<{ error: string | null }> {
  try {
    const res = await fetch(`${API_URL}/api/otp-auth/password-reset/reset`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ identifier, newPassword }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { error: data.message ?? 'Erreur lors de la réinitialisation' }
    }
    return { error: null }
  }
  catch {
    return { error: 'Erreur de connexion. Vérifiez votre réseau.' }
  }
}

/** Logged-in password change; the API checks the current password first. */
export async function changePassword(currentPassword: string, newPassword: string): Promise<{ error: string | null }> {
  try {
    const res = await apiFetch('/api/otp-auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { message?: string, aggregateErrors?: { message?: string }[] }
      return { error: data.aggregateErrors?.[0]?.message ?? data.message ?? 'Impossible de modifier le mot de passe' }
    }
    return { error: null }
  }
  catch {
    return { error: 'Erreur de connexion. Vérifiez votre réseau.' }
  }
}

export async function signOut(): Promise<void> {
  // Before the session dies: otherwise the device keeps receiving the
  // previous account's pushes until someone else logs in.
  await unregisterPushToken()
  try {
    await apiFetch('/api/auth/sign-out', { method: 'POST' })
  }
  catch {
    // Ignore
  }
  await clearTokens()
  notifyAuthChange()
}

// ─── React hook ──────────────────────────────────────────────────────────────

let globalListeners: Array<() => void> = []
let cachedUser: AuthUser | null = null
let hasChecked = false

function notifyListeners() {
  globalListeners.forEach(fn => fn())
}

export function notifyAuthChange() {
  hasChecked = false
  getSession().then((session) => {
    cachedUser = session.user
    hasChecked = true
    notifyListeners()
  })
}

export function useSession(): { data: { user: AuthUser } | null, isPending: boolean } {
  const [state, setState] = useState<{ user: AuthUser | null, isLoading: boolean }>({
    user: cachedUser,
    isLoading: !hasChecked,
  })

  useEffect(() => {
    const listener = () => {
      setState({ user: cachedUser, isLoading: false })
    }
    globalListeners.push(listener)

    if (!hasChecked) {
      getSession().then((session) => {
        cachedUser = session.user
        hasChecked = true
        setState({ user: session.user, isLoading: false })
      })
    }

    return () => {
      globalListeners = globalListeners.filter(fn => fn !== listener)
    }
  }, [])

  return {
    data: state.user ? { user: state.user } : null,
    isPending: state.isLoading,
  }
}
