import type { Route } from './+types/suivi'
import process from 'node:process'
import { useEffect } from 'react'
import { useRevalidator } from 'react-router'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { fetchLandingContent } from '@/content/landing-content.server'

type GiftStatus = 'PAID' | 'PREPARING' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED' | 'CANCELLED'

interface GeoPoint {
  latitude: number
  longitude: number
}

interface GiftTracking {
  payerFirstName: string
  recipientFirstName: string
  status: GiftStatus
  window: { start: string, end: string } | null
  shops: { name: string }[]
  lines: { name: string, quantity: number, imageUrl: string | null }[]
  courierPosition: (GeoPoint & { at: string }) | null
  destination: GeoPoint | null
  expired: false
}

interface ExpiredTracking {
  status: GiftStatus
  expired: true
}

type TrackingState
  = | { kind: 'found', tracking: GiftTracking }
    | { kind: 'expired' }
    | { kind: 'not-found' }
    | { kind: 'unavailable' }

/** Deliveries happen in Benin: every time on the page is read there. */
const TIME_ZONE = 'Africa/Porto-Novo'
const REFRESH_MS = 15_000
const LIVE_STATUSES: GiftStatus[] = ['PAID', 'PREPARING', 'IN_TRANSIT']

const STEPS: { status: GiftStatus, label: string }[] = [
  { status: 'PAID', label: 'Payé' },
  { status: 'PREPARING', label: 'En préparation' },
  { status: 'IN_TRANSIT', label: 'En route' },
  { status: 'DELIVERED', label: 'Livré' },
]

export async function loader({ params }: Route.LoaderArgs) {
  const base = process.env.API_URL ?? 'http://localhost:3000'
  const [content, res] = await Promise.all([
    fetchLandingContent(),
    fetch(`${base}/api/gift-tracking/${encodeURIComponent(params.token)}`, { signal: AbortSignal.timeout(5000) })
      .catch(() => null),
  ])

  let state: TrackingState
  if (!res) {
    state = { kind: 'unavailable' }
  }
  else if (res.status === 404) {
    state = { kind: 'not-found' }
  }
  else if (!res.ok) {
    state = { kind: 'unavailable' }
  }
  else {
    const body = await res.json() as GiftTracking | ExpiredTracking
    state = body.expired ? { kind: 'expired' } : { kind: 'found', tracking: body }
  }

  // Server time travels with the data, so server and client render the same
  // « aujourd'hui » and « il y a X min » (no hydration mismatch).
  return { content, state, now: Date.now() }
}

export function meta() {
  return [
    { title: 'Suivi de votre panier eBio' },
    { name: 'description', content: 'Suivez la livraison du panier eBio qui vous a été envoyé.' },
    // A private link for one recipient, never a search destination.
    { name: 'robots', content: 'noindex' },
  ]
}

function dayKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

/** « 10 h » or « 10 h 30 », Benin time. */
function hourLabel(date: Date): string {
  const parts = new Intl.DateTimeFormat('fr-FR', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  const hour = Number(parts.find(part => part.type === 'hour')?.value ?? '0')
  const minute = parts.find(part => part.type === 'minute')?.value ?? '00'
  return minute === '00' ? `${hour} h` : `${hour} h ${minute}`
}

/** « aujourd'hui entre 10 h et 12 h », « demain entre … », « mar. 20 nov. entre … ». */
function windowLabel(window: { start: string, end: string }, now: number): string {
  const start = new Date(window.start)
  const end = new Date(window.end)
  const day = dayKey(start)
  let dayLabel: string
  if (day === dayKey(new Date(now)))
    dayLabel = 'aujourd’hui'
  else if (day === dayKey(new Date(now + 86_400_000)))
    dayLabel = 'demain'
  else
    dayLabel = new Intl.DateTimeFormat('fr-FR', { timeZone: TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short' }).format(start)
  return `${dayLabel} entre ${hourLabel(start)} et ${hourLabel(end)}`
}

function agoLabel(at: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - new Date(at).getTime()) / 60_000))
  if (minutes < 1)
    return 'à l’instant'
  if (minutes < 60)
    return `il y a ${minutes} min`
  return `à ${hourLabel(new Date(at))}`
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 10.5l3 3 7-7" />
    </svg>
  )
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6 shrink-0" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5" />
      <path d="M12 16.5h.01" />
    </svg>
  )
}

