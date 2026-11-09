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
}

/**
 * The delays that apply to one shop: its own ceiling when eBio set one, the
 * platform's otherwise. The confirmed delay never exceeds the ceiling, so a
 * shop paid at once is paid at once whether or not anyone confirmed.
 */
export function effectiveDelays(platform: EscrowDelays, supplierHours: number | null | undefined): EscrowDelays {
  const heuresMaximum = supplierHours ?? platform.heuresMaximum
  return {
    heuresMaximum,
    heuresApresConfirmation: Math.min(platform.heuresApresConfirmation, heuresMaximum),
  }
}

/** When the shop's money for a delivered order becomes due. */
export function escrowReleaseAt(platform: EscrowDelays, facts: EscrowReleaseFacts, now = new Date()): Date {
  const delays = effectiveDelays(platform, facts.supplierHours)
  const deliveredAt = facts.deliveredAt?.getTime() ?? now.getTime()
  const hours = facts.bothConfirmed ? delays.heuresApresConfirmation : delays.heuresMaximum
  return new Date(deliveredAt + hours * HOUR_MS)
}
