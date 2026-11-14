import type { Route } from './+types/colis'
import process from 'node:process'
import { useEffect } from 'react'
import { useRevalidator } from 'react-router'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { fetchLandingContent } from '@/content/landing-content.server'

type ShipmentStatus
  = | 'PENDING_PAYMENT'
    | 'PAID'
    | 'COLLECTING'
    | 'PACKED'
    | 'DROPPED_AT_AGENCY'
    | 'DEPARTED'
    | 'ARRIVED'
    | 'READY_FOR_PICKUP'
    | 'OUT_FOR_DELIVERY'
    | 'HANDED_OVER'
    | 'LOST'
    | 'DAMAGED'
    | 'CANCELLED'

type StoppedStatus = 'LOST' | 'DAMAGED' | 'CANCELLED'

interface ShipmentEvent {
  step: ShipmentStatus | null
  message: string | null
  pickupPoint: string | null
  at: string
}

/** Mirrors `terroirTrackingSchema` (API terroir contract): never any price. */
interface TerroirTracking {
  status: ShipmentStatus
  country: 'FR' | 'BE'
  recipientName: string | null
  senderName: string
  giftMessage: string | null
  departure: { agency: string, departsOn: string, arrival: { from: string, to: string } }
  reception: 'PICKUP' | 'HOME'
  pickupPoint: { city: string, address: string, openingHours: string | null } | null
  lines: { name: string, quantity: number, imageUrl: string | null }[]
  events: ShipmentEvent[]
  updatedAt: string
}

type TrackingState
  = | { kind: 'found', tracking: TerroirTracking }
    | { kind: 'not-found' }
    | { kind: 'unavailable' }

/** The recipient lives in France or Belgium: times are read there. */
const TIME_ZONE = 'Europe/Paris'
/** Parcels move in days, not minutes. */
const REFRESH_MS = 60_000
const STOPPED_STATUSES: ShipmentStatus[] = ['LOST', 'DAMAGED', 'CANCELLED']
const DONE_STATUSES: ShipmentStatus[] = ['HANDED_OVER', ...STOPPED_STATUSES]

const STEP_LABELS: Record<ShipmentStatus, string> = {
  PENDING_PAYMENT: 'En attente de paiement',
  PAID: 'Payé',
  COLLECTING: 'Collecte',
  PACKED: 'Emballé',
  DROPPED_AT_AGENCY: 'Déposé à l’agence',
  DEPARTED: 'Parti du Bénin',
  ARRIVED: 'Arrivé',
  READY_FOR_PICKUP: 'Disponible au retrait',
  OUT_FOR_DELIVERY: 'En livraison',
  HANDED_OVER: 'Remis',
  LOST: 'Colis perdu',
  DAMAGED: 'Colis endommagé',
  CANCELLED: 'Envoi annulé',
}

const COUNTRY_LABELS: Record<TerroirTracking['country'], string> = {
  FR: 'France',
  BE: 'Belgique',
}

export async function loader({ params }: Route.LoaderArgs) {
  const base = process.env.API_URL ?? 'http://localhost:3000'
  const [content, res] = await Promise.all([
    fetchLandingContent(),
    fetch(`${base}/api/terroir/tracking/${encodeURIComponent(params.token)}`, { signal: AbortSignal.timeout(5000) })
      .catch(() => null),
  ])

  let state: TrackingState
  if (!res)
    state = { kind: 'unavailable' }
  else if (res.status === 404)
    state = { kind: 'not-found' }
  else if (!res.ok)
    state = { kind: 'unavailable' }
  else
    state = { kind: 'found', tracking: await res.json() as TerroirTracking }

  return { content, state }
}

export function meta() {
  return [
    { title: 'Suivi de votre colis eBio' },
    { name: 'description', content: 'Suivez le colis du Bénin qui vous a été envoyé avec eBio.' },
    // A private link for one recipient, never a search destination.
    { name: 'robots', content: 'noindex' },
  ]
}

/** The ordered timeline; the last steps depend on how the parcel is received. */
function stepsFor(reception: TerroirTracking['reception']): ShipmentStatus[] {
  return [
    'PAID',
    'COLLECTING',
    'PACKED',
    'DROPPED_AT_AGENCY',
    'DEPARTED',
    'ARRIVED',
    reception === 'PICKUP' ? 'READY_FOR_PICKUP' : 'OUT_FOR_DELIVERY',
    'HANDED_OVER',
  ]
}

