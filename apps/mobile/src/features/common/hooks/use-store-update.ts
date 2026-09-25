import Constants from 'expo-constants'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { apiFetch } from '../../../utils/api-client'
import { APP_VARIANT } from '../../../utils/app-variant'

export type StoreUpdateLevel = 'none' | 'suggested' | 'required'

interface VersionRule {
  minimum: string
  latest: string
  storeUrl: string
}

/** Checked on returning to the app, not more often than this. */
const CHECK_INTERVAL_MS = 30 * 60 * 1000

/**
 * Compares two versions as numbers, not as text.
 *
 * "1.10.0" comes after "1.9.0", which a string comparison gets backwards —
 * and would have told everyone on 1.9 that they were up to date for the whole
 * of the 1.10 series.
 */
function isOlder(current: string, other: string): boolean {
  const a = current.split('.').map(Number)
  const b = other.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const left = a[i] ?? 0
    const right = b[i] ?? 0
    if (left !== right) {
      return left < right
    }
  }
  return false
}

/**
 * Whether a store update is waiting, and how much it matters.
 *
 * Over-the-air updates carry JavaScript alone. A release that needs a native
 * module, or an API that stops accepting what an old build sends, can only
 * arrive through the store — and the app cannot notice that by itself. The
 * server says what it expects; here we compare.
 *
 * Failing silently is the right answer: an app that cannot reach the server
 * has a more pressing problem than being one version behind.
 */
export function useStoreUpdate(): { level: StoreUpdateLevel, storeUrl: string | null, latest: string | null } {
  const [rule, setRule] = useState<VersionRule | null>(null)
  const lastCheck = useRef(0)

  const check = useCallback(async () => {
    const now = Date.now()
    if (now - lastCheck.current < CHECK_INTERVAL_MS) {
      return
    }
    lastCheck.current = now
    try {
      const res = await apiFetch(`/api/app-version?app=${APP_VARIANT}`)
      if (res.ok) {
        setRule(await res.json() as VersionRule)
      }
    }
    catch {
      // Offline: nothing to say, and nothing that can be done about it here.
    }
  }, [])

  useEffect(() => {
    void check()
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void check()
      }
    })
    return () => {
      subscription.remove()
    }
  }, [check])

  const current = Constants.expoConfig?.version ?? null
  if (!rule || !current) {
    return { level: 'none', storeUrl: null, latest: null }
  }

  const level: StoreUpdateLevel = isOlder(current, rule.minimum)
    ? 'required'
    : isOlder(current, rule.latest) ? 'suggested' : 'none'

  return { level, storeUrl: rule.storeUrl, latest: rule.latest }
}
