import AsyncStorage from '@react-native-async-storage/async-storage'
import * as React from 'react'
import { createContext, use, useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { useSession } from '../../lib/auth-client'
import { track } from '../../utils/analytics'
import { apiFetch } from '../../utils/api-client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CartItem {
  id: string
  productId: string
  supplierId: string
  supplierName: string
  name: string
  imageUrl: string | null
  pricePerUnit: number
  unit: string
  quantity: number
  /** Live promotion types on the product when added (absent on carts stored before). */
  promotionTypes?: string[]
}

export type DeliveryMode = 'PICKUP' | 'DELIVERY'

/**
 * Grouping by shop. No longer a piece of state but a **derived view** of
 * the items: the buyer has one cart, not one per shop, and the handover
 * mode covers the whole. Screens showing where each line comes from still
 * use it, but nothing writes to it.
 */
export interface SupplierCartGroup {
  supplierId: string
  supplierName: string
  items: CartItem[]
}

export interface AddItemInput {
  productId: string
  supplierId: string
  supplierName: string
  name: string
  imageUrl: string | null
  pricePerUnit: number
  unit: string
  quantity?: number
  promotionTypes?: string[]
}

// ---------------------------------------------------------------------------
// State & Actions
// ---------------------------------------------------------------------------

/**
 * How each shop hands its basket over, one shop at a time.
 *
 * A cart holds one basket per shop and each is ordered on its own, so the
 * choice belongs to the shop and not to the cart: one may be worth collecting
 * on the way home while the other is delivered. Absent from the map means
 * delivery, which is what most buyers want and what the cart has always
 * defaulted to.
 */
type DeliveryModes = Record<string, DeliveryMode>

interface CartState {
  items: CartItem[]
  modes: DeliveryModes
  hydrated: boolean
}

type CartAction
  = | { type: 'HYDRATE', items: CartItem[], modes: DeliveryModes }
    | { type: 'ADD_ITEM', input: AddItemInput }
    | { type: 'UPDATE_QUANTITY', itemId: string, quantity: number }
    | { type: 'REMOVE_ITEM', itemId: string }
    | { type: 'SET_DELIVERY_MODE', supplierId: string, mode: DeliveryMode }
    | { type: 'CLEAR_SUPPLIER', supplierId: string }
    | { type: 'CLEAR_ALL' }

const STORAGE_KEY = 'ebio_cart'

/**
 * Long enough that a held-down stepper sends once, short enough that closing
 * the app right after an add still gets the basket across.
 */
const SYNC_DEBOUNCE_MS = 1200

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Cap per cart line. The lower bound already lives here — a quantity
 * dropping to zero removes the item — and the upper one keeps it company
 * rather than being rewritten by every screen that can increment.
 */
export const MAX_ITEM_QUANTITY = 99

function capQuantity(quantity: number): number {
  return Math.min(quantity, MAX_ITEM_QUANTITY)
}

interface StoredCart {
  items: CartItem[]
  modes: DeliveryModes
}

/**
 * Reads back the persisted cart, whatever its age.
 *
 * Three shapes have been stored. The oldest grouped items by shop with a mode
 * per group — which is what we keep again — the middle one flattened
 * everything under a single mode, and the current one keeps the items flat
 * with the modes beside them. A buyer updating the app must not lose their
 * cart, so all three are read; a single stored mode is spread over the shops
 * that were in the cart, which is exactly what it meant.
 */
function readStoredCart(raw: string | null): StoredCart {
  const empty: StoredCart = { items: [], modes: {} }
  if (!raw) {
    return empty
  }
  const parsed = JSON.parse(raw) as unknown

  // The oldest shape: one entry per shop, each with its own mode.
  if (Array.isArray(parsed)) {
    const groups = parsed as Array<{ items?: CartItem[], deliveryMode?: DeliveryMode }>
    const items = groups.flatMap(group => group.items ?? [])
    const modes: DeliveryModes = {}
    for (const group of groups) {
      for (const item of group.items ?? []) {
        modes[item.supplierId] = group.deliveryMode === 'PICKUP' ? 'PICKUP' : 'DELIVERY'
      }
    }
    return { items, modes }
  }

  const stored = parsed as Partial<StoredCart> & { deliveryMode?: DeliveryMode }
  const items = Array.isArray(stored.items) ? stored.items : []
  if (stored.modes && typeof stored.modes === 'object') {
    return { items, modes: stored.modes }
  }

  // The middle shape: one mode for the whole cart. It applied to every shop
  // in it, so that is where it goes.
  const modes: DeliveryModes = {}
  if (stored.deliveryMode === 'PICKUP') {
    for (const item of items) {
      modes[item.supplierId] = 'PICKUP'
    }
  }
  return { items, modes }
}

