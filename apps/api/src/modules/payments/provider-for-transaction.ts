import { PaymentProvider } from './payment.entity'

/**
 * Where to verify a transaction, decided by the transaction itself.
 *
 * Switching from one provider to another does not happen all at once: apps
 * already installed carry the old one's widget and will open their payment
 * there, whatever the server has been configured to since. Verifying with the
 * current provider would mean looking for their transaction where it does not
 * exist — and never crediting someone who did pay.
 *
 * So we read the transaction rather than the setting:
 *
 * - if the server opened this one itself, it knows whose it is;
 * - otherwise an all-digit id is a FedaPay id ("510148"), whereas INTRAM
 *   returns ten alphanumeric characters ("ZnSXVuakcF").
 *
 * Shape is enough because the two do not resemble each other. An all-numeric
 * INTRAM id is possible in theory — ten digits drawn from sixty-two characters
 * — and that is exactly what the first case catches: those, the server opened
 * and recognises.
 */
export function providerForTransaction(
  presentedId: string,
  openedByServer: string | null,
): PaymentProvider {
  if (openedByServer !== null && openedByServer === presentedId) {
    return PaymentProvider.INTRAM
  }

  return /^\d+$/.test(presentedId.trim()) ? PaymentProvider.FEDAPAY : PaymentProvider.INTRAM
}
