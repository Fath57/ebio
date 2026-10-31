import type { StatusTone } from '@/features/admin/common/components/status-badge'

/** Payment statuses as the staff reads them: waiting, held, settled, given back, failed. */
export const PAYMENT_STATUS_TONES: Record<string, StatusTone> = {
  PENDING: 'action',
  CAPTURED: 'progress',
  ESCROW: 'progress',
  RELEASED: 'done',
  REFUNDED: 'idle',
  FAILED: 'problem',
}

/** Provider journal outcomes. */
export const JOURNAL_TONES: Record<string, StatusTone> = {
  PENDING: 'action',
  COMPLETED: 'done',
  FAILED: 'problem',
  ABANDONED: 'idle',
}
