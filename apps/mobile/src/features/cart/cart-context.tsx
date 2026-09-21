import AsyncStorage from '@react-native-async-storage/async-storage'
import * as React from 'react'
import { createContext, use, useCallback, useEffect, useMemo, useReducer, useRef } from 'react'

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
 * Regroupement par boutique. Ce n'est plus un état, c'est une **vue dérivée**
 * des articles : l'acheteur a un panier, pas un panier par boutique, et le
 * mode de remise vaut pour l'ensemble. Les écrans qui affichent d'où vient
 * chaque ligne s'en servent encore, mais rien ne s'y écrit.
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

interface CartState {
  items: CartItem[]
  /** Un seul mode pour tout le panier : le mode mixte est hors périmètre. */
  deliveryMode: DeliveryMode
  hydrated: boolean
}

type CartAction
  = | { type: 'HYDRATE', items: CartItem[], deliveryMode: DeliveryMode }
    | { type: 'ADD_ITEM', input: AddItemInput }
    | { type: 'UPDATE_QUANTITY', itemId: string, quantity: number }
    | { type: 'REMOVE_ITEM', itemId: string }
    | { type: 'SET_DELIVERY_MODE', mode: DeliveryMode }
    | { type: 'CLEAR_SUPPLIER', supplierId: string }
    | { type: 'CLEAR_ALL' }

const STORAGE_KEY = 'ebio_cart'

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Plafond par ligne de panier. La borne basse vit déjà ici — une quantité
 * tombée à zéro retire l'article — et la haute lui tient compagnie plutôt que
 * d'être réécrite par chaque écran qui sait incrémenter.
 */
export const MAX_ITEM_QUANTITY = 99

function capQuantity(quantity: number): number {
  return Math.min(quantity, MAX_ITEM_QUANTITY)
}

interface StoredCart {
  items: CartItem[]
  deliveryMode: DeliveryMode
}

/**
 * Relit le panier persisté, quel que soit son âge.
 *
 * Jusqu'ici le panier était stocké groupé par boutique, avec un mode de remise
 * par groupe. Un acheteur qui met l'application à jour ne doit pas perdre son
 * panier : l'ancien format est aplati, et si les modes divergeaient on retient
 * la livraison — c'est le défaut de l'ancien code et le moins surprenant.
 */
function readStoredCart(raw: string | null): StoredCart {
  const empty: StoredCart = { items: [], deliveryMode: 'DELIVERY' }
  if (!raw) {
    return empty
  }
  const parsed = JSON.parse(raw) as unknown
  if (Array.isArray(parsed)) {
    const groups = parsed as Array<{ items?: CartItem[], deliveryMode?: DeliveryMode }>
    return {
      items: groups.flatMap(group => group.items ?? []),
      deliveryMode: groups.every(group => group.deliveryMode === 'PICKUP') && groups.length > 0
        ? 'PICKUP'
        : 'DELIVERY',
    }
  }
  const stored = parsed as Partial<StoredCart>
  return {
    items: Array.isArray(stored.items) ? stored.items : [],
    deliveryMode: stored.deliveryMode === 'PICKUP' ? 'PICKUP' : 'DELIVERY',
  }
}

/** Vue par boutique, reconstruite à la demande depuis la liste à plat. */
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
      return { items: action.items, deliveryMode: action.deliveryMode, hydrated: true }
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
      return { ...state, deliveryMode: action.mode }
    }

    case 'CLEAR_SUPPLIER': {
      return { ...state, items: state.items.filter(item => item.supplierId !== action.supplierId) }
    }

    case 'CLEAR_ALL': {
      return { ...state, items: [] }
    }

    default:
      return state
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface CartContextValue {
  /** Le panier, à plat. Source de vérité. */
  items: CartItem[]
  /** Vue par boutique, dérivée des articles : pour l'affichage seulement. */
  groups: SupplierCartGroup[]
  /** Un seul mode pour tout le panier. */
  deliveryMode: DeliveryMode
  hydrated: boolean
  addItem: (input: AddItemInput) => void
  updateQuantity: (itemId: string, quantity: number) => void
  removeItem: (itemId: string) => void
  setDeliveryMode: (mode: DeliveryMode) => void
  clearSupplierCart: (supplierId: string) => void
  clearAll: () => void
  getItemCount: () => number
  getTotal: () => number
}

const CartContext = createContext<CartContextValue>({
  items: [],
  groups: [],
  deliveryMode: 'DELIVERY',
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
  const [state, dispatch] = useReducer(cartReducer, { items: [], deliveryMode: 'DELIVERY', hydrated: false })
  const isFirstRender = useRef(true)

  // Hydrate from AsyncStorage on mount
  useEffect(() => {
    async function hydrate() {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY)
        dispatch({ type: 'HYDRATE', ...readStoredCart(raw) })
      }
      catch {
        dispatch({ type: 'HYDRATE', items: [], deliveryMode: 'DELIVERY' })
      }
    }
    hydrate()
  }, [])

  // Persist to AsyncStorage on every change (skip initial render)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    if (!state.hydrated)
      return

    const stored: StoredCart = { items: state.items, deliveryMode: state.deliveryMode }
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stored)).catch(() => {
      // Silently ignore persistence errors
    })
  }, [state.items, state.deliveryMode, state.hydrated])

  const addItem = useCallback((input: AddItemInput) => {
    dispatch({ type: 'ADD_ITEM', input })
  }, [])

  const updateQuantity = useCallback((itemId: string, quantity: number) => {
    dispatch({ type: 'UPDATE_QUANTITY', itemId, quantity })
  }, [])

  const removeItem = useCallback((itemId: string) => {
    dispatch({ type: 'REMOVE_ITEM', itemId })
  }, [])

  const setDeliveryMode = useCallback((mode: DeliveryMode) => {
    dispatch({ type: 'SET_DELIVERY_MODE', mode })
  }, [])

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
    deliveryMode: state.deliveryMode,
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
    state.deliveryMode,
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
