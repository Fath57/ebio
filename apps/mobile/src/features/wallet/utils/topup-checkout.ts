/**
 * FedaPay Checkout.js top-up page, shared by every wallet that can be
 * recharged (buyer wallet, courier wallet). The HTML is rendered in a
 * `WebView`; the widget reports back through `window.ReactNativeWebView.postMessage`
 * with a JSON-encoded `TopupCheckoutMessage`. The server always re-checks the
 * transaction with FedaPay before crediting — the widget's word alone is
 * worthless.
 */

export const TOPUP_PRESETS = [1000, 2000, 5000, 10000]

/** Payload posted by the checkout page to the native side. */
export type TopupCheckoutMessage
  = | { type: 'completed', transactionId: string }
    | { type: 'failed', reason?: string }
    | { type: 'closed' }

/** Parses a `WebView` `onMessage` payload; `null` when it is not ours. */
export function parseTopupCheckoutMessage(raw: string): TopupCheckoutMessage | null {
  try {
    const data = JSON.parse(raw) as { type?: unknown, transactionId?: unknown, reason?: unknown }
    if (data.type === 'completed' && typeof data.transactionId === 'string') {
      return { type: 'completed', transactionId: data.transactionId }
    }
    if (data.type === 'failed') {
      return { type: 'failed', reason: typeof data.reason === 'string' ? data.reason : undefined }
    }
    if (data.type === 'closed') {
      return { type: 'closed' }
    }
    return null
  }
  catch {
    return null
  }
}

export function buildTopupCheckoutHtml(
  publicKey: string,
  amount: number,
  topupId: string,
  customerName: string,
  customerEmail: string | null,
): string {
  const nameParts = customerName.trim().split(/\s+/)
  const firstname = nameParts[0] ?? 'Client'
  const lastname = nameParts.slice(1).join(' ') || firstname
  const customerBlock = [
    `firstname: '${firstname.replace(/'/g, '\\\'')}'`,
    `lastname: '${lastname.replace(/'/g, '\\\'')}'`,
    customerEmail ? `email: '${customerEmail.replace(/'/g, '\\\'')}'` : null,
  ].filter(Boolean).join(',\n          ')

  return `
<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { margin: 0; padding: 20px; background: #F7F6F2; font-family: -apple-system, sans-serif;
    display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .loading { color: #5A5852; font-size: 16px; text-align: center; }
</style>
</head><body>
<p class="loading">Chargement du paiement...</p>
<script src="https://cdn.fedapay.com/checkout.js?v=1.1.7"></script>
<script>
  FedaPay.init({
    public_key: '${publicKey}',
    transaction: {
      amount: ${amount},
      description: 'Recharge du portefeuille eBio',
      custom_metadata: { topup_id: '${topupId}' }
    },
    customer: {
      ${customerBlock}
    },
    currency: { iso: 'XOF' },
    onComplete: function(resp) {
      if (resp.reason === 'CHECKOUT_COMPLETED' || (resp.transaction && resp.transaction.status === 'approved')) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'completed',
          transactionId: String(resp.transaction.id)
        }));
      } else {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'failed',
          reason: resp.reason || 'Paiement échoué'
        }));
      }
    },
    onClose: function() {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'closed' }));
    }
  }).open();
</script>
</body></html>`
}
