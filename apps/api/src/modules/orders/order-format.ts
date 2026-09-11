import type { Order } from './entities/order.entity'
import { thumbnailUrlFor } from '../../common/media-urls'
import { PaymentMethod } from './entities/order.entity'

export const INVOICE_TIME_ZONE = 'Africa/Porto-Novo'

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  [PaymentMethod.FEDAPAY]: 'FedaPay (paiement en ligne)',
  [PaymentMethod.WALLET]: 'Portefeuille eBio',
  [PaymentMethod.CASH_ON_DELIVERY]: 'Espèces à la livraison',
}

/** `1 200 FCFA` — fr-FR grouping with non-breaking spaces, no decimals. */
export function formatFcfa(amount: number): string {
  const grouped = Math.round(amount).toString().replace(/\B(?=(?:\d{3})+(?!\d))/g, '\u00A0')
  return `${grouped}\u00A0FCFA`
}

export function formatInvoiceDate(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: INVOICE_TIME_ZONE,
  }).format(date)
}

/** What the order mail templates consume. Prices are pre-formatted. */
export interface InvoiceItemData {
  name: string
  variant: string | null
  quantity: number
  unitPrice: string
  totalPrice: string
  thumbnailUrl: string | null
}

/** Item lines shared by the confirmation, the shop alert and the invoice. */
export function buildInvoiceItems(order: Order): InvoiceItemData[] {
  return order.items.getItems().map((item) => {
    const photo = item.product.photos[0] ?? null
    return {
      name: item.product.name,
      variant: item.variant?.label ?? null,
      quantity: item.quantity,
      unitPrice: formatFcfa(item.unitPrice),
      totalPrice: formatFcfa(item.totalPrice),
      thumbnailUrl: thumbnailUrlFor(photo) ?? photo,
    }
  })
}