/**
 * Calendar days (« AAAA-MM-JJ ») carry no time: format them as-is, in UTC, so
 * no time zone shifts them by a day. Full instants are read in Paris time.
 */
function dayLabel(value: string): string {
  const isDay = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const date = new Date(isDay ? `${value}T12:00:00Z` : value)
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: isDay ? 'UTC' : TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date)
}

function arrivalLabel(arrival: { from: string, to: string }): string {
  const from = dayLabel(arrival.from)
  const to = dayLabel(arrival.to)
  return from === to ? `le ${from}` : `entre le ${from} et le ${to}`
}

function eventDateLabel(at: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: TIME_ZONE,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(at))
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

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6 shrink-0" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  )
}

/** Vertical on phones (8 steps never fit a row), still an ordered list. */
function StepTracker({ status, reception }: { status: ShipmentStatus, reception: TerroirTracking['reception'] }) {
  const steps = stepsFor(reception)
  // Before payment nothing is reached yet; HANDED_OVER closes every step.
  const current = steps.indexOf(status)
  const delivered = status === 'HANDED_OVER'
  return (
    <ol className="space-y-3" aria-label="Avancement du colis">
      {steps.map((step, index) => {
        const done = delivered || (current >= 0 && index < current)
        const active = !delivered && index === current
        let dotClass = 'border-line bg-white text-ink-faint'
        if (done)
          dotClass = 'border-green-600 bg-green-600 text-white'
        else if (active)
          dotClass = 'border-green-600 bg-green-50 text-green-800'
        let srText = ' (à venir)'
        if (done)
          srText = ' (terminé)'
        else if (active)
          srText = ' (en cours)'
        return (
          <li key={step} className="flex items-center gap-3" aria-current={index === current ? 'step' : undefined}>
            <span className={`flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold ${dotClass}`}>
              {done ? <CheckIcon /> : index + 1}
            </span>
            <span className={`text-sm font-semibold sm:text-base ${done || active ? 'text-ink' : 'text-ink-soft'}`}>
              {STEP_LABELS[step]}
            </span>
            <span className="sr-only">{srText}</span>
          </li>
        )
      })}
    </ol>
  )
}

const STOPPED_COPY: Record<StoppedStatus, { title: string, text: string }> = {
  LOST: {
    title: 'Votre colis a été perdu',
    text: 'Le transporteur n’a pas retrouvé le colis. L’équipe eBio s’en occupe avec la personne qui vous l’a envoyé.',
  },
  DAMAGED: {
    title: 'Votre colis est arrivé endommagé',
    text: 'L’équipe eBio s’en occupe avec la personne qui vous l’a envoyé.',
  },
  CANCELLED: {
    title: 'Cet envoi a été annulé',
    text: 'Le colis ne partira pas. La personne qui vous l’a envoyé en est informée.',
  },
}

function StoppedNotice({ status }: { status: StoppedStatus }) {
  const copy = STOPPED_COPY[status]
  return (
    <div role="status" className="flex items-start gap-3 rounded-xl border border-coral-600 bg-white p-4 text-coral-600">
      <AlertIcon />
      <div>
        <p className="font-bold">{copy.title}</p>
        <p className="mt-1 text-sm text-ink-soft">{copy.text}</p>
      </div>
    </div>
  )
}

