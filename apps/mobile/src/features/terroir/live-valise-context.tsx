import type { ReactNode } from 'react'
import type { TerroirShipmentStatus } from './terroir-api'
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { useSession } from '../../lib/auth-client'
import {
  countryFlag,
  countryInPhrase,
  countryToPhrase,
  fetchTerroirCountries,
  fetchTerroirEnabled,
  fetchTerroirShipment,
  fetchTerroirShipments,
  formatDay,
  formatWindow,
  terroirCountryInfo,
} from './terroir-api'

/** A valise on its way: worth the floating bar until it is handed over. */
const LIVE_STATUSES = new Set<TerroirShipmentStatus>([
  'PAID',
  'COLLECTING',
  'PACKED',
  'DROPPED_AT_AGENCY',
  'DEPARTED',
  'ARRIVED',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
])

/**
 * A valise moves in days, not minutes: the idle cadence of the local orders
 * is already more than enough to follow it.
 */
const POLL_MS = 180_000

export interface LiveValise {
  id: string
  status: TerroirShipmentStatus
  country: string
  flag: string | null
  reception: 'PICKUP' | 'HOME'
  departsOn: string | null
  arrivalFrom: string | null
  arrivalTo: string | null
  giftName: string | null
  /** Set while eBio waits for the weight supplement: the buyer has to act. */
  supplementDeadline: string | null
  supplementDue: boolean
}

interface LiveValiseValue {
  /** Active valises, the most urgent first. */
  valises: LiveValise[]
  refresh: () => void
}

const LiveValiseContext = createContext<LiveValiseValue>({ valises: [], refresh: () => {} })

/** Supplement first, then the one waiting at the agency, then the furthest along. */
function urgency(valise: LiveValise): number {
  if (valise.supplementDue)
    return 100
  if (valise.status === 'READY_FOR_PICKUP' || valise.status === 'OUT_FOR_DELIVERY')
    return 50
  return valiseStep(valise)
}

/**
 * The valises in progress, for the floating bar.
 *
 * Asked only while someone is signed in, never in the background. The
 * switch is read when the app starts or comes back to the foreground, not on
 * every tick: the buyer pays for the data. With the module closed, valises
 * already on their way are still followed: the list is checked on those
 * same moments, and the regular ticks go on only while one is moving.
 */
export function LiveValiseProvider({ children }: { children: ReactNode }) {
  const [valises, setValises] = useState<LiveValise[]>([])
  const { data: session } = useSession()
  const userId = session?.user?.id ?? null
  const enabledRef = useRef(false)
  const movingRef = useRef(false)

  const load = useCallback(async (checkSwitch: boolean): Promise<void> => {
    try {
      if (checkSwitch)
        enabledRef.current = await fetchTerroirEnabled()
      // Module closed and nothing moving at the last check: no need to ask.
      if (!enabledRef.current && !checkSwitch && !movingRef.current) {
        setValises([])
        return
      }
      const active = (await fetchTerroirShipments()).filter(shipment => LIVE_STATUSES.has(shipment.status))
      movingRef.current = active.length > 0
      if (active.length > 0 && active.some(shipment => terroirCountryInfo(shipment.country) === null))
        await fetchTerroirCountries(true).catch(() => undefined)
      // The list does not carry the supplement: one detail per active valise,
      // and a buyer rarely has more than one on its way.
      const details = await Promise.all(active.map(shipment => fetchTerroirShipment(shipment.id).catch(() => null)))
      const next = active.map((shipment, index): LiveValise => {
        const supplement = details[index]?.supplement ?? null
        const supplementDue = supplement?.status === 'REQUESTED'
        return {
          id: shipment.id,
          status: shipment.status,
          country: shipment.country,
          flag: countryFlag(shipment.country),
          reception: shipment.reception,
          departsOn: shipment.departsOn,
          arrivalFrom: shipment.arrivalFrom,
          arrivalTo: shipment.arrivalTo,
          giftName: shipment.giftName,
          supplementDeadline: supplementDue ? supplement?.deadline ?? null : null,
          supplementDue,
        }
      })
      setValises(next.sort((a, b) => urgency(b) - urgency(a)))
    }
    catch {
      // Keep the last known state: a hiccup must not make a valise vanish.
    }
  }, [])

  useEffect(() => {
    if (!userId) {
      setValises([])
      return
    }

    void load(true)
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') {
        void load(false)
      }
    }, POLL_MS)

    const watch = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void load(true)
      }
    })

    return () => {
      clearInterval(timer)
      watch.remove()
    }
  }, [load, userId])

  const value = useMemo<LiveValiseValue>(
    () => ({ valises, refresh: () => void load(true) }),
    [valises, load],
  )

  return <LiveValiseContext value={value}>{children}</LiveValiseContext>
}

export function useLiveValise(): LiveValiseValue {
  return use(LiveValiseContext)
}

/**
 * Where the valise stands on its five-step track: paid, collected, left,
 * arrived, to collect (or being delivered).
 */
export function valiseStep(valise: Pick<LiveValise, 'status'>): number {
  switch (valise.status) {
    case 'PAID':
      return 0
    case 'COLLECTING':
    case 'PACKED':
    case 'DROPPED_AT_AGENCY':
      return 1
    case 'DEPARTED':
      return 2
    case 'ARRIVED':
      return 3
    case 'READY_FOR_PICKUP':
    case 'OUT_FOR_DELIVERY':
      return 4
    default:
      return 0
  }
}

/** « 16 nov. à 14:00 » */
function formatDeadline(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime()))
    return ''
  const day = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return `${day} à ${time}`
}

/** One line, in the buyer's words, for the bar. */
export function liveValiseLabel(valise: LiveValise): string {
  if (valise.supplementDue) {
    const deadline = valise.supplementDeadline ? formatDeadline(valise.supplementDeadline) : ''
    return deadline ? `Complément à régler avant le ${deadline}` : 'Complément de transport à régler'
  }
  switch (valise.status) {
    case 'PAID':
      return 'Valise payée, collecte à venir'
    case 'COLLECTING':
      return 'Collecte chez les boutiques'
    case 'PACKED':
      return 'Votre valise est prête à partir'
    case 'DROPPED_AT_AGENCY':
      return valise.departsOn ? `Déposée à l’agence, départ le ${formatDay(valise.departsOn)}` : 'Déposée à l’agence'
    case 'DEPARTED': {
      const window = formatWindow(valise.arrivalFrom, valise.arrivalTo)
      return window ? `Partie, arrivée prévue ${window}` : 'Votre valise est partie'
    }
    case 'ARRIVED':
      return `Arrivée ${countryInPhrase(valise.country)}`
    case 'READY_FOR_PICKUP':
      return 'Prête : vous pouvez la retirer'
    case 'OUT_FOR_DELIVERY':
      return 'En livraison chez vous'
    default:
      return 'Votre valise est en route'
  }
}

/** « 🇫🇷 Valise vers la France » or « 🇫🇷 Valise pour Awa » */
export function liveValiseSubtitle(valise: LiveValise): string {
  const flag = valise.flag ? `${valise.flag} ` : ''
  return valise.giftName
    ? `${flag}Valise pour ${valise.giftName}`
    : `${flag}Valise ${countryToPhrase(valise.country)}`
}
