import { adminControllerGetDashboard } from '@boilerstone/openapi-generator/client/sdk.gen'

export const DASHBOARD_PERIODS = ['7d', '30d', '90d', 'month'] as const
export type DashboardPeriod = typeof DASHBOARD_PERIODS[number]

/** A measure over the period, and the same measure over the period just before it. */
export interface DashboardMeasure {
  value: number
  previous: number
}

export interface DashboardDay {
  /** Local calendar day, `YYYY-MM-DD`. */
  date: string
  orders: number
  gmv: number
}

export interface DashboardTopSupplier {
  id: string
  shopName: string
  orders: number
  gmv: number
}

export interface DashboardOverview {
  period: { key: DashboardPeriod, from: string, to: string }
  kpis: {
    gmv: DashboardMeasure
    orders: DashboardMeasure
    commission: DashboardMeasure
    newBuyers: DashboardMeasure
    /** 0 to 1. */
    cancellationRate: DashboardMeasure
  }
  daily: DashboardDay[]
  topSuppliers: DashboardTopSupplier[]
  platform: { validatedSuppliers: number, validatedCouriers: number, buyers: number }
}

export function parseDashboardPeriod(value: string | null): DashboardPeriod {
  return (DASHBOARD_PERIODS as readonly string[]).includes(value ?? '') ? value as DashboardPeriod : '30d'
}

export function fetchDashboardQueryOptions(period: DashboardPeriod) {
  return {
    queryKey: ['admin', 'dashboard', period],
    queryFn: async () => {
      const response = await adminControllerGetDashboard({ query: { period } })
      if (response.error)
        throw new Error('Failed to fetch the dashboard')
      return response.data as DashboardOverview
    },
  }
}
