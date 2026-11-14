import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useState } from 'react'
import { apiFetch } from '../../../utils/api-client'

/**
 * Whether eBio has opened the « Terroir vers l'étranger » module. Every shop
 * entry (export profile, packs) stays hidden until the switch is on. Read on
 * focus so a change in the back-office shows up without restarting.
 */
export function useTerroirExportEnabled(): boolean {
  const [enabled, setEnabled] = useState(false)

  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      async function load(): Promise<void> {
        try {
          const res = await apiFetch('/api/settings/public')
          if (res.ok && !cancelled) {
            const data = await res.json() as { terroirExportEnabled?: boolean }
            setEnabled(data.terroirExportEnabled === true)
          }
        }
        catch {
          // keep whatever we knew: a network hiccup must not make entries blink
        }
      }
      load()
      return () => {
        cancelled = true
      }
    }, []),
  )

  return enabled
}
