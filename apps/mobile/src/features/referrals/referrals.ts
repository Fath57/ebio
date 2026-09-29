import { apiFetch } from '../../utils/api-client'

export interface ReferralSummary {
  code: string
  link: string
  pending: number
  rewarded: number
  earned: number
  sponsorReward: number
  refereeReward: number
  minOrderAmount: number
  active: boolean
  sponsoredBy: { name: string, status: 'PENDING' | 'REWARDED' } | null
}

export async function fetchReferralSummary(): Promise<ReferralSummary | null> {
  try {
    const res = await apiFetch('/api/referrals/me')
    if (!res.ok) {
      return null
    }
    return await res.json() as ReferralSummary
  }
  catch {
    return null
  }
}

/** Returns the server's message: it is the one that knows why it refused. */
export async function claimReferralCode(code: string): Promise<{ ok: true, sponsorName: string } | { ok: false, message: string }> {
  try {
    const res = await apiFetch('/api/referrals/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    const data = await res.json() as { sponsorName?: string, message?: string }
    if (!res.ok) {
      return { ok: false, message: data.message ?? 'Ce code n\'a pas pu être utilisé.' }
    }
    return { ok: true, sponsorName: data.sponsorName ?? '' }
  }
  catch {
    return { ok: false, message: 'Pas de réseau. Réessayez dans un instant.' }
  }
}