/** Per-shop view, rebuilt on demand from the flat list. */
export function groupBySupplier(items: CartItem[]): SupplierCartGroup[] {
  const groups: SupplierCartGroup[] = []
  for (const item of items) {
    const existing = groups.find(group => group.supplierId === item.supplierId)
    if (existing) {
      existing.items.push(item)
    }
    else {
      groups.push({ supplierId: item.supplierId, supplierName: item.supplierName, items: [item] })
    }
  }
  return groups
}

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'HYDRATE': {
      return { items: action.items, modes: action.modes, hydrated: true }
    }

    case 'ADD_ITEM': {
      const { input } = action
      const qty = capQuantity(input.quantity ?? 1)
      const existingIndex = state.items.findIndex(item => item.productId === input.productId)

      if (existingIndex !== -1) {
        const items = [...state.items]
        const existing = items[existingIndex]
        items[existingIndex] = {
          ...existing,
          quantity: capQuantity(existing.quantity + qty),
          promotionTypes: input.promotionTypes ?? existing.promotionTypes,
        }
        return { ...state, items }
      }

      return {
        ...state,
        items: [...state.items, {
          id: generateId(),
          productId: input.productId,
          supplierId: input.supplierId,
          supplierName: input.supplierName,
          name: input.name,
          imageUrl: input.imageUrl,
          pricePerUnit: input.pricePerUnit,
          unit: input.unit,
          quantity: qty,
          promotionTypes: input.promotionTypes,
        }],
      }
    }

    case 'UPDATE_QUANTITY': {
      if (action.quantity <= 0) {
        return { ...state, items: state.items.filter(item => item.id !== action.itemId) }
      }
      return {
        ...state,
        items: state.items.map(item =>
          item.id === action.itemId ? { ...item, quantity: capQuantity(action.quantity) } : item,
        ),
      }
    }

    case 'REMOVE_ITEM': {
      return { ...state, items: state.items.filter(item => item.id !== action.itemId) }
    }

    case 'SET_DELIVERY_MODE': {
      return { ...state, modes: { ...state.modes, [action.supplierId]: action.mode } }
    }

    case 'CLEAR_SUPPLIER': {
      // The shop's choice leaves with its basket: were it kept, adding to that
      // shop again months later would silently hand back a pickup nobody asked
      // for this time.
      const { [action.supplierId]: _gone, ...modes } = state.modes
      return {
        ...state,
        items: state.items.filter(item => item.supplierId !== action.supplierId),
        modes,
      }
    }

    case 'CLEAR_ALL': {
      return { ...state, items: [], modes: {} }
    }

    default:
      return state
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface CartContextValue {
  /** The cart, flat. Source of truth. */
  items: CartItem[]
  /** Per-shop view, derived from the items: for display only. */
  groups: SupplierCartGroup[]
  /** One mode for the whole cart. */
  /** How a given shop hands over. Delivery unless it says otherwise. */
  deliveryModeFor: (supplierId: string) => DeliveryMode
  hydrated: boolean
  addItem: (input: AddItemInput) => void
  updateQuantity: (itemId: string, quantity: number) => void
  removeItem: (itemId: string) => void
  setDeliveryMode: (supplierId: string, mode: DeliveryMode) => void
  clearSupplierCart: (supplierId: string) => void
  clearAll: () => void
  getItemCount: () => number
  getTotal: () => number
}

