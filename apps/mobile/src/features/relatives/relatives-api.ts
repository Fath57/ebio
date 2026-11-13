import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../utils/api-client'

/**
 * A saved recipient of the payer's address book (contracts/diaspora.md §1).
 * Address and position may be null: a relative added for the family wallet
 * does not need one (contracts/family-wallet.md §2). A gift order still does.
 */
export interface Relative {
  id: string
  nickname: string
  name: string
  phone: string
  address: string | null
  latitude: number | null
  longitude: number | null
  createdAt: string
}

export interface RelativeInput {
  nickname: string
  name: string
  phone: string
  address: string | null
  latitude: number | null
  longitude: number | null
}

/** The API caps the address book (`422 RELATIVES_LIMIT_REACHED`). */
export const MAX_RELATIVES = 20

const ERROR_MESSAGES: Record<string, string> = {
  RELATIVE_PHONE_EXISTS: 'Ce numéro est déjà enregistré dans vos proches.',
  RELATIVES_LIMIT_REACHED: `Vous avez atteint la limite de ${MAX_RELATIVES} proches. Supprimez-en un pour en ajouter un autre.`,
}

/** A coordinate, or null when absent: `Number(null)` would read as 0. */
function readCoordinate(value: unknown): number | null {
  if (value === null || value === undefined || value === '')
    return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** The door point, only when both coordinates are there. */
export function relativePosition(relative: Relative): { latitude: number, longitude: number } | null {
  return relative.latitude !== null && relative.longitude !== null
    ? { latitude: relative.latitude, longitude: relative.longitude }
    : null
}

function toRelative(raw: Record<string, unknown>): Relative {
  return {
    id: String(raw.id),
    nickname: typeof raw.nickname === 'string' ? raw.nickname : '',
    name: typeof raw.name === 'string' ? raw.name : '',
    phone: typeof raw.phone === 'string' ? raw.phone : '',
    address: typeof raw.address === 'string' && raw.address.trim().length > 0 ? raw.address : null,
    latitude: readCoordinate(raw.latitude),
    longitude: readCoordinate(raw.longitude),
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
  }
}

/** The French message of a refused write: a named code first, then the server's message. */
async function errorOf(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => null) as Record<string, unknown> | null
  const code = typeof data?.code === 'string' ? data.code : null
  if (code && ERROR_MESSAGES[code])
    return ERROR_MESSAGES[code]
  return typeof data?.message === 'string' ? data.message : fallback
}

export async function fetchRelatives(): Promise<Relative[]> {
  const res = await apiFetch('/api/relatives')
  if (!res.ok)
    throw new Error('Impossible de charger vos proches.')
  const json = await res.json() as unknown
  const raw = Array.isArray(json)
    ? json
    : ((json as Record<string, unknown>).items ?? []) as unknown[]
  return (raw as Array<Record<string, unknown>>).map(toRelative)
}

export type RelativeWriteResult = { relative: Relative, error: null } | { relative: null, error: string }

export async function saveRelative(input: Partial<RelativeInput>, id?: string): Promise<RelativeWriteResult> {
  try {
    const res = await apiFetch(id ? `/api/relatives/${id}` : '/api/relatives', {
      method: id ? 'PATCH' : 'POST',
      body: JSON.stringify(input),
    })
    if (!res.ok)
      return { relative: null, error: await errorOf(res, 'Impossible d’enregistrer ce proche.') }
    return { relative: toRelative(await res.json() as Record<string, unknown>), error: null }
  }
  catch {
    return { relative: null, error: 'Erreur de connexion. Vérifiez votre réseau.' }
  }
}

export async function deleteRelative(id: string): Promise<string | null> {
  try {
    const res = await apiFetch(`/api/relatives/${id}`, { method: 'DELETE' })
    return res.ok ? null : await errorOf(res, 'Impossible de supprimer ce proche.')
  }
  catch {
    return 'Erreur de connexion. Vérifiez votre réseau.'
  }
}

/**
 * The payer's saved relatives, read on mount unless `autoLoad` is false (a
 * screen that reloads on focus already does it); `reload` after a change.
 */
export function useRelatives(autoLoad = true) {
  const [relatives, setRelatives] = useState<Relative[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async (): Promise<void> => {
    try {
      setRelatives(await fetchRelatives())
      setError(null)
    }
    catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible de charger vos proches.')
    }
    finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (autoLoad)
      reload()
  }, [autoLoad, reload])

  return { relatives, isLoading, error, reload, setRelatives }
}
