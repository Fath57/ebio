import {
  adminPromoCodesControllerCreate,
  adminPromoCodesControllerList,
  adminPromoCodesControllerRemove,
  adminPromoCodesControllerUpdate,
  supplierPromoCodesControllerCreate,
  supplierPromoCodesControllerList,
  supplierPromoCodesControllerRemove,
  supplierPromoCodesControllerUpdate,
} from '@boilerstone/openapi-generator/client/sdk.gen'

export interface PromoCodeItem {
  id: string
  code: string
  supplierId: string | null
  shopName: string | null
  type: 'PERCENT' | 'FIXED'
  value: number
  maxDiscount: number | null
  minOrderAmount: number
  startsAt: string | null
  expiresAt: string | null
  maxUses: number | null
  maxUsesPerUser: number
  useCount: number
  isActive: boolean
  createdAt: string
}

export interface PromoCodeFormData {
  code: string
  type: 'PERCENT' | 'FIXED'
  value: number
  maxDiscount: number | null
  minOrderAmount: number
  startsAt: string | null
  expiresAt: string | null
  maxUses: number | null
  maxUsesPerUser: number
}

/**
 * Same screens for the shop and the backoffice: only the endpoints differ.
 * The adapter carries them, the manager component stays unique.
 */
export interface PromoAdapter {
  queryKey: string[]
  /** The BO lists every shop's codes; the shop page only its own. */
  showShopColumn: boolean
  list: () => Promise<{ items: PromoCodeItem[], total: number }>
  create: (data: PromoCodeFormData) => Promise<void>
  update: (id: string, data: Partial<PromoCodeFormData> & { isActive?: boolean }) => Promise<void>
  remove: (id: string) => Promise<void>
}

async function unwrap<T>(response: { data?: unknown, error?: unknown }, fallback: string): Promise<T> {
  if (response.error) {
    const detail = (response.error as { message?: string })?.message
    throw new Error(detail ?? fallback)
  }
  return response.data as T
}

/** The generated client types dates as Date; the form speaks ISO strings. */
function toBody(data: Partial<PromoCodeFormData> & { isActive?: boolean }) {
  return {
    ...data,
    ...(data.startsAt !== undefined ? { startsAt: data.startsAt ? new Date(data.startsAt) : null } : {}),
    ...(data.expiresAt !== undefined ? { expiresAt: data.expiresAt ? new Date(data.expiresAt) : null } : {}),
  }
}

export const supplierPromoAdapter: PromoAdapter = {
  queryKey: ['supplier', 'promo-codes'],
  showShopColumn: false,
  list: async () => unwrap(
    await supplierPromoCodesControllerList({ query: { page: '1', limit: '50' } }),
    'Failed to load promo codes',
  ),
  create: async (data) => {
    await unwrap(await supplierPromoCodesControllerCreate({ body: toBody(data) as never }), 'Failed to create promo code')
  },
  update: async (id, data) => {
    await unwrap(await supplierPromoCodesControllerUpdate({ path: { id }, body: toBody(data) as never }), 'Failed to update promo code')
  },
  remove: async (id) => {
    await unwrap(await supplierPromoCodesControllerRemove({ path: { id } }), 'Failed to delete promo code')
  },
}

export const adminPromoAdapter: PromoAdapter = {
  queryKey: ['admin', 'promo-codes'],
  showShopColumn: true,
  list: async () => unwrap(
    await adminPromoCodesControllerList({ query: { scope: '', page: '1', limit: '50' } }),
    'Failed to load promo codes',
  ),
  create: async (data) => {
    await unwrap(await adminPromoCodesControllerCreate({ body: toBody(data) as never }), 'Failed to create promo code')
  },
  update: async (id, data) => {
    await unwrap(await adminPromoCodesControllerUpdate({ path: { id }, body: toBody(data) as never }), 'Failed to update promo code')
  },
  remove: async (id) => {
    await unwrap(await adminPromoCodesControllerRemove({ path: { id } }), 'Failed to delete promo code')
  },
}
