import type { Route } from './+types/parrainage'
import type { LandingStores } from '@/content/landing-content'
import process from 'node:process'
import { useState } from 'react'
import { SITE_URL } from '@/components/constants'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { StoreBadges } from '@/components/store-badges'
import { fetchLandingContent } from '@/content/landing-content.server'

interface ReferralInvitation {
  sponsorFirstName: string
  refereeReward: number
  minOrderAmount: number
  active: boolean
}

const CODE_PATTERN = /^[A-Z0-9]{4,16}$/

/**
 * The Play Store keeps `referrer` through the install and hands it to the app
 * on its first launch (Android). The app reads `ebio_ref` from it, so the code
 * is applied without being typed. The App Store has no such thing: the page
 * shows the code to copy instead.
 */
function withInstallReferrer(stores: LandingStores, code: string): LandingStores {
  if (!stores.playStoreUrl)
    return stores
  try {
    const url = new URL(stores.playStoreUrl)
    url.searchParams.set('referrer', `ebio_ref=${code}&utm_source=parrainage`)
    return { ...stores, playStoreUrl: url.toString() }
  }
  catch {
    return stores
  }
}

/** Keeps « 1 000 FCFA » on one line. */
const NBSP = String.fromCodePoint(0xA0)

function money(value: number): string {
  return `${value.toLocaleString('fr-FR').replace(/\s/g, NBSP)}${NBSP}FCFA`
}

export async function loader({ params }: Route.LoaderArgs) {
  const code = params.code.trim().toUpperCase()
  const base = process.env.API_URL ?? 'http://localhost:3000'
  const [content, invitationRes] = await Promise.all([
    fetchLandingContent(),
    CODE_PATTERN.test(code)
      ? fetch(`${base}/api/referrals/codes/${code}`, { signal: AbortSignal.timeout(5000) }).catch(() => null)
      : Promise.resolve(null),
  ])
  const invitation = invitationRes?.ok ? await invitationRes.json() as ReferralInvitation : null
  return {
    content: { ...content, stores: invitation ? withInstallReferrer(content.stores, code) : content.stores },
    invitation,
    code,
  }
}

export function meta({ data }: Route.MetaArgs) {
  const invitation = data?.invitation
  const title = invitation
    ? `${invitation.sponsorFirstName} vous invite sur eBio`
    : 'Invitation eBio'
  const description = invitation?.active && invitation.refereeReward > 0
    ? `Rejoignez eBio avec le code ${data?.code} : ${money(invitation.refereeReward)} offerts sur votre portefeuille dès votre première commande livrée.`
    : 'Commandez des produits locaux et bio près de chez vous, avec l’application eBio.'
  const url = `${SITE_URL}/parrainage/${data?.code ?? ''}`
  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:type', content: 'website' },
    { property: 'og:url', content: url },
    { property: 'og:image', content: `${SITE_URL}/og-image.jpg` },
    { name: 'twitter:card', content: 'summary_large_image' },
    // One person's invitation, not a search destination.
    { name: 'robots', content: 'noindex' },
  ]
}

function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
    catch {
      // Clipboard refused: the code stays selectable on the page.
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-full border border-green-600 px-5 py-2 text-sm font-bold text-green-700 transition-colors hover:bg-green-50"
      aria-live="polite"
    >
      {copied ? 'Code copié ✓' : 'Copier le code'}
    </button>
  )
}

export default function Parrainage({ loaderData }: Route.ComponentProps) {
  const { content, invitation, code } = loaderData
  const showsReward = !!invitation?.active && invitation.refereeReward > 0

  return (
    <>
      <SiteHeader />
      <main className="paper-grain">
        <div className="mx-auto max-w-2xl px-5 py-16">
          {invitation
            ? (
                <article className="rounded-2xl border border-line bg-white p-7 shadow-sm sm:p-10">
                  <p className="text-sm font-semibold uppercase tracking-wide text-green-700">Invitation</p>
                  <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink">
                    {invitation.sponsorFirstName}
                    {' '}
                    vous invite sur eBio
                  </h1>
                  <p className="mt-4 leading-relaxed text-ink-soft">
                    Des produits locaux et bio, commandés près de chez vous et livrés à votre porte.
                    {showsReward && (
                      <>
                        {' '}
                        Avec ce code, vous recevez
                        {' '}
                        <strong className="text-ink">{money(invitation.refereeReward)}</strong>
                        {' '}
                        sur votre portefeuille dès votre première commande livrée
                        {invitation.minOrderAmount > 0 ? ` d’au moins ${money(invitation.minOrderAmount)}` : ''}
                        .
                      </>
                    )}
                  </p>

                  <div className="mt-8 flex flex-wrap items-center gap-4 rounded-xl border border-dashed border-green-600 bg-green-50 px-5 py-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Code parrain</p>
                      <p className="mt-1 select-all font-mono text-2xl font-bold tracking-[0.25em] text-ink">{code}</p>
                    </div>
                    <div className="ml-auto">
                      <CopyCodeButton code={code} />
                    </div>
                  </div>

                  <ol className="mt-8 space-y-3 text-ink-soft">
                    <li>
                      <strong className="text-ink">1.</strong>
                      {' '}
                      Installez l’application eBio.
                    </li>
                    <li>
                      <strong className="text-ink">2.</strong>
                      {' '}
                      Créez votre compte : sur Android le code est déjà rempli, sur iPhone saisissez-le dans « Code parrain ».
                    </li>
                    <li>
                      <strong className="text-ink">3.</strong>
                      {' '}
                      Passez votre première commande.
                    </li>
                  </ol>

                  <div className="mt-8">
                    <StoreBadges stores={content.stores} onComingSoon={() => {}} />
                  </div>

                  <a
                    href={`ebio-mobile://parrainage/${code}`}
                    className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-green-700 underline-offset-4 hover:underline"
                  >
                    J’ai déjà l’application
                    <span aria-hidden="true">→</span>
                  </a>
                </article>
              )
            : (
                <div className="rounded-2xl border border-line bg-white p-10 text-center shadow-sm">
                  <h1 className="text-2xl font-extrabold tracking-tight text-ink">
                    Code de parrainage introuvable
                  </h1>
                  <p className="mt-3 text-ink-soft">
                    Vérifiez le lien reçu. Vous pouvez tout de même découvrir eBio.
                  </p>
                  <div className="mt-8 flex justify-center">
                    <StoreBadges stores={content.stores} onComingSoon={() => {}} />
                  </div>
                </div>
              )}
        </div>
      </main>
      <SiteFooter footer={content.footer} onDownloadClick={() => {}} />
    </>
  )
}
