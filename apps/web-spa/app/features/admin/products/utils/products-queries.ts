import { adminControllerGetCatalogue, adminControllerGetCatalogueProduct, adminProductModerationControllerDecide } from '@boilerstone/openapi-generator/client/sdk.gen'

export type ProductStatusFilter = '' | 'ACTIVE' | 'OUT_OF_STOCK' | 'HIDDEN'
export type StockFilter = '' | 'out' | 'low' | 'in'
/** eBio's review of a product, apart from the shop's own status. */
export type ProductModeration = 'APPROVED' | 'PENDING' | 'REJECTED' | 'WITHDRAWN'
export type ModerationFilter = '' | ProductModeration
export type ModerationAction = 'approve' | 'reject' | 'withdraw' | 'restore'

export interface AdminProductItem {
  id: string
  name: string
  photo: string | null
  pricePerUnit: number
  promotionalPrice: number | null
  hasPromotion: boolean
  unit: string | null
  stock: number
  stockAlertThreshold: number
  status: 'ACTIVE' | 'OUT_OF_STOCK' | 'HIDDEN'
  moderationStatus: ProductModeration
  moderationReason: string | null
  categoryId: string
  categoryName: string
  supplierId: string
  supplierName: string
  supplierValidationStatus: string
  /** Units sold on paid or placed orders, cancellations excluded. */
  unitsSold: number
  orderCount: number
  ratingAvg: number | null
  ratingCount: number
  createdAt: string
}

/** The advanced filters, by API query name; values travel as typed in the URL. */
export const PRODUCT_ADVANCED_FILTER_KEYS = [
  'minPrice',
  'maxPrice',
  'minSold',
  'sales',
  'label',
  'photo',
  'shop',
  'formats',
  'minRating',
  'createdFrom',
  'createdTo',
] as const
export type ProductAdvancedFilterKey = typeof PRODUCT_ADVANCED_FILTER_KEYS[number]

export interface AdminProductsPage {
  items: AdminProductItem[]
  total: number
  page: number
  limit: number
}

export interface AdminProductsFilters {
  q?: string
  supplierId?: string
  categoryId?: string
  status?: ProductStatusFilter
  moderation?: ModerationFilter
  stock?: StockFilter
  promo?: boolean
  advanced?: Partial<Record<ProductAdvancedFilterKey, string>>
  sortBy?: string
  sortDir?: string
  page?: number
  limit?: number
}

export const ADMIN_PRODUCTS_PAGE_SIZE = 25

export const PRODUCT_STATUS_OPTIONS: ProductStatusFilter[] = ['ACTIVE', 'OUT_OF_STOCK', 'HIDDEN']
export const STOCK_OPTIONS: StockFilter[] = ['out', 'low', 'in']
export const MODERATION_OPTIONS: ProductModeration[] = ['PENDING', 'REJECTED', 'WITHDRAWN', 'APPROVED']

/**
 * The whole platform's catalogue.
 *
 * Deliberately not the picker endpoint (`/admin/products`): that one caps at
 * fifty rows and only ever returns what is on sale, which is the opposite of
 * what someone hunting a withdrawn or out-of-stock product needs.
 */
export function fetchAdminProductsQueryOptions(filters: AdminProductsFilters = {}) {
  return {
    queryKey: ['admin', 'catalogue', filters],
    queryFn: async () => {
      const response = await adminControllerGetCatalogue({
        query: {
          q: filters.q ?? '',
          supplierId: filters.supplierId ?? '',
          categoryId: filters.categoryId ?? '',
          status: filters.status ?? '',
          moderation: filters.moderation ?? '',
          stock: filters.stock ?? '',
          promo: filters.promo ? 'true' : '',
          ...Object.fromEntries(PRODUCT_ADVANCED_FILTER_KEYS.map(key => [key, filters.advanced?.[key] ?? ''])) as Record<ProductAdvancedFilterKey, string>,
          sortBy: filters.sortBy ?? '',
          sortDir: filters.sortDir ?? '',
          page: String(filters.page ?? 1),
          limit: String(filters.limit ?? ADMIN_PRODUCTS_PAGE_SIZE),
        },
      })
      if (response.error)
        throw new Error('Failed to fetch products')
      return response.data as AdminProductsPage
    },
  }
}

export type VisibilityIssue
  = | 'SHOP_NOT_VALIDATED'
    | 'SHOP_NOT_LOCATED'
    | 'SHOP_CONTACT_ONLY'
    | 'PRODUCT_HIDDEN'
    | 'PENDING_REVIEW'
    | 'REJECTED'
    | 'WITHDRAWN'
    | 'OUT_OF_STOCK'
    | 'NO_PHOTO'

/** The product as the API maps it, the fields the admin page reads. */
export interface AdminProductRecord {
  id: string
  name: string
  description: string | null
  photos: string[]
  pricePerUnit: number
  promotionalPrice: number | null
  stock: number
  stockAlertThreshold: number
  status: 'ACTIVE' | 'OUT_OF_STOCK' | 'HIDDEN'
  moderationStatus: ProductModeration
  moderationReason: string | null
  ingredients: string | null
  allergens: string[]
  origin: string | null
  conservation: string | null
  variants: Array<{ id: string, label: string, pricePerUnit: number, stock: number, packSize: number | null }>
  createdAt: string
  updatedAt: string
}

export interface AdminProductDetail {
  product: AdminProductRecord
  categoryName: string | null
  unit: string
  shop: { id: string, shopName: string, validationStatus: string, mode: string, located: boolean, ownerName: string | null, ownerPhone: string | null }
  certifications: Array<{ code: string, name: string, logoUrl: string | null, isActive: boolean }>
  sales: { unitsSold: number, orderCount: number, revenue: number, cancelledUnits: number, lastSoldAt: string | null }
  recentOrders: Array<{ id: string, orderNumber: string, status: string, quantity: number, variantLabel: string | null, total: number, buyerName: string | null, createdAt: string }>
  reviews: {
    average: number | null
    count: number
    latest: Array<{ id: string, rating: number, comment: string | null, buyerName: string | null, isHidden: boolean, createdAt: string }>
  }
  /** Empty when a buyer nearby can find and order the product. */
  visibilityIssues: VisibilityIssue[]
}

export function fetchAdminProductDetailQueryOptions(productId: string) {
  return {
    queryKey: ['admin', 'catalogue', 'detail', productId],
    queryFn: async () => {
      const response = await adminControllerGetCatalogueProduct({ path: { id: productId } })
      if (response.error)
        throw new Error('Failed to fetch product')
      return response.data as AdminProductDetail
    },
  }
}

/** An eBio decision on a product; the shop is told, with the reason. */
export async function decideProductModeration(productId: string, action: ModerationAction, reason?: string) {
  const response = await adminProductModerationControllerDecide({
    path: { id: productId },
    body: { action, reason },
  })
  if (response.error)
    throw new Error('Failed to apply the moderation decision')
  return response.data
}
