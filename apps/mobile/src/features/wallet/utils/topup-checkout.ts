/**
 * Wallet top-up, shared by every wallet that can be recharged (buyer wallet,
 * courier wallet, shop wallet).
 *
 * The widget itself now lives in `checkout-widget.ts`, which knows both
 * providers; this module keeps the top-up vocabulary and the presets so the
 * three screens using it did not have to change.
 */

import type { CheckoutMessage } from './checkout-widget'
import { buildCheckoutHtml, parseCheckoutMessage } from './checkout-widget'

export const TOPUP_PRESETS = [1000, 2000, 5000, 10000]

/** Payload posted by the checkout page to the native side. */
export type TopupCheckoutMessage = CheckoutMessage

/** Parses a `WebView` `onMessage` payload; `null` when it is not ours. */
export const parseTopupCheckoutMessage = parseCheckoutMessage

export function buildTopupCheckoutHtml(
  publicKey: string,
  amount: number,
  topupId: string,
  customerName: string,
  customerEmail: string | null,
): string {
  return buildCheckoutHtml({
    publicKey,
    amount,
    description: 'Recharge du portefeuille eBio',
    customer: { name: customerName, email: customerEmail, phone: null },
    metadata: { topup_id: topupId },
  })
}
