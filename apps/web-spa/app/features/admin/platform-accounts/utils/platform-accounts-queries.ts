import {
  walletAdminControllerPlatformOverview,
  walletAdminControllerPlatformTransactions,
} from '@boilerstone/openapi-generator/client/sdk.gen'

/** The four eBio wallets: three revenue streams and one cost centre. */
export const PLATFORM_ACCOUNTS = [
  'SALES_COMMISSION',
  'DELIVERY_COMMISSION',
  'BANNERS',
  'MARKETING',
] as const

export type PlatformAccount = (typeof PLATFORM_ACCOUNTS)[number]

/** MARKETING is what eBio gives away, so its balance is always negative. */
export const COST_CENTRE_ACCOUNTS: readonly PlatformAccount[] = ['MARKETING']

export interface PlatformAccountBalance {
  account: PlatformAccount
  /** Live balance in FCFA, already signed. */
  balance: number
  /** Movement over the selected period, in FCFA, already signed. */
  periodAmount: number
}

export interface PlatformMonthlyPoint {
  /** `YYYY-MM`. */
  month: string
  net: number
}

export interface PlatformAccountsOverview {
  accounts: PlatformAccountBalance[]
  netBalance: number
  netPeriod: number
  monthly: PlatformMonthlyPoint[]
}

export interface PlatformTransaction {
  id: string
  type: string
  amount: number
  balanceAfter: number
  description: string
  orderId: string | null
  deliveryId: string | null
  createdAt: string
}

export interface PlatformTransactionsPage {
  items: PlatformTransaction[]
  total?: number
  page?: number
  limit?: number
}

/** Periods offered by the selector; `all` sends no date bound at all. */
export const PLATFORM_PERIODS = ['thisMonth', 'lastMonth', 'thisYear', 'all'] as const

export type PlatformPeriod = (typeof PLATFORM_PERIODS)[number]

export interface PlatformDateRange {
  from: string
  to: string
}

/**
 * Turns a period key into the ISO bounds the API expects. Empty strings mean
 * "no bound" — the generated SDK types both params as required.
 */
export function platformPeriodRange(period: PlatformPeriod): PlatformDateRange {
  const now = new Date()

  if (period === 'thisMonth') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    return { from: start.toISOString(), to: '' }
  }

  if (period === 'lastMonth') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const end = new Date(now.getFullYear(), now.getMonth(), 1)
    // One millisecond back so the bound stays inside the previous month.
    return { from: start.toISOString(), to: new Date(end.getTime() - 1).toISOString() }
  }

  if (period === 'thisYear') {
    const start = new Date(now.getFullYear(), 0, 1)
    return { from: start.toISOString(), to: '' }
  }

  return { from: '', to: '' }
}

export function fetchPlatformAccountsQueryOptions(range: PlatformDateRange) {
  return {
    queryKey: ['admin', 'platform-accounts', range.from, range.to],
    queryFn: async () => {
      const response = await walletAdminControllerPlatformOverview({
        query: { from: range.from, to: range.to },
      })
      if (response.error)
        throw new Error('Failed to fetch platform accounts')
      return response.data as PlatformAccountsOverview
    },
  }
}

export function fetchPlatformAccountTransactionsQueryOptions(
  account: PlatformAccount,
  page: number,
) {
  return {
    queryKey: ['admin', 'platform-accounts', account, 'transactions', page],
    queryFn: async () => {
      const response = await walletAdminControllerPlatformTransactions({
        path: { account },
        query: { page: String(page), limit: '20' },
      })
      if (response.error)
        throw new Error('Failed to fetch platform account transactions')
      return response.data as PlatformTransactionsPage
    },
  }
}
