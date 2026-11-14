import { describe, expect, it } from 'vitest'
import { effectiveDelays, escrowReleaseAt } from './escrow-release-policy'

const platform = { heuresApresConfirmation: 0, heuresMaximum: 24 }
const deliveredAt = new Date('2026-11-09T10:00:00Z')

describe('délai de versement des ventes en ligne', () => {
  it('verse 24 h après la livraison sans double confirmation', () => {
    const at = escrowReleaseAt(platform, { deliveredAt, bothConfirmed: false, supplierHours: null })
    expect(at.toISOString()).toBe('2026-11-10T10:00:00.000Z')
  })

  it('verse dès la livraison quand les deux ont confirmé', () => {
    const at = escrowReleaseAt(platform, { deliveredAt, bothConfirmed: true, supplierHours: null })
    expect(at.toISOString()).toBe(deliveredAt.toISOString())
  })

  it('applique le délai de la boutique à la place de celui de la plateforme', () => {
    expect(escrowReleaseAt(platform, { deliveredAt, bothConfirmed: false, supplierHours: 0 }).toISOString())
      .toBe(deliveredAt.toISOString())
    expect(escrowReleaseAt(platform, { deliveredAt, bothConfirmed: false, supplierHours: 72 }).toISOString())
      .toBe('2026-11-12T10:00:00.000Z')
  })

  it('ne laisse jamais le délai après confirmation dépasser celui de la boutique', () => {
    expect(effectiveDelays({ heuresApresConfirmation: 48, heuresMaximum: 168 }, 12))
      .toEqual({ heuresApresConfirmation: 12, heuresMaximum: 12 })
  })

  it('verse une commande terroir dès la collecte, quel que soit le délai de la boutique', () => {
    expect(escrowReleaseAt(platform, { deliveredAt, bothConfirmed: false, supplierHours: 72, exportOrder: true }).toISOString())
      .toBe(deliveredAt.toISOString())
    expect(effectiveDelays(platform, null, true)).toEqual({ heuresApresConfirmation: 0, heuresMaximum: 0 })
  })
})
