import { useEffect, useRef } from 'react'
import { Linking } from 'react-native'
import { useSession } from '../../../lib/auth-client'
import { appAlert } from '../../common/components/app-alert'
import {
  captureInstallReferrer,
  clearPendingReferralCode,
  getPendingReferralCode,
  setPendingReferralCode,
} from '../pending-referral'
import { claimReferralCode } from '../referrals'

/** `https://e-bio.org/parrainage/ABC234` or `ebio-mobile://parrainage/ABC234`. */
const REFERRAL_LINK = /parrainage\/([A-Z0-9]{4,16})/i

async function rememberLinkCode(url: string | null): Promise<void> {
  const code = url ? REFERRAL_LINK.exec(url)?.[1] : null
  if (code)
    await setPendingReferralCode(code)
}

/**
 * Mounted once at the root of the client app. It gathers a sponsor's code from
 * wherever it shows up, the install, an opened link, the sign-up form, and
 * claims it the moment an account is signed in. Only a network failure keeps
 * the code for later: a refusal is final and said once.
 */
export function usePendingReferralClaim(): void {
  const { data: session } = useSession()
  const userId = session?.user?.id ?? null
  const claimingRef = useRef(false)

  const userIdRef = useRef(userId)
  userIdRef.current = userId

  async function claim(): Promise<void> {
    if (!userIdRef.current || claimingRef.current)
      return
    claimingRef.current = true
    try {
      // The install referrer is read asynchronously: let it land first.
      await captureInstallReferrer()
      const code = await getPendingReferralCode()
      if (!code)
        return
      const result = await claimReferralCode(code)
      if (result.ok) {
        await clearPendingReferralCode()
        appAlert('Parrain enregistré', `${result.sponsorName} vous a parrainé. Votre récompense arrive avec votre première commande livrée.`)
        return
      }
      if (result.retry)
        return
      await clearPendingReferralCode()
      appAlert('Code de parrainage non appliqué', `${result.message}\nVous pouvez saisir un autre code dans Profil → Parrainage.`)
    }
    finally {
      claimingRef.current = false
    }
  }

  useEffect(() => {
    void captureInstallReferrer()
    // Already signed in when the link opens the app: claim right away,
    // `claim` does nothing while nobody is signed in.
    void Linking.getInitialURL().then(rememberLinkCode).then(claim)
    const subscription = Linking.addEventListener('url', ({ url }) => {
      void rememberLinkCode(url).then(claim)
    })
    return () => subscription.remove()
    // `claim` reads the signed-in user through a ref.
  }, [])

  useEffect(() => {
    if (userId)
      void claim()
  }, [userId])
}
