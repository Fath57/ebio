/**
 * The payment widget hosted in a `WebView`, whichever provider is behind it.
 *
 * Both FedaPay and INTRAM work the same way: a page loads their script, the
 * widget takes over, and the result comes back through
 * `window.ReactNativeWebView.postMessage`. What the widget says is never
 * trusted on its own — the server re-reads the transaction from the provider
 * before a franc moves.
 *
 * Which one is live is a build-time choice, so a variant can be shipped on
 * either without a code change.
 */

export type PaymentProvider = 'fedapay' | 'intram'

export const ACTIVE_PAYMENT_PROVIDER: PaymentProvider
  = (process.env.EXPO_PUBLIC_PAYMENT_PROVIDER as PaymentProvider | undefined) ?? 'intram'

/** Public key of the live provider — the only key an app may ever hold. */
export function paymentPublicKey(): string | null {
  const key = ACTIVE_PAYMENT_PROVIDER === 'intram'
    ? process.env.EXPO_PUBLIC_INTRAM_PUBLIC_KEY
    : process.env.EXPO_PUBLIC_FEDAPAY_PUBLIC_KEY

  return key ?? null
}

/** INTRAM's widget is told which environment to open against. */
const INTRAM_SANDBOX = process.env.EXPO_PUBLIC_INTRAM_SANDBOX !== 'false'

/** Payload posted by the checkout page to the native side. */
export type CheckoutMessage
  = | { type: 'completed', transactionId: string }
    | { type: 'failed', reason?: string }
    | { type: 'closed' }
    /** Raw widget response, logged while the integration is being proven. */
    | { type: 'debug', payload: string }

export function parseCheckoutMessage(raw: string): CheckoutMessage | null {
  try {
    const data = JSON.parse(raw) as { type?: unknown, transactionId?: unknown, reason?: unknown, payload?: unknown }
    if (data.type === 'completed' && typeof data.transactionId === 'string') {
      return { type: 'completed', transactionId: data.transactionId }
    }
    if (data.type === 'failed') {
      return { type: 'failed', reason: typeof data.reason === 'string' ? data.reason : undefined }
    }
    if (data.type === 'closed') {
      return { type: 'closed' }
    }
    if (data.type === 'debug' && typeof data.payload === 'string') {
      return { type: 'debug', payload: data.payload }
    }
    return null
  }
  catch {
    return null
  }
}

/** Single-quoted JS string literal, safe for interpolation into the page. */
function js(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, '\\\'').replace(/\n/g, '\\n')}'`
}

const PAGE_HEAD = `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { margin: 0; padding: 20px; background: #F7F6F2; font-family: -apple-system, sans-serif;
    display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .loading { color: #5A5852; font-size: 16px; text-align: center; }
</style>
</head><body>
<p class="loading">Chargement du paiement…</p>`

export interface CheckoutCustomer {
  name: string
  email: string | null
  phone: string | null
}

export interface CheckoutWidgetParams {
  publicKey: string
  amount: number
  description: string
  customer: CheckoutCustomer
  /** Our own id, carried through so the server can reconcile. */
  metadata: Record<string, string>
}

function splitName(name: string): { firstname: string, lastname: string } {
  const parts = name.trim().split(/\s+/)
  const firstname = parts[0] ?? 'Client'
  return { firstname, lastname: parts.slice(1).join(' ') || firstname }
}

function fedapayPage(params: CheckoutWidgetParams): string {
  const { firstname, lastname } = splitName(params.customer.name)
  const customerBlock = [
    `firstname: ${js(firstname)}`,
    `lastname: ${js(lastname)}`,
    params.customer.email ? `email: ${js(params.customer.email)}` : null,
    params.customer.phone ? `phone_number: { number: ${js(params.customer.phone)}, country: 'BJ' }` : null,
  ].filter(Boolean).join(',\n      ')

  return `${PAGE_HEAD}
<script src="https://cdn.fedapay.com/checkout.js?v=1.1.7"></script>
<script>
  FedaPay.init({
    public_key: ${js(params.publicKey)},
    transaction: {
      amount: ${params.amount},
      description: ${js(params.description)},
      custom_metadata: ${JSON.stringify(params.metadata)}
    },
    customer: {
      ${customerBlock}
    },
    currency: { iso: 'XOF' },
    onComplete: function (resp) {
      if (resp.reason === 'CHECKOUT_COMPLETED' || (resp.transaction && resp.transaction.status === 'approved')) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'completed', transactionId: String(resp.transaction.id) }));
      } else {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'failed', reason: resp.reason || 'Paiement échoué' }));
      }
    },
    onClose: function () {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'closed' }));
    }
  }).open();
</script>
</body></html>`
}

/**
 * INTRAM's widget, whose result shape their documentation does not describe.
 *
 * Their Flutter SDK answers `{success: true, transaction: "PJ2flG2YVc"}`, a
 * ten-character reference — the very format the Merchant API reads back. The
 * page therefore accepts any of the plausible spellings rather than betting
 * on one, and forwards the raw answer as a `debug` message so the real shape
 * is visible on the first live run instead of being guessed at.
 *
 * Whatever comes back is only a reference: the server proves the payment.
 */
function intramPage(params: CheckoutWidgetParams): string {
  const { firstname, lastname } = splitName(params.customer.name)

  return `${PAGE_HEAD}
<script src="https://cdn.intram.org/sdk-javascript.js"></script>
<script>
  function post(message) { window.ReactNativeWebView.postMessage(JSON.stringify(message)); }

  function referenceOf(resp) {
    if (!resp) { return null; }
    if (typeof resp === 'string') { return resp; }
    return resp.transaction || resp.transaction_id || resp.transaction_reference
      || resp.reference || (resp.data && (resp.data.transaction || resp.data.reference)) || null;
  }

  function settle(resp) {
    post({ type: 'debug', payload: JSON.stringify(resp) });
    var reference = referenceOf(resp);
    var failed = resp && (resp.success === false || resp.status === 'CANCELED' || resp.status === 'ERROR');
    if (reference && !failed) {
      post({ type: 'completed', transactionId: String(reference) });
    } else if (failed || reference === null) {
      post({ type: 'failed', reason: (resp && (resp.message || resp.status)) || 'Paiement non abouti' });
    }
  }

  try {
    var opened = intramOpenWidget.init({
      public_key: ${js(params.publicKey)},
      amount: ${params.amount},
      currency: 'xof',
      sandbox: ${INTRAM_SANDBOX},
      callback_url: ${js(params.metadata.callbackUrl ?? 'https://e-bio.org/paiement/retour')},
      company: {
        name: 'eBio',
        color: '#2E7D46',
        logo_url: 'https://e-bio.org/logo.png'
      },
      customer: {
        firstname: ${js(firstname)},
        lastname: ${js(lastname)},
        ${params.customer.email ? `email: ${js(params.customer.email)},` : ''}
        ${params.customer.phone ? `phone: ${js(params.customer.phone)},` : ''}
      },
      custom_datas: ${JSON.stringify(params.metadata)}
    });

    if (opened && typeof opened.then === 'function') {
      opened.then(settle).catch(function (error) {
        post({ type: 'failed', reason: String(error && error.message ? error.message : error) });
      });
    }
  }
  catch (error) {
    post({ type: 'failed', reason: 'Widget INTRAM indisponible : ' + String(error && error.message ? error.message : error) });
  }
</script>
</body></html>`
}

/** The checkout page for whichever provider is live in this build. */
export function buildCheckoutHtml(params: CheckoutWidgetParams): string {
  return ACTIVE_PAYMENT_PROVIDER === 'intram' ? intramPage(params) : fedapayPage(params)
}
