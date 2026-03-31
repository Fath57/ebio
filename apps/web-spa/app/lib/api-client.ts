/**
 * Legacy API client — prefer using the generated OpenAPI SDK from @boilerstone/openapi-generator
 *
 * The generated client is configured in app/root.tsx via:
 *   import { client } from '@boilerstone/openapi-generator'
 *   client.setConfig({ baseUrl: import.meta.env.VITE_API_URL, credentials: 'include' })
 *
 * This file provides a temporary apiFetch() wrapper until all features
 * are migrated to use the generated SDK.
 */

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> ?? {}),
    },
  })
}