const CartContext = createContext<CartContextValue>({
  items: [],
  groups: [],
  deliveryModeFor: () => 'DELIVERY',
  hydrated: false,
  addItem: () => {},
  updateQuantity: () => {},
  removeItem: () => {},
  setDeliveryMode: () => {},
  clearSupplierCart: () => {},
  clearAll: () => {},
  getItemCount: () => 0,
  getTotal: () => 0,
})

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [], modes: {}, hydrated: false })
  const isFirstRender = useRef(true)
  const { data: session, isPending } = useSession()
  const userId = session?.user.id ?? null

  // Hydrate from AsyncStorage on mount
  useEffect(() => {
    async function hydrate() {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY)
        dispatch({ type: 'HYDRATE', ...readStoredCart(raw) })
      }
      catch {
        dispatch({ type: 'HYDRATE', items: [], modes: {} })
      }
    }
    hydrate()
  }, [])

  /**
   * The basket belongs to whoever filled it.
   *
   * It is kept on the device so it survives a restart, and nothing used to
   * remove it on sign-out: the next person to sign in on the same phone
   * inherited the previous one's articles. Emptying storage alone would not
   * do — the provider stays mounted and writes its items straight back.
   *
   * `undefined` means the session has not resolved yet; comparing against it
   * would empty the basket of someone who never left.
   */
  const knownUserRef = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (isPending) {
      return
    }
    const previous = knownUserRef.current
    knownUserRef.current = userId
    if (previous === undefined || previous === userId) {
      return
    }
    dispatch({ type: 'CLEAR_ALL' })
    void AsyncStorage.removeItem(STORAGE_KEY)
  }, [userId, isPending])

  // Persist to AsyncStorage on every change (skip initial render)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    if (!state.hydrated)
      return

    const stored: StoredCart = { items: state.items, modes: state.modes }
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stored)).catch(() => {
      // Silently ignore persistence errors
    })
  }, [state.items, state.modes, state.hydrated])

  /**
   * Hands the basket to the server, a moment after it stops changing.
   *
   * Debounced because a stepper held down fires on every tap, and the server
   * only needs to know where it landed. The phone stays the authority while
   * the app is open; the server keeps the copy that outlives it — the one
   * that follows its owner to another device and can be reminded about.
   *
   * Failures are swallowed: the basket on this phone is intact either way,
   * and an error message about a background sync would explain nothing to
   * the person holding it.
   */
  useEffect(() => {
    if (!state.hydrated || userId === null) {
      return
    }

    const timer = setTimeout(() => {
      void apiFetch('/api/cart', {
        method: 'PUT',
        body: JSON.stringify({
          items: state.items.map(item => ({
            productId: item.productId,
            supplierId: item.supplierId,
            quantity: item.quantity,
          })),
        }),
      }).catch(() => {
        // Offline, or the session just ended: nothing to tell the buyer.
      })
    }, SYNC_DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
    }
  }, [state.items, state.hydrated, userId])

  const addItem = useCallback((input: AddItemInput) => {
    dispatch({ type: 'ADD_ITEM', input })
    track('panier_ajout', { produit: input.productId, boutique: input.supplierId })
  }, [])

  const updateQuantity = useCallback((itemId: string, quantity: number) => {
    dispatch({ type: 'UPDATE_QUANTITY', itemId, quantity })
  }, [])

  const removeItem = useCallback((itemId: string) => {
    dispatch({ type: 'REMOVE_ITEM', itemId })
  }, [])

  const setDeliveryMode = useCallback((supplierId: string, mode: DeliveryMode) => {
    dispatch({ type: 'SET_DELIVERY_MODE', supplierId, mode })
  }, [])

  const deliveryModeFor = useCallback((supplierId: string): DeliveryMode => {
    return state.modes[supplierId] ?? 'DELIVERY'
  }, [state.modes])

  const clearSupplierCart = useCallback((supplierId: string) => {
    dispatch({ type: 'CLEAR_SUPPLIER', supplierId })
  }, [])

  const clearAll = useCallback(() => {
    dispatch({ type: 'CLEAR_ALL' })
  }, [])

  const getItemCount = useCallback(() => {
    return state.items.reduce((sum, item) => sum + item.quantity, 0)
  }, [state.items])

  const getTotal = useCallback(() => {
    return state.items.reduce((sum, item) => sum + item.pricePerUnit * item.quantity, 0)
  }, [state.items])

  const groups = useMemo(() => groupBySupplier(state.items), [state.items])

  const value = useMemo<CartContextValue>(() => ({
    items: state.items,
    groups,
    deliveryModeFor,
    hydrated: state.hydrated,
    addItem,
    updateQuantity,
    removeItem,
    setDeliveryMode,
    clearSupplierCart,
    clearAll,
    getItemCount,
    getTotal,
  }), [
    state.items,
    deliveryModeFor,
    groups,
    state.hydrated,
    addItem,
    updateQuantity,
    removeItem,
    setDeliveryMode,
    clearSupplierCart,
    clearAll,
    getItemCount,
    getTotal,
  ])

  return (
    <CartContext value={value}>
      {children}
    </CartContext>
  )
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCart() {
  return use(CartContext)
}
