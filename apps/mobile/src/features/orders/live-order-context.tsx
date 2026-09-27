import type { ReactNode } from 'react'
import { createContext, use, useCallback, useEffect, useMemo, useState } from 'react'
import { AppState } from 'react-native'
import { useSession } from '../../lib/auth-client'
import { apiFetch } from '../../utils/api-client'

/**
 * Statuses worth pinning a bar to the screen for.
 *
 * `PLACED` is deliberately absent: an order passed at eleven at night and not
 * yet looked at is not news, and it would hold the bar until morning. The bar
 * is for what moves.
 */
const MOVING = new Set(['ACCEPTED', 'PREPARING', 'READY', 'IN_DELIVERY'])

/** Often enough to follow a courier, rare enough to leave the battery alone. */
const LIVE_POLL_MS = 45_000

/**
 * While nothing is moving there is nothing to miss, so we ask rarely — most
 * buyers open the app with no order in progress, and data costs them money.
 */
const IDLE_POLL_MS = 180_000

export interface LiveOrder {
  id: string
  orderNumber: string
  shopName: string
  status: string
  deliveryStatus: string | null
  courierName: string | null
}

interface LiveOrderValue {
  /** The order the buyer is waiting on, or `null` when nothing moves. */
  order: LiveOrder | null
  /** How many are moving, the one above included. */
  count: number
  refresh: () => void
}

const LiveOrderContext = createContext<LiveOrderValue>({ order: null, count: 0, refresh: () => {} })

interface RawOrder {
  id: string
  orderNumber: string
  supplierName: string
  status: string
  delivery: { status: string, courierName: string | null } | null
}

/** The one furthest along: it is the one about to need the buyer. */
const RANK: Record<string, number> = { ACCEPTED: 1, PREPARING: 2, READY: 3, IN_DELIVERY: 4 }

/**
 * The order in progress, wherever the buyer happens to be.
 *
 * The orders screen already refreshed itself while a courier was moving — but
 * only while that screen was open, which is precisely when the buyer does not
 * need telling. Held here instead, so one poll serves the whole app: the bar
 * that shows it, and the badge on the orders tab.
 *
 * Stops while the app is in the background, and while nobody is signed in.
 * Nobody needs a delivery followed in a pocket.
 */
export function LiveOrderProvider({ children }: { children: ReactNode }) {
  const [order, setOrder] = useState<LiveOrder | null>(null)
  const [count, setCount] = useState(0)
  const { data: session } = useSession()
  const userId = session?.user?.id ?? null

  const load = useCallback(async (): Promise<void> => {
    try {
      const res = await apiFetch('/api/orders?view=buyer')
      if (!res.ok) {
        return
      }
      const raw = await res.json() as RawOrder[] | { orders?: RawOrder[], data?: RawOrder[] }
      const list = Array.isArray(raw) ? raw : raw.orders ?? raw.data ?? []
      const moving = list
        .filter(item => MOVING.has(item.status))
        .sort((a, b) => (RANK[b.status] ?? 0) - (RANK[a.status] ?? 0))
      const first = moving[0]
      setCount(moving.length)
      setOrder(first
        ? {
            id: first.id,
            orderNumber: first.orderNumber,
            shopName: first.supplierName,
            status: first.status,
            deliveryStatus: first.delivery?.status ?? null,
            courierName: first.delivery?.courierName ?? null,
          }
        : null)
    }
    catch {
      // Keep the last known state: a hiccup must not make a delivery vanish.
    }
  }, [])

  const isLive = order !== null

  useEffect(() => {
    if (!userId) {
      setOrder(null)
      setCount(0)
      return
    }

    void load()
    const every = isLive ? LIVE_POLL_MS : IDLE_POLL_MS
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') {
        void load()
      }
    }, every)

    // Coming back to the app is the moment the answer is most wanted.
    const watch = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void load()
      }
    })

    return () => {
      clearInterval(timer)
      watch.remove()
    }
  }, [load, userId, isLive])

  const value = useMemo<LiveOrderValue>(
    () => ({ order, count, refresh: () => void load() }),
    [order, count, load],
  )

  return <LiveOrderContext value={value}>{children}</LiveOrderContext>
}

export function useLiveOrder(): LiveOrderValue {
  return use(LiveOrderContext)
}

/** One line, in the buyer's words, for the bar. */
export function liveOrderLabel(order: LiveOrder): string {
  if (order.status === 'IN_DELIVERY') {
    const courier = order.courierName
    if (order.deliveryStatus === 'IN_TRANSIT') {
      return courier ? `${courier} est en route` : 'Votre livreur est en route'
    }
    if (order.deliveryStatus === 'PICKED_UP') {
      return 'Votre commande a été récupérée'
    }
    if (order.deliveryStatus === 'ACCEPTED') {
      return courier ? `${courier} va chercher votre commande` : 'Un livreur a pris la course'
    }
    return 'Recherche d\'un livreur'
  }
  if (order.status === 'READY') {
    return `Prête chez ${order.shopName}`
  }
  if (order.status === 'PREPARING') {
    return `En préparation chez ${order.shopName}`
  }
  return `Commande acceptée par ${order.shopName}`
}
