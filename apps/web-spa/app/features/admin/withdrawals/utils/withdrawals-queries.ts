import {
  walletAdminControllerActOnNumber,
  walletAdminControllerActOnWithdrawal,
  walletAdminControllerDebitWallet,
  walletAdminControllerListNumbers,
  walletAdminControllerListTopups,
  walletAdminControllerListWallets,
  walletAdminControllerListWithdrawals,
  walletAdminControllerWalletsOverview,
} from '@boilerstone/openapi-generator/client/sdk.gen'

export type WalletOwnerType = 'SUPPLIER' | 'COURIER' | 'USER'

/** Fields shared by payout numbers and withdrawals: who the money goes to. */
export interface PayoutOwner {
  ownerType: Exclude<WalletOwnerType, 'USER'>
  ownerName: string
  /** Null for courier rows. */
  supplierId: string | null
  /** Null for supplier rows. */
  courierId: string | null
  /** @deprecated Kept for older rows; prefer `ownerName`. Null for couriers. */
  shopName: string | null
}

export interface AdminPayoutNumber extends PayoutOwner {
  id: string
  phoneNumber: string
  operator: string
  operatorLabel: string
  holderName: string
  status: 'PENDING' | 'VALIDATED' | 'REJECTED'
  rejectionReason: string | null
  createdAt: string
}

export interface AdminWithdrawal extends PayoutOwner {
  id: string
  amount: number
  status: 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED' | 'REJECTED' | 'CANCELLED'
  phoneNumber: string
  operatorLabel: string
  holderName: string
  rejectionReason: string | null
  providerReference: string | null
  createdAt: string
  processedAt: string | null
}

export interface AdminWalletRow {
  id: string
  balance: number
  ownerType: WalletOwnerType
  ownerName: string
  supplierId: string | null
  courierId: string | null
  updatedAt: string
}

interface Paged<T> {
  items: T[]
  total: number
  page: number
  limit: number
}

export function fetchPayoutNumbersQueryOptions(status: string | undefined, page: number) {
  return {
    queryKey: ['admin', 'payout-numbers', status, page],
    queryFn: async () => {
      const response = await walletAdminControllerListNumbers({
        query: { status: status ?? '', page: String(page), limit: '20' },
      })
      if (response.error)
        throw new Error('Failed to load payout numbers')
      return response.data as unknown as Paged<AdminPayoutNumber>
    },
  }
}

export function fetchAdminWithdrawalsQueryOptions(status: string | undefined, page: number) {
  return {
    queryKey: ['admin', 'withdrawals', status, page],
    queryFn: async () => {
      const response = await walletAdminControllerListWithdrawals({
        query: { status: status ?? '', page: String(page), limit: '20' },
      })
      if (response.error)
        throw new Error('Failed to load withdrawals')
      return response.data as unknown as Paged<AdminWithdrawal>
    },
  }
}

export function fetchWalletsOverviewQueryOptions() {
  return {
    queryKey: ['admin', 'wallets'],
    queryFn: async () => {
      const response = await walletAdminControllerWalletsOverview()
      if (response.error)
        throw new Error('Failed to load wallets overview')
      return response.data as unknown as {
        wallets: AdminWalletRow[]
        totalOwed: number
        totalDebt: number
      }
    },
  }
}

export interface AdminTopup {
  id: string
  amount: number
  status: 'PENDING' | 'COMPLETED' | 'FAILED'
  createdAt: string
  userName: string
  userEmail: string | null
  fedapayTransactionId: string | null
}

export function fetchAdminTopupsQueryOptions(status: string | undefined, page: number) {
  return {
    queryKey: ['admin', 'wallet-topups', status, page],
    queryFn: async () => {
      const response = await walletAdminControllerListTopups({
        query: { status: status ?? '', page: String(page), limit: '20' },
      })
      if (response.error)
        throw new Error('Failed to load topups')
      return response.data as unknown as Paged<AdminTopup>
    },
  }
}

export async function actOnPayoutNumber(id: string, action: 'validate' | 'reject', rejectionReason?: string): Promise<void> {
  const response = await walletAdminControllerActOnNumber({
    path: { id },
    body: { action, rejectionReason },
  })
  if (response.error)
    throw new Error('Failed to update payout number')
}

export async function actOnWithdrawal(id: string, action: 'approve' | 'reject', rejectionReason?: string): Promise<void> {
  const response = await walletAdminControllerActOnWithdrawal({
    path: { id },
    body: { action, rejectionReason },
  })
  if (response.error) {
    const detail = (response.error as { message?: string })?.message
    throw new Error(detail ?? 'Failed to update withdrawal')
  }
}

export interface AdminWalletListItem {
  id: string
  balance: number
  ownerType: WalletOwnerType
  ownerName: string
  supplierId: string | null
  courierId: string | null
  userId: string | null
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
