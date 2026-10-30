import type { StatusTone } from '@/features/admin/common/components/status-badge'

/** Order statuses, in lifecycle order. */
export const ORDER_STATUS_OPTIONS = [
  'PENDING_PAYMENT',
  'PLACED',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'IN_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'DISPUTED',
] as const

/** A placed order waits on the shop, a dispute on the staff: both stand out from the flow. */
export const ORDER_STATUS_TONES: Record<string, StatusTone> = {
  PENDING_PAYMENT: 'idle',
  PLACED: 'action',
  ACCEPTED: 'progress',
  PREPARING: 'progress',
  READY: 'progress',
  IN_DELIVERY: 'progress',
  DELIVERED: 'done',
  CANCELLED: 'idle',
  DISPUTED: 'problem',
}

/** Known payment methods; anything else falls back to the raw value. */
export const PAYMENT_METHODS = ['CASH_ON_DELIVERY', 'FEDAPAY', 'WALLET']
