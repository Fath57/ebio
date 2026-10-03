import { appAlert } from '../../common/components/app-alert'

/** Where a payment stands, as the server's verify endpoint tells it. */
export type SettlementStatus = 'settled' | 'pending' | 'failed'

interface AwaitSettlementOptions {
  intervalMs?: number
  timeoutMs?: number
}

const DEFAULT_INTERVAL_MS = 3_000
const DEFAULT_TIMEOUT_MS = 30_000

/**
 * Reads a verify answer: 200 means the money is there, a 400 carries
 * `payment_failed` or `payment_pending`. Anything unreadable is treated as
 * still pending — the server's reconciliation settles it later.
 */
export async function readVerifyOutcome(res: Response): Promise<SettlementStatus> {
  if (res.ok) {
    return 'settled'
  }
  const body = await res.json().catch(() => null) as { code?: string } | null
  return body?.code === 'payment_failed' ? 'failed' : 'pending'
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * Asks again for a while before concluding.
 *
 * INTRAM brings the payer back to the same page whether it worked or not,
 * and the operator's verdict often lands a few seconds after that return: a
 * single check right away read « pending » and stopped there. A network
 * hiccup counts as pending, never as a verdict.
 */
export async function awaitSettlement(
  check: () => Promise<SettlementStatus>,
  { intervalMs = DEFAULT_INTERVAL_MS, timeoutMs = DEFAULT_TIMEOUT_MS }: AwaitSettlementOptions = {},
): Promise<SettlementStatus> {
  const deadline = Date.now() + timeoutMs
  while (true) {
    try {
      const status = await check()
      if (status !== 'pending') {
        return status
      }
    }
    catch {
      // Offline for a moment: the next round asks again.
    }
    if (Date.now() + intervalMs > deadline) {
      return 'pending'
    }
    await wait(intervalMs)
  }
}

/**
 * Tells the payer how a wallet topup ended. A still-pending one is only
 * announced after waiting (`afterWaiting`): on a plain close it says nothing,
 * the list shows « En attente » and the server settles it.
 */
export function announceTopupOutcome(status: SettlementStatus, afterWaiting: boolean): void {
  if (status === 'settled') {
    appAlert('Recharge confirmée', 'Votre portefeuille a été crédité.')
  }
  else if (status === 'failed') {
    appAlert('Paiement échoué', 'Le paiement n\'a pas abouti. Aucun montant n\'a été débité.')
  }
  else if (afterWaiting) {
    appAlert(
      'Paiement en cours de confirmation',
      'Votre portefeuille sera crédité automatiquement dès qu\'Intram confirme le paiement.',
    )
  }
}
