import { client } from '@boilerstone/openapi-generator'

export interface AnalyticsData {
  revenue: number
  revenueTrend: number
  ordersCount: number
  ordersTrend: number
  averageOrder: number
}

export interface TopProductItem {
  id: string
  name: string
  quantitySold: number
  revenue: number
}

export interface TopProductsData {
  data: TopProductItem[]
}

export interface RatingsOverviewData {
  average: number
  totalCount: number
  distribution: Record<number, number>
}

export function fetchAnalyticsQueryOptions(period: string = 'month') {
  return {
    queryKey: ['analytics', period],
    queryFn: async () => {
      // No dedicated SDK function for /api/suppliers/me/analytics — fallback to client
      const result = await client.get({ url: `/api/suppliers/me/analytics?period=${period}` })
      return result.data as AnalyticsData
    },
  }
}

export function fetchTopProductsQueryOptions(period: string = 'month') {
  return {
    queryKey: ['analytics', 'top-products', period],
    queryFn: async () => {
      // No dedicated SDK function for /api/suppliers/me/analytics/top-products — fallback to client
      const result = await client.get({ url: `/api/suppliers/me/analytics/top-products?period=${period}` })
      return result.data as TopProductsData
    },
  }
}

export function fetchRatingsOverviewQueryOptions() {
  return {
    queryKey: ['analytics', 'ratings'],
    queryFn: async () => {
      // No dedicated SDK function for /api/suppliers/me/analytics/ratings — fallback to client
      const result = await client.get({ url: '/api/suppliers/me/analytics/ratings' })
      return result.data as RatingsOverviewData
    },
  }
}