function StepTracker({ status }: { status: GiftStatus }) {
  const current = STEPS.findIndex(step => step.status === status)
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Avancement de la livraison">
      {STEPS.map((step, index) => {
        const done = index < current || status === 'DELIVERED'
        const active = index === current && status !== 'DELIVERED'
        let dotClass = 'border-line bg-white text-ink-faint'
        if (done)
          dotClass = 'border-green-600 bg-green-600 text-white'
        else if (active)
          dotClass = 'border-green-600 bg-green-50 text-green-800'
        return (
          <li key={step.status} className="flex flex-col items-center text-center" aria-current={active || (done && index === current) ? 'step' : undefined}>
            <span className={`flex size-8 items-center justify-center rounded-full border-2 text-sm font-bold ${dotClass}`}>
              {done ? <CheckIcon /> : index + 1}
            </span>
            <span className={`mt-2 text-xs font-semibold sm:text-sm ${done || active ? 'text-ink' : 'text-ink-soft'}`}>
              {step.label}
            </span>
            <span className="sr-only">
              {done ? ' (terminé)' : active ? ' (en cours)' : ' (à venir)'}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function StoppedNotice({ status }: { status: 'FAILED' | 'CANCELLED' }) {
  return (
    <div role="status" className="flex items-start gap-3 rounded-xl border border-coral-600 bg-white p-4 text-coral-600">
      <AlertIcon />
      <div>
        <p className="font-bold">
          {status === 'FAILED' ? 'La livraison n’a pas pu avoir lieu' : 'Ce panier a été annulé'}
        </p>
        <p className="mt-1 text-sm text-ink-soft">
          {status === 'FAILED'
            ? 'Le livreur n’a pas pu vous remettre le panier. L’équipe eBio reprend contact avec la personne qui vous l’a envoyé.'
            : 'La commande a été annulée avant la livraison. La personne qui vous l’a envoyé en est informée.'}
        </p>
      </div>
    </div>
  )
}

/**
 * OpenStreetMap's own embed: no script, no API key, no dependency. It shows
 * one marker (the courier), framed so the delivery point stays in view.
 */
function CourierMap({ courier, destination, now }: { courier: GeoPoint & { at: string }, destination: GeoPoint | null, now: number }) {
  const points = destination ? [courier, destination] : [courier]
  const pad = 0.006
  const minLon = Math.min(...points.map(p => p.longitude)) - pad
  const maxLon = Math.max(...points.map(p => p.longitude)) + pad
  const minLat = Math.min(...points.map(p => p.latitude)) - pad
  const maxLat = Math.max(...points.map(p => p.latitude)) + pad
  const bbox = [minLon, minLat, maxLon, maxLat].map(v => v.toFixed(5)).join(',')
  const marker = `${courier.latitude.toFixed(5)},${courier.longitude.toFixed(5)}`
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${marker}`

  return (
    <section className="mt-8" aria-labelledby="courier-title">
      <h2 id="courier-title" className="text-lg font-bold text-ink">Votre livreur est en route</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Position mise à jour
        {' '}
        {agoLabel(courier.at, now)}
        .
      </p>
      <div className="mt-4 aspect-[4/3] overflow-hidden rounded-xl border border-line bg-white sm:aspect-[16/9]">
        <iframe
          title="Position du livreur sur la carte"
          src={src}
          className="size-full"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      </div>
    </section>
  )
}

function TrackingCard({ tracking, now }: { tracking: GiftTracking, now: number }) {
  const stopped = tracking.status === 'FAILED' || tracking.status === 'CANCELLED'
  return (
    <article className="rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-10">
      <p className="eyebrow text-green-600">Panier offert</p>
      <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
        {tracking.recipientFirstName}
        ,
        {' '}
        {tracking.payerFirstName}
        {' '}
        vous envoie un panier eBio
      </h1>

      {tracking.window && !stopped && tracking.status !== 'DELIVERED' && (
        <p className="mt-4 leading-relaxed text-ink-soft">
          Livraison prévue
          {' '}
          <strong className="text-ink">{windowLabel(tracking.window, now)}</strong>
          .
        </p>
      )}
      {tracking.status === 'DELIVERED' && (
        <p className="mt-4 leading-relaxed text-ink-soft">Votre panier vous a été remis. Bonne dégustation !</p>
      )}

      <div className="mt-8">
        {stopped
          ? <StoppedNotice status={tracking.status as 'FAILED' | 'CANCELLED'} />
          : <StepTracker status={tracking.status} />}
      </div>

      {tracking.status === 'IN_TRANSIT' && tracking.courierPosition && (
        <CourierMap courier={tracking.courierPosition} destination={tracking.destination} now={now} />
      )}

      <section className="mt-8" aria-labelledby="content-title">
        <h2 id="content-title" className="text-lg font-bold text-ink">Dans votre panier</h2>
        <ul className="mt-4 divide-y divide-line">
          {tracking.lines.map(line => (
            <li key={`${line.name}-${line.quantity}`} className="flex items-center gap-4 py-3">
              <div className="size-16 shrink-0 overflow-hidden rounded-lg bg-paper">
                {line.imageUrl && (
                  <img src={line.imageUrl} alt={line.name} className="size-full object-cover" loading="lazy" width={64} height={64} />
                )}
              </div>
              <p className="min-w-0 flex-1 break-words font-semibold text-ink">{line.name}</p>
              <p className="shrink-0 text-sm font-semibold text-ink-soft">
                <span className="sr-only">Quantité : </span>
                ×
                {line.quantity}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {tracking.shops.length > 0 && (
        <p className="mt-6 text-sm text-ink-soft">
          Préparé par
          {' '}
          <span className="font-semibold text-ink">{tracking.shops.map(shop => shop.name).join(', ')}</span>
          .
        </p>
      )}
    </article>
  )
}

function MessageCard({ title, text }: { title: string, text?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-8 text-center shadow-sm sm:p-10">
      <h1 className="text-2xl font-extrabold tracking-tight text-ink">{title}</h1>
      {text && <p className="mt-3 text-ink-soft">{text}</p>}
    </div>
  )
}

export default function Suivi({ loaderData }: Route.ComponentProps) {
  const { content, state, now } = loaderData
  const revalidator = useRevalidator()
  const live = state.kind === 'found' && LIVE_STATUSES.includes(state.tracking.status)

  useEffect(() => {
    if (!live)
      return
    const timer = setInterval(() => {
      if (revalidator.state === 'idle')
        void revalidator.revalidate()
    }, REFRESH_MS)
    return () => {
      clearInterval(timer)
    }
  }, [live, revalidator])

  return (
    <>
      <SiteHeader />
      <main className="paper-grain">
        <div className="mx-auto max-w-2xl px-4 py-10 sm:px-5 sm:py-16">
          {state.kind === 'found' && <TrackingCard tracking={state.tracking} now={now} />}
          {state.kind === 'expired' && <MessageCard title="Ce panier a été livré." />}
          {state.kind === 'not-found' && (
            <MessageCard title="Lien de suivi introuvable" text="Vérifiez le lien reçu par SMS. S’il est complet, il n’est peut-être plus valable." />
          )}
          {state.kind === 'unavailable' && (
            <MessageCard title="Suivi momentanément indisponible" text="Nous n’arrivons pas à charger votre panier. Réessayez dans quelques instants." />
          )}
        </div>
      </main>
      <SiteFooter footer={content.footer} onDownloadClick={() => {}} />
    </>
  )
}
