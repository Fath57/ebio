import {
  supplierWalletControllerAddNumber,
  supplierWalletControllerCancelWithdrawal,
  supplierWalletControllerGetWallet,
  supplierWalletControllerListNumbers,
  supplierWalletControllerListWithdrawals,
  supplierWalletControllerRemoveNumber,
  supplierWalletControllerRequestWithdrawal,
} from '@boilerstone/openapi-generator/client/sdk.gen'

export interface WalletMovement {
  id: string
  type: string
  amount: number
  balanceAfter: number
  description: string
  orderId: string | null
  createdAt: string
}

export interface SupplierWallet {
  id: string
  balance: number
  transactions: { items: WalletMovement[], total: number, page: number, limit: number }
}

export interface PayoutNumberItem {
  id: string
  phoneNumber: string
  operator: string
  operatorLabel: string
  holderName: string
  status: 'PENDING' | 'VALIDATED' | 'REJECTED'
  rejectionReason: string | null
  createdAt: string
}

export interface WithdrawalItem {
  id: string
  amount: number
  status: 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED' | 'REJECTED' | 'CANCELLED'
  phoneNumber: string
  operatorLabel: string
  rejectionReason: string | null
  providerReference: string | null
  createdAt: string
  processedAt: string | null
}

export function fetchSupplierWalletQueryOptions(page: number = 1) {
  return {
    queryKey: ['supplier', 'wallet', page],
    queryFn: async () => {
      const response = await supplierWalletControllerGetWallet({ query: { page: String(page), limit: '20' } })
      if (response.error)
        throw new Error('Failed to load wallet')
      return response.data as unknown as SupplierWallet
    },
  }
}

export function fetchPayoutNumbersQueryOptions() {
  return {
    queryKey: ['supplier', 'payout-numbers'],
    queryFn: async () => {
      const response = await supplierWalletControllerListNumbers()
      if (response.error)
        throw new Error('Failed to load payout numbers')
      return (response.data as unknown as { items: PayoutNumberItem[] }).items
    },
  }
}

export function fetchWithdrawalsQueryOptions() {
  return {
    queryKey: ['supplier', 'withdrawals'],
    queryFn: async () => {
      const response = await supplierWalletControllerListWithdrawals({ query: { page: '1', limit: '20' } })
      if (response.error)
        throw new Error('Failed to load withdrawals')
      return (response.data as unknown as { items: WithdrawalItem[] }).items
    },
  }
}

async function throwWithDetail(error: unknown, fallback: string): Promise<never> {
  const detail = (error as { message?: string })?.message
  throw new Error(detail ?? fallback)
}

export async function addPayoutNumber(phoneNumber: string, holderName: string): Promise<void> {
  const response = await supplierWalletControllerAddNumber({ body: { phoneNumber, holderName } })
  if (response.error)
    await throwWithDetail(response.error, 'Failed to add payout number')
}

export async function removePayoutNumber(id: string): Promise<void> {
  const response = await supplierWalletControllerRemoveNumber({ path: { id } })
  if (response.error)
    await throwWithDetail(response.error, 'Failed to remove payout number')
}

export async function requestWithdrawal(payoutNumberId: string, amount: number): Promise<void> {
  const response = await supplierWalletControllerRequestWithdrawal({ body: { payoutNumberId, amount } })
  if (response.error)
    await throwWithDetail(response.error, 'Failed to request withdrawal')
}

export async function cancelWithdrawal(id: string): Promise<void> {
  const response = await supplierWalletControllerCancelWithdrawal({ path: { id } })
  if (response.error)
    await throwWithDetail(response.error, 'Failed to cancel withdrawal')
}
