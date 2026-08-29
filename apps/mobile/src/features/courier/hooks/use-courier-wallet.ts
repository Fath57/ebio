import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../../utils/api-client'

const BASE = '/api/couriers/me/wallet'

export type CourierWalletTransactionType
  = | 'TOPUP'
    | 'ORDER_PAYMENT'
    | 'SALE_CREDIT'
    | 'COMMISSION_DEBIT'
    | 'WITHDRAWAL'
    | 'WITHDRAWAL_REFUND'
    | 'REFUND'
    | 'ADJUSTMENT'
    | 'PROMO_COMPENSATION'
    | 'DELIVERY_EARNING'
    | 'DELIVERY_COMMISSION'

export interface CourierWalletTransaction {
  id: string
  type: CourierWalletTransactionType
  /** Signed: credits are positive, debits negative. */
  amount: number
  balanceAfter: number
  description: string
  orderId: string | null
  deliveryId: string | null
  createdAt: string
}

export interface CourierWallet {
  id: string
  /** Can be negative: cash deliveries debit eBio's commission. */
  balance: number
  transactions: {
    items: CourierWalletTransaction[]
    total: number
    page: number
    limit: number
  }
}

export interface CourierPayoutNumber {
  id: string
  phoneNumber: string
  operator: string
  operatorLabel: string
  holderName: string
  status: 'PENDING' | 'VALIDATED' | 'REJECTED'
  rejectionReason: string | null
  createdAt: string
}

export interface CourierWithdrawal {
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

export interface CourierTopup {
  id: string
  amount: number
  status: 'PENDING' | 'COMPLETED' | 'FAILED'
  createdAt: string
}

/** Result of a write: `ok`, or a French message ready for `appAlert`. */
export type MutationResult = { ok: true } | { ok: false, message: string }

async function readError(res: Response): Promise<string> {
  const body = await res.json().catch(() => null) as { message?: string, aggregateErrors?: Array<{ message?: string }> } | null
  return body?.aggregateErrors?.[0]?.message ?? body?.message ?? 'Une erreur est survenue'
}

async function toResult(res: Response): Promise<MutationResult> {
  if (res.ok) {
    return { ok: true }
  }
  return { ok: false, message: await readError(res) }
}

/**
 * Courier wallet: balance and ledger, Mobile Money payout numbers,
 * withdrawal requests and FedaPay top-ups. Loads everything in parallel;
 * each mutation reloads the whole set on success.
 */
export function useCourierWallet() {
  const [wallet, setWallet] = useState<CourierWallet | null>(null)
  const [numbers, setNumbers] = useState<CourierPayoutNumber[]>([])
  const [withdrawals, setWithdrawals] = useState<CourierWithdrawal[]>([])
  const [topups, setTopups] = useState<CourierTopup[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const load = useCallback(async () => {
    try {
      const [walletRes, numbersRes, withdrawalsRes, topupsRes] = await Promise.all([
        apiFetch(`${BASE}?page=1&limit=20`),
        apiFetch(`${BASE}/payout-numbers`),
        apiFetch(`${BASE}/withdrawals`),
        apiFetch(`${BASE}/topups`),
      ])
      if (walletRes.ok) {
        setWallet(await walletRes.json() as CourierWallet)
      }
      if (numbersRes.ok) {
        const data = await numbersRes.json() as { items: CourierPayoutNumber[] }
        setNumbers(data.items)
      }
      if (withdrawalsRes.ok) {
        const data = await withdrawalsRes.json() as { items: CourierWithdrawal[] }
        setWithdrawals(data.items)
      }
      if (topupsRes.ok) {
        const data = await topupsRes.json() as { items: CourierTopup[] }
        setTopups(data.items)
      }
    }
    catch {
      // Network failure: pull-to-refresh retries.
    }
    finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const refresh = useCallback(() => {
    setIsRefreshing(true)
    return load()
  }, [load])

  const addPayoutNumber = useCallback(async (phoneNumber: string, holderName: string): Promise<MutationResult> => {
    const res = await apiFetch(`${BASE}/payout-numbers`, {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: phoneNumber.trim(), holderName: holderName.trim() }),
    })
    const result = await toResult(res)
    if (result.ok) {
      await load()
    }
    return result
  }, [load])

  const deletePayoutNumber = useCallback(async (id: string): Promise<MutationResult> => {
    const res = await apiFetch(`${BASE}/payout-numbers/${id}`, { method: 'DELETE' })
    const result = await toResult(res)
    if (result.ok) {
      await load()
    }
    return result
  }, [load])

  const requestWithdrawal = useCallback(async (payoutNumberId: string, amount: number): Promise<MutationResult> => {
    const res = await apiFetch(`${BASE}/withdrawals`, {
      method: 'POST',
      body: JSON.stringify({ payoutNumberId, amount }),
    })
    const result = await toResult(res)
    if (result.ok) {
      await load()
    }
    return result
  }, [load])

  const cancelWithdrawal = useCallback(async (id: string): Promise<MutationResult> => {
    const res = await apiFetch(`${BASE}/withdrawals/${id}/cancel`, { method: 'PATCH' })
    const result = await toResult(res)
    if (result.ok) {
      await load()
    }
    return result
  }, [load])

  /** Opens a top-up; the caller then renders the FedaPay checkout page. */
  const startTopup = useCallback(async (amount: number): Promise<{ ok: true, topupId: string, amount: number } | { ok: false, message: string }> => {
    const res = await apiFetch(`${BASE}/topup`, {
      method: 'POST',
      body: JSON.stringify({ amount }),
    })
    if (!res.ok) {
      return { ok: false, message: await readError(res) }
    }
    const data = await res.json() as { topupId: string, amount: number }
    return { ok: true, topupId: data.topupId, amount: data.amount }
  }, [])

  /** Server-side verification with FedaPay after the widget reports success. */
  const verifyTopup = useCallback(async (topupId: string, fedapayTransactionId: string): Promise<MutationResult> => {
    const res = await apiFetch(`${BASE}/topups/${topupId}/verify`, {
      method: 'POST',
      body: JSON.stringify({ fedapayTransactionId }),
    })
    const result = await toResult(res)
    if (result.ok) {
      await load()
    }
    return result
  }, [load])

  return {
    wallet,
    numbers,
    withdrawals,
    topups,
    isLoading,
    isRefreshing,
    refresh,
    reload: load,
    addPayoutNumber,
    deletePayoutNumber,
    requestWithdrawal,
    cancelWithdrawal,
    startTopup,
    verifyTopup,
  }
}
