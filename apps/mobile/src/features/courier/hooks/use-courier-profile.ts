import type { CourierProfile } from '../types'
import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../../utils/api-client'

export type CourierGateState = 'loading' | 'none' | 'pending' | 'rejected' | 'suspended' | 'validated' | 'error'

/**
 * Resolves what the courier app should show for the signed-in account:
 * onboarding (no application), waiting room, or the full app.
 */
export function useCourierProfile() {
  const [state, setState] = useState<CourierGateState>('loading')
  const [profile, setProfile] = useState<CourierProfile | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch('/api/couriers/me')
      if (res.status === 404) {
        setProfile(null)
        setState('none')
        return
      }
      if (!res.ok) {
        setState('error')
        return
      }
      const data = await res.json() as CourierProfile
      setProfile(data)
      if (data.validationStatus === 'VALIDATED') {
        setState('validated')
      }
      else if (data.validationStatus === 'REJECTED') {
        setState('rejected')
      }
      else if (data.validationStatus === 'SUSPENDED') {
        setState('suspended')
      }
      else {
        setState('pending')
      }
    }
    catch {
      setState('error')
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { state, profile, refresh }
}
