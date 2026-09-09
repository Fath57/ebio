import { useEffect, useState } from 'react'
import { storage } from './offline-storage'

/** Body the API sends with a 403 when the account itself is sanctioned. */
export interface AccountBlock {
  code: 'ACCOUNT_SUSPENDED' | 'ACCOUNT_BANNED'
  message: string
  reason: string | null
  suspendedUntil: string | null
}

const STORAGE_KEY = 'account_block'
const BLOCK_CODES = new Set(['ACCOUNT_SUSPENDED', 'ACCOUNT_BANNED'])

let current: AccountBlock | null = readStored()
const listeners = new Set<() => void>()

function readStored(): AccountBlock | null {
  try {
    const raw = storage.getString(STORAGE_KEY)
    return raw ? JSON.parse(raw) as AccountBlock : null
  }
  catch {
    return null
  }
}

function emit(): void {
  listeners.forEach(fn => fn())
}

/** Persisted so the explanation survives a restart, not just the session. */
export function setAccountBlock(block: AccountBlock | null): void {
  current = block
  try {
    if (block)
      storage.set(STORAGE_KEY, JSON.stringify(block))
    else
      storage.delete(STORAGE_KEY)
  }
  catch {
    // Storage is a convenience here; the in-memory state drives the UI.
  }
  emit()
}

export function getAccountBlock(): AccountBlock | null {
  return current
}

/** Parses a 403 body; returns the block when it is an account sanction. */
export function parseAccountBlock(body: unknown): AccountBlock | null {
  if (!body || typeof body !== 'object')
    return null
  const data = body as Record<string, unknown>
  if (typeof data.code !== 'string' || !BLOCK_CODES.has(data.code))
    return null
  return {
    code: data.code as AccountBlock['code'],
    message: typeof data.message === 'string' ? data.message : '',
    reason: typeof data.reason === 'string' ? data.reason : null,
    suspendedUntil: typeof data.suspendedUntil === 'string' ? data.suspendedUntil : null,
  }
}

export function useAccountBlock(): AccountBlock | null {
  const [block, setBlock] = useState<AccountBlock | null>(current)
  useEffect(() => {
    const listener = () => setBlock(current)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])
  return block
}
