import {
  walletAdminControllerActOnNumber,
  walletAdminControllerActOnWithdrawal,
  walletAdminControllerListNumbers,
  walletAdminControllerListTopups,
  walletAdminControllerListWithdrawals,
  walletAdminControllerWalletsOverview,
} from '@boilerstone/openapi-generator/client/sdk.gen'

export interface AdminPayoutNumber {
  id: string
  phoneNumber: string
  operator: string
  operatorLabel: string
  holderName: string
  status: 'PENDING' | 'VALIDATED' | 'REJECTED'
  rejectionReason: string | null
  createdAt: string
  supplierId: string
  shopName: string
}

export interface AdminWithdrawal {
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
  supplierId: string
  shopName: string
}

export interface AdminWalletRow {
  id: string
  balance: number
  ownerType: 'SUPPLIER' | 'USER'
  ownerName: string
  supplierId: string | null
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