function PickupCard({ pickupPoint }: { pickupPoint: NonNullable<TerroirTracking['pickupPoint']> }) {
  return (
    <section className="mt-8 rounded-xl border-2 border-green-600 bg-green-50 p-4 sm:p-5" aria-labelledby="pickup-title">
      <div className="flex items-start gap-3 text-green-800">
        <PinIcon />
        <div className="min-w-0">
          <h2 id="pickup-title" className="text-lg font-bold text-ink">Où récupérer votre colis</h2>
          <p className="mt-2 font-semibold text-ink">{pickupPoint.city}</p>
          <p className="break-words text-ink">{pickupPoint.address}</p>
          {pickupPoint.openingHours && (
            <p className="mt-2 whitespace-pre-line text-sm text-ink-soft">
              <span className="font-semibold text-ink">Horaires : </span>
              {pickupPoint.openingHours}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

function History({ events }: { events: ShipmentEvent[] }) {
  const sorted = [...events].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  return (
    <section className="mt-8" aria-labelledby="history-title">
      <h2 id="history-title" className="text-lg font-bold text-ink">Historique</h2>
      <ul className="mt-4 divide-y divide-line">
        {sorted.map((event, index) => (
          <li key={`${event.at}-${index}`} className="py-3">
            <p className="text-sm text-ink-soft">
              <time dateTime={event.at}>{eventDateLabel(event.at)}</time>
            </p>
            {event.step && <p className="font-semibold text-ink">{STEP_LABELS[event.step]}</p>}
            {event.message && <p className="break-words text-ink">{event.message}</p>}
            {event.pickupPoint && <p className="mt-1 whitespace-pre-line break-words text-sm text-ink-soft">{event.pickupPoint}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}

function TrackingCard({ tracking }: { tracking: TerroirTracking }) {
  const stopped = STOPPED_STATUSES.includes(tracking.status)
  const delivered = tracking.status === 'HANDED_OVER'
  const showPickup = tracking.status === 'READY_FOR_PICKUP' && tracking.pickupPoint
  return (
    <article className="rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-10">
      <p className="eyebrow text-green-600">Colis offert</p>
      <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
        {tracking.recipientName ? `${tracking.recipientName}, ` : ''}
        {tracking.senderName}
        {' '}
        vous envoie un colis du Bénin
      </h1>

      {tracking.giftMessage && (
        <blockquote className="mt-6 whitespace-pre-line break-words border-l-4 border-green-600 bg-paper py-3 pl-4 pr-3 italic leading-relaxed text-ink">
          {tracking.giftMessage}
        </blockquote>
      )}

      <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2 sm:text-base">
        <div>
          <dt className="text-ink-soft">Expédié par</dt>
          <dd className="font-semibold text-ink">{tracking.departure.agency}</dd>
        </div>
        <div>
          <dt className="text-ink-soft">Départ du Bénin</dt>
          <dd className="font-semibold text-ink">{dayLabel(tracking.departure.departsOn)}</dd>
        </div>
        {!stopped && !delivered && (
          <div className="sm:col-span-2">
            <dt className="text-ink-soft">
              Arrivée prévue en
              {' '}
              {COUNTRY_LABELS[tracking.country]}
            </dt>
            <dd className="font-semibold text-ink">{arrivalLabel(tracking.departure.arrival)}</dd>
          </div>
        )}
      </dl>

      {delivered && (
        <p className="mt-6 leading-relaxed text-ink-soft">Votre colis vous a été remis. Bonne dégustation !</p>
      )}

      {showPickup && tracking.pickupPoint && <PickupCard pickupPoint={tracking.pickupPoint} />}

      <div className="mt-8">
        {stopped
          ? <StoppedNotice status={tracking.status as StoppedStatus} />
          : <StepTracker status={tracking.status} reception={tracking.reception} />}
      </div>

      <section className="mt-8" aria-labelledby="content-title">
        <h2 id="content-title" className="text-lg font-bold text-ink">Dans votre colis</h2>
        <ul className="mt-4 divide-y divide-line">
          {tracking.lines.map((line, index) => (
            <li key={`${index}-${line.name}`} className="flex items-center gap-4 py-3">
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

      {tracking.events.length > 0 && <History events={tracking.events} />}
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

export default function Colis({ loaderData }: Route.ComponentProps) {
  const { content, state } = loaderData
  const revalidator = useRevalidator()
  const live = state.kind === 'found' && !DONE_STATUSES.includes(state.tracking.status)

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
          {state.kind === 'found' && <TrackingCard tracking={state.tracking} />}
          {state.kind === 'not-found' && (
            <MessageCard title="Lien de suivi introuvable" text="Vérifiez le lien que vous avez reçu. S’il est complet, il n’est peut-être plus valable." />
          )}
          {state.kind === 'unavailable' && (
            <MessageCard title="Suivi momentanément indisponible" text="Nous n’arrivons pas à charger votre colis. Réessayez dans quelques instants." />
          )}
        </div>
      </main>
      <SiteFooter footer={content.footer} onDownloadClick={() => {}} />
    </>
  )
}
