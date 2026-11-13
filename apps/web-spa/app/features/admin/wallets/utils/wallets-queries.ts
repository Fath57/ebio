import type { WalletOwnerType } from '@/features/admin/withdrawals/utils/withdrawals-queries'
import {
  walletAdminControllerDebitWallet,
  walletAdminControllerGetWallet,
  walletAdminControllerListTopups,
  walletAdminControllerListWallets,
  walletAdminControllerWalletTransactions,
} from '@boilerstone/openapi-generator/client/sdk.gen'

interface Paged<T> {
  items: T[]
  total: number
  page: number
  limit: number
}

export interface AdminWalletListItem {
  id: string
  balance: number
  ownerType: WalletOwnerType
  ownerName: string
  supplierId: string | null
  courierId: string | null
  userId: string | null
  /** Family wallets only: the family wallet and its payer. */
  familyWalletId?: string | null
  familyPayerId?: string | null
  updatedAt: string
}

export interface AdminWalletsPage {
  items: AdminWalletListItem[]
  total: number
  page: number
  limit: number
  /** Over the whole filtered set, not the page. */
  totalOwed: number
  totalDebt: number
}

export interface AdminWalletFilters {
  q?: string
  ownerType?: string
  balance?: string
  sort?: string
  page: number
}

export const WALLETS_PAGE_SIZE = 20

export function fetchWalletsListQueryOptions(filters: AdminWalletFilters) {
  return {
    queryKey: ['admin', 'wallets', 'list', filters],
    queryFn: async () => {
      const response = await walletAdminControllerListWallets({
        query: {
          q: filters.q ?? '',
          ownerType: filters.ownerType ?? '',
          balance: filters.balance ?? '',
          sort: filters.sort ?? '',
          page: String(filters.page),
          limit: String(WALLETS_PAGE_SIZE),
        },
      })
      if (response.error)
        throw new Error('Failed to load wallets')
      return response.data as AdminWalletsPage
    },
  }
}

/** Staff debit; the API refuses a debit past the balance and explains why in French. */
export async function debitWallet(walletId: string, body: { amount: number, reason: string, notify: boolean }): Promise<{ balanceAfter: number }> {
  const response = await walletAdminControllerDebitWallet({ path: { id: walletId }, body })
  if (response.error) {
    const message = (response.error as { message?: unknown }).message
    throw new Error(typeof message === 'string' ? message : 'Le débit a échoué')
  }
  return response.data as { balanceAfter: number }
}

export function fetchAdminWalletQueryOptions(walletId: string) {
  return {
    queryKey: ['admin', 'wallets', 'detail', walletId],
    queryFn: async () => {
      const response = await walletAdminControllerGetWallet({ path: { id: walletId } })
      if (response.error)
        throw new Error('Failed to load wallet')
      return response.data as unknown as AdminWalletListItem
    },
  }
}

export interface AdminWalletTransaction {
  id: string
  type: string
  /** Signed: a credit is positive, a debit negative. */
  amount: number
  balanceAfter: number
  description: string
  orderId: string | null
  deliveryId: string | null
  createdAt: string
}

export function fetchAdminWalletTransactionsQueryOptions(walletId: string, page: number) {
  return {
    queryKey: ['admin', 'wallets', 'detail', walletId, 'transactions', page],
    queryFn: async () => {
      const response = await walletAdminControllerWalletTransactions({
        path: { id: walletId },
        query: { page: String(page), limit: '20' },
      })
      if (response.error)
        throw new Error('Failed to load wallet transactions')
      return response.data as unknown as Paged<AdminWalletTransaction>
    },
  }
}

export interface AdminTopup {
  id: string
  walletId: string
  amount: number
  status: 'PENDING' | 'COMPLETED' | 'FAILED'
  createdAt: string
  /** Who paid; for a shop or courier wallet, the account behind it. */
  userId: string
  userName: string
  userEmail: string | null
  fedapayTransactionId: string | null
}

export interface AdminTopupFilters {
  status?: string
  /** Payer's name or e-mail. */
  q?: string
  walletId?: string
  page: number
}

export function fetchAdminTopupsQueryOptions(filters: AdminTopupFilters) {
  return {
    queryKey: ['admin', 'wallet-topups', filters],
    queryFn: async () => {
      const response = await walletAdminControllerListTopups({
        query: {
          status: filters.status ?? '',
          q: filters.q ?? '',
          walletId: filters.walletId ?? '',
          page: String(filters.page),
          limit: '20',
        },
      })
      if (response.error)
        throw new Error('Failed to load topups')
      return response.data as unknown as Paged<AdminTopup> & { statusCounts: Record<string, number> }
    },
  }
}
