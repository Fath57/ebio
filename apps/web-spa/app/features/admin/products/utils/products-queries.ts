import { adminControllerGetCatalogue } from '@boilerstone/openapi-generator/client/sdk.gen'

export type ProductStatusFilter = '' | 'ACTIVE' | 'OUT_OF_STOCK' | 'HIDDEN'
export type StockFilter = '' | 'out' | 'low' | 'in'

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
  categoryId: string
  categoryName: string
  supplierId: string
  supplierName: string
  supplierValidationStatus: string
  createdAt: string
}

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
  stock?: StockFilter
  promo?: boolean
  sortBy?: string
  sortDir?: string
  page?: number
  limit?: number
}

export const ADMIN_PRODUCTS_PAGE_SIZE = 25

export const PRODUCT_STATUS_OPTIONS: ProductStatusFilter[] = ['ACTIVE', 'OUT_OF_STOCK', 'HIDDEN']
export const STOCK_OPTIONS: StockFilter[] = ['out', 'low', 'in']

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
          stock: filters.stock ?? '',
          promo: filters.promo ? 'true' : '',
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
