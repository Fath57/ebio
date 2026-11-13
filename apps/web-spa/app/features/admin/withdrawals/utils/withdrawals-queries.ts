import {
  walletAdminControllerActOnNumber,
  walletAdminControllerActOnWithdrawal,
  walletAdminControllerListNumbers,
  walletAdminControllerListWithdrawals,
} from '@boilerstone/openapi-generator/client/sdk.gen'

export type WalletOwnerType = 'SUPPLIER' | 'COURIER' | 'USER' | 'FAMILY'

/** Fields shared by payout numbers and withdrawals: who the money goes to. */
export interface PayoutOwner {
  ownerType: Exclude<WalletOwnerType, 'USER' | 'FAMILY'>
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
  /** The provider's reason for a failed payout; staff only. */
  failureReason: string | null
  providerReference: string | null
  createdAt: string
  processedAt: string | null
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
