import AsyncStorage from '@react-native-async-storage/async-storage'

/** Listed in `ACCOUNT_KEYS`: an address never outlives the account that typed it. */
export const CHECKOUT_DRAFT_KEY = 'ebio_checkout_draft'

/**
 * What the buyer typed on the checkout screen.
 *
 * The screen held it in its own state only, so going back to the cart — or
 * leaving a payment that failed or is still pending, which also closes the
 * screen — threw the address, the map point and the slot away, and the buyer
 * had to type them all again.
 */
export interface CheckoutDraft {
  address: string
  position: { latitude: number, longitude: number } | null
  placeLabel: string | null
  slot: string
  paymentChoice: 'FEDAPAY' | 'WALLET' | 'CASH'
  promoInput: string
}

function isPosition(value: unknown): value is { latitude: number, longitude: number } {
  const point = value as { latitude?: unknown, longitude?: unknown } | null
  return typeof point?.latitude === 'number' && typeof point.longitude === 'number'
}

export async function loadCheckoutDraft(): Promise<Partial<CheckoutDraft>> {
  try {
    const raw = await AsyncStorage.getItem(CHECKOUT_DRAFT_KEY)
    if (!raw) {
      return {}
    }
    const data = JSON.parse(raw) as Record<string, unknown>
    // Read field by field: a draft written by an older build must not crash the checkout.
    return {
      ...(typeof data.address === 'string' ? { address: data.address } : {}),
      ...(isPosition(data.position) ? { position: data.position } : {}),
      ...(typeof data.placeLabel === 'string' ? { placeLabel: data.placeLabel } : {}),
      ...(typeof data.slot === 'string' ? { slot: data.slot } : {}),
      ...(data.paymentChoice === 'FEDAPAY' || data.paymentChoice === 'WALLET' || data.paymentChoice === 'CASH'
        ? { paymentChoice: data.paymentChoice }
        : {}),
      ...(typeof data.promoInput === 'string' ? { promoInput: data.promoInput } : {}),
    }
  }
  catch {
    return {}
  }
}

export async function saveCheckoutDraft(draft: CheckoutDraft): Promise<void> {
  try {
    await AsyncStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(draft))
  }
  catch {
    // The checkout works without it; the buyer only loses the convenience.
  }
}

/**
 * After an order went through: the place stays for next time, the rest was
 * about this order only — a slot or a promo code from last week has no reason
 * to come back.
 */
export async function keepCheckoutAddressOnly(): Promise<void> {
  const draft = await loadCheckoutDraft()
  await saveCheckoutDraft({
    address: draft.address ?? '',
    position: draft.position ?? null,
    placeLabel: draft.placeLabel ?? null,
    slot: '',
    paymentChoice: 'FEDAPAY',
    promoInput: '',
  })
}
