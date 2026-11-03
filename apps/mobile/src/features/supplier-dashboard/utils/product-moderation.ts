import { colors } from '../../../theme/theme'

/**
 * eBio's verdict on a product, separate from the shop's own status
 * (ACTIVE / OUT_OF_STOCK / HIDDEN).
 */
export type ModerationStatus = 'APPROVED' | 'PENDING' | 'REJECTED' | 'WITHDRAWN'

const MODERATION_STATUSES: readonly ModerationStatus[] = ['APPROVED', 'PENDING', 'REJECTED', 'WITHDRAWN']

/** Reads the API value; a missing or unknown one (older API) counts as approved. */
export function parseModerationStatus(value: unknown): ModerationStatus {
  return MODERATION_STATUSES.includes(value as ModerationStatus)
    ? value as ModerationStatus
    : 'APPROVED'
}

/** Reads the API reason; blank strings count as no reason. */
export function parseModerationReason(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

interface ModerationPill {
  label: string
  bgColor: string
  textColor: string
}

/**
 * Pill shown next to a product that is not approved, null otherwise.
 * A refusal waits for the shop to fix the product, hence the error colour
 * (same as a refused banner request); a withdrawal is out of its hands.
 */
export function moderationPill(status: ModerationStatus): ModerationPill | null {
  switch (status) {
    case 'PENDING':
      return { label: 'En attente de validation', bgColor: colors.earth[50], textColor: colors.earth[600] }
    case 'REJECTED':
      return { label: 'Refusé', bgColor: colors.coral[50], textColor: colors.coral[600] }
    case 'WITHDRAWN':
      return { label: 'Retiré par eBio', bgColor: colors.neutral[100], textColor: colors.neutral[600] }
    case 'APPROVED':
      return null
  }
}
