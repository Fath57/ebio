import type { LandingContent } from './landing-content'
import process from 'node:process'
import { DEFAULT_CONTENT, mergeContent } from './landing-content'

/**
 * Server-side fetch of the editable content, called from the route loaders.
 * The API being down must never take the landing down with it: any failure
 * falls back to the built-in defaults within three seconds.
 */
export async function fetchLandingContent(): Promise<LandingContent> {
  const base = process.env.API_URL ?? 'http://localhost:3000'
  try {
    const response = await fetch(`${base}/api/landing/content`, {
      signal: AbortSignal.timeout(3000),
    })
    if (!response.ok) {
      return DEFAULT_CONTENT
    }
    return mergeContent(await response.json())
  }
  catch {
    return DEFAULT_CONTENT
  }
}

interface ContactPayload {
  name: string
  email: string
  phone: string
  reason: string
  message: string
  company: string
  startedAt: string
}

/** Forwards a contact form submission to the API, which does the mailing. */
export async function sendContactMessage(payload: ContactPayload): Promise<{ ok: boolean, error?: string }> {
  const base = process.env.API_URL ?? 'http://localhost:3000'
  try {
    const response = await fetch(`${base}/api/landing/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    })
    if (response.status === 429) {
      return { ok: false, error: 'Trop de messages envoyés depuis votre connexion. Réessayez dans quelques minutes.' }
    }
    if (!response.ok) {
      return { ok: false, error: 'L’envoi a échoué. Vérifiez vos informations et réessayez.' }
    }
    return { ok: true }
  }
  catch {
    return { ok: false, error: 'Le service est momentanément indisponible. Réessayez dans un instant.' }
  }
}
