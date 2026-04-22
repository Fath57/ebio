import AsyncStorage from '@react-native-async-storage/async-storage'
import * as React from 'react'
import { createContext, useCallback, useEffect, useMemo, useReducer, useRef } from 'react'

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
}

export type DeliveryMode = 'PICKUP' | 'DELIVERY'

export interface SupplierCartGroup {
  supplierId: string
  supplierName: string
  items: CartItem[]
  deliveryMode: DeliveryMode
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
}

// ---------------------------------------------------------------------------
// State & Actions
// ---------------------------------------------------------------------------

interface CartState {
  groups: SupplierCartGroup[]
  hydrated: boolean
}

type CartAction
  = | { type: 'HYDRATE', groups: SupplierCartGroup[] }
    | { type: 'ADD_ITEM', input: AddItemInput }
    | { type: 'UPDATE_QUANTITY', itemId: string, quantity: number }
    | { type: 'REMOVE_ITEM', itemId: string }
    | { type: 'CHANGE_DELIVERY_MODE', supplierId: string, mode: DeliveryMode }
    | { type: 'CLEAR_SUPPLIER', supplierId: string }
    | { type: 'CLEAR_ALL' }

const STORAGE_KEY = 'ebio_cart'

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function removeEmptyGroups(groups: SupplierCartGroup[]): SupplierCartGroup[] {
  return groups.filter(g => g.items.length > 0)
}

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'HYDRATE': {
      return { groups: action.groups, hydrated: true }
    }

    case 'ADD_ITEM': {
      const { input } = action
      const qty = input.quantity ?? 1
      const groups = [...state.groups]
      const groupIndex = groups.findIndex(g => g.supplierId === input.supplierId)

      if (groupIndex === -1) {
        groups.push({
          supplierId: input.supplierId,
          supplierName: input.supplierName,
          deliveryMode: 'PICKUP',
          items: [
            {
              id: generateId(),
              productId: input.productId,
              supplierId: input.supplierId,
              supplierName: input.supplierName,
              name: input.name,
              imageUrl: input.imageUrl,
              pricePerUnit: input.pricePerUnit,
              unit: input.unit,
              quantity: qty,
            },
          ],
        })
      }
      else {
        const group = { ...groups[groupIndex], items: [...groups[groupIndex].items] }
        const existingIndex = group.items.findIndex(i => i.productId === input.productId)

        if (existingIndex !== -1) {
          const existing = group.items[existingIndex]
          group.items[existingIndex] = { ...existing, quantity: existing.quantity + qty }
        }
        else {
          group.items.push({
            id: generateId(),
            productId: input.productId,
            supplierId: input.supplierId,
            supplierName: input.supplierName,
            name: input.name,
            imageUrl: input.imageUrl,
            pricePerUnit: input.pricePerUnit,
            unit: input.unit,
            quantity: qty,
          })
        }

        groups[groupIndex] = group
      }

      return { ...state, groups }
    }

    case 'UPDATE_QUANTITY': {
      const groups = state.groups.map((group) => {
        const itemIndex = group.items.findIndex(i => i.id === action.itemId)
        if (itemIndex === -1)
          return group

        if (action.quantity <= 0) {
          return {
            ...group,
            items: group.items.filter(i => i.id !== action.itemId),
          }
        }

        const items = [...group.items]
        items[itemIndex] = { ...items[itemIndex], quantity: action.quantity }
        return { ...group, items }
      })

      return { ...state, groups: removeEmptyGroups(groups) }
    }

    case 'REMOVE_ITEM': {
      const groups = state.groups.map(group => ({
        ...group,
        items: group.items.filter(i => i.id !== action.itemId),
      }))

      return { ...state, groups: removeEmptyGroups(groups) }
    }

    case 'CHANGE_DELIVERY_MODE': {
      const groups = state.groups.map(group =>
        group.supplierId === action.supplierId
          ? { ...group, deliveryMode: action.mode }
          : group,
      )
      return { ...state, groups }
    }

    case 'CLEAR_SUPPLIER': {
      return {
        ...state,
        groups: state.groups.filter(g => g.supplierId !== action.supplierId),
      }
    }

    case 'CLEAR_ALL': {
      return { ...state, groups: [] }
    }

    default:
      return state
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface CartContextValue {
  groups: SupplierCartGroup[]
  hydrated: boolean
  addItem: (input: AddItemInput) => void
  updateQuantity: (itemId: string, quantity: number) => void
  removeItem: (itemId: string) => void
  changeDeliveryMode: (supplierId: string, mode: DeliveryMode) => void
  clearSupplierCart: (supplierId: string) => void
  clearAll: () => void
  getItemCount: () => number
  getTotal: () => number
}

const CartContext = createContext<CartContextValue>({
  groups: [],
  hydrated: false,
  addItem: () => {},
  updateQuantity: () => {},
  removeItem: () => {},
  changeDeliveryMode: () => {},
  clearSupplierCart: () => {},
  clearAll: () => {},
  getItemCount: () => 0,
  getTotal: () => 0,
})

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { groups: [], hydrated: false })
  const isFirstRender = useRef(true)

  // Hydrate from AsyncStorage on mount
  useEffect(() => {
    async function hydrate() {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY)
        if (raw) {
          const groups = JSON.parse(raw) as SupplierCartGroup[]
          dispatch({ type: 'HYDRATE', groups })
        }
        else {
          dispatch({ type: 'HYDRATE', groups: [] })
        }
      }
      catch {
        dispatch({ type: 'HYDRATE', groups: [] })
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

    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state.groups)).catch(() => {
      // Silently ignore persistence errors
    })
  }, [state.groups, state.hydrated])

  const addItem = useCallback((input: AddItemInput) => {
    dispatch({ type: 'ADD_ITEM', input })
  }, [])

  const updateQuantity = useCallback((itemId: string, quantity: number) => {
    dispatch({ type: 'UPDATE_QUANTITY', itemId, quantity })
  }, [])

  const removeItem = useCallback((itemId: string) => {
    dispatch({ type: 'REMOVE_ITEM', itemId })
  }, [])

  const changeDeliveryMode = useCallback((supplierId: string, mode: DeliveryMode) => {
    dispatch({ type: 'CHANGE_DELIVERY_MODE', supplierId, mode })
  }, [])

  const clearSupplierCart = useCallback((supplierId: string) => {
    dispatch({ type: 'CLEAR_SUPPLIER', supplierId })
  }, [])

  const clearAll = useCallback(() => {
    dispatch({ type: 'CLEAR_ALL' })
  }, [])

  const getItemCount = useCallback(() => {
    return state.groups.reduce(
      (total, group) => total + group.items.reduce((sum, item) => sum + item.quantity, 0),
      0,
    )
  }, [state.groups])

  const getTotal = useCallback(() => {
    return state.groups.reduce(
      (total, group) =>
        total + group.items.reduce((sum, item) => sum + item.pricePerUnit * item.quantity, 0),
      0,
    )
  }, [state.groups])

  const value = useMemo<CartContextValue>(() => ({
    groups: state.groups,
    hydrated: state.hydrated,
    addItem,
    updateQuantity,
    removeItem,
    changeDeliveryMode,
    clearSupplierCart,
    clearAll,
    getItemCount,
    getTotal,
  }), [
    state.groups,
    state.hydrated,
    addItem,
    updateQuantity,
    removeItem,
    changeDeliveryMode,
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
