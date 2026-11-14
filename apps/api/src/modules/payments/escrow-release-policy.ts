const HOUR_MS = 60 * 60 * 1000

export interface EscrowDelays {
  /** Hours after delivery once buyer and shop both confirmed it. */
  heuresApresConfirmation: number
  /** Hours after delivery at the latest, confirmed or not. */
  heuresMaximum: number
}

export interface EscrowReleaseFacts {
  deliveredAt: Date | null
  bothConfirmed: boolean
  /** The shop's own ceiling in hours, null to follow the platform. */
  supplierHours: number | null | undefined
  /**
   * A terroir order (pickup mode EXPORT, 011): the shop is paid as soon as
   * eBio collected its products, whatever its delay.
   */
  exportOrder?: boolean
}

const PAID_AT_ONCE: EscrowDelays = { heuresApresConfirmation: 0, heuresMaximum: 0 }

/**
 * The delays that apply to one shop: its own ceiling when eBio set one, the
 * platform's otherwise. The confirmed delay never exceeds the ceiling, so a
 * shop paid at once is paid at once whether or not anyone confirmed.
 */
export function effectiveDelays(platform: EscrowDelays, supplierHours: number | null | undefined, exportOrder = false): EscrowDelays {
  // The collection is the shop's hand-over: nothing left to confirm.
  if (exportOrder) {
    return PAID_AT_ONCE
  }
  const heuresMaximum = supplierHours ?? platform.heuresMaximum
  return {
    heuresMaximum,
    heuresApresConfirmation: Math.min(platform.heuresApresConfirmation, heuresMaximum),
  }
}

/** When the shop's money for a delivered order becomes due. */
export function escrowReleaseAt(platform: EscrowDelays, facts: EscrowReleaseFacts, now = new Date()): Date {
  const delays = effectiveDelays(platform, facts.supplierHours, facts.exportOrder)
  const deliveredAt = facts.deliveredAt?.getTime() ?? now.getTime()
  const hours = facts.bothConfirmed ? delays.heuresApresConfirmation : delays.heuresMaximum
  return new Date(deliveredAt + hours * HOUR_MS)
}
