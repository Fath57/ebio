import type { EntityManager } from '@mikro-orm/postgresql'
import type { FamilyWalletMember } from './entities/family-wallet-member.entity'
import { thumbnailUrlFor } from '../../common/media-urls'
import { Order } from '../orders/entities/order.entity'
import { WalletTransaction, WalletTransactionType } from '../wallet/entities/wallet-transaction.entity'

/**
 * What a purchase line of the family wallet says about the order behind it:
 * its number, the shop, the products. Never the delivery address nor any
 * message (FR-027): those are the member's, not the payer's.
 */
export interface FamilyOrderSummary {
  id: string
  orderNumber: string
  shopName: string
  lines: Array<{ name: string, quantity: number, imageUrl: string | null }>
}

/** One line of the family wallet's ledger, with its member and order when it has them. */
export interface FamilyHistoryEntry {
  transaction: WalletTransaction
  member: FamilyWalletMember | null
  order: FamilyOrderSummary | null
}

export interface FamilyHistoryPage {
  entries: FamilyHistoryEntry[]
  total: number
}

/**
 * A page of the family wallet's ledger, newest first, optionally narrowed to
 * some members' lines.
 *
 * A cart paid at once across several shops is a single debit pointing at its
 * first order: the summary then covers every order of that checkout, so the
 * payer reads the whole cart. A refund points at the very order refunded and
 * shows that one only.
 */
export async function loadFamilyHistory(
  em: EntityManager,
  walletId: string,
  options: { memberIds?: string[], page: number, limit: number },
): Promise<FamilyHistoryPage> {
  const limit = Math.min(Math.max(options.limit, 1), 100)
  const page = Math.max(options.page, 1)
  const [transactions, total] = await em.findAndCount(
    WalletTransaction,
    {
      wallet: { id: walletId },
      ...(options.memberIds ? { familyMember: { id: { $in: options.memberIds } } } : {}),
    },
    {
      orderBy: { createdAt: 'DESC', id: 'DESC' },
      limit,
      offset: (page - 1) * limit,
      populate: ['familyMember'],
    },
  )

  const orderIds = [...new Set(transactions.map(row => row.order?.id).filter((id): id is string => Boolean(id)))]
  const summaries = await summarizeOrders(em, orderIds)

  return {
    entries: transactions.map((transaction) => {
      const orderId = transaction.order?.id
      const summary = orderId ? summaries.get(orderId) : undefined
      return {
        transaction,
        member: (transaction.familyMember as FamilyWalletMember | null | undefined) ?? null,
        order: summary
          ? (transaction.type === WalletTransactionType.ORDER_PAYMENT ? summary.cart : summary.alone)
          : null,
      }
    }),
    total,
  }
}

/** For each order: itself alone, and the whole cart it was paid with. */
async function summarizeOrders(em: EntityManager, orderIds: string[]): Promise<Map<string, { alone: FamilyOrderSummary, cart: FamilyOrderSummary }>> {
  const summaries = new Map<string, { alone: FamilyOrderSummary, cart: FamilyOrderSummary }>()
  if (orderIds.length === 0) {
    return summaries
  }
  const orders = await em.find(Order, { id: { $in: orderIds } }, { populate: ['checkout'] })
  const checkoutIds = [...new Set(orders.map(order => order.checkout?.id).filter((id): id is string => Boolean(id)))]
  const related = await em.find(
    Order,
    checkoutIds.length > 0
      ? { $or: [{ id: { $in: orderIds } }, { checkout: { id: { $in: checkoutIds } } }] }
      : { id: { $in: orderIds } },
    { populate: ['supplier', 'items.product', 'checkout'], orderBy: { createdAt: 'ASC', id: 'ASC' } },
  )

  for (const order of orders) {
    const self = related.find(candidate => candidate.id === order.id)
    if (!self) {
      continue
    }
    const siblings = order.checkout
      ? related.filter(candidate => candidate.checkout?.id === order.checkout!.id)
      : [self]
    summaries.set(order.id, { alone: summarize(self, [self]), cart: summarize(self, siblings) })
  }
  return summaries
}

function summarize(head: Order, orders: Order[]): FamilyOrderSummary {
  return {
    id: head.id,
    orderNumber: head.orderNumber,
    shopName: [...new Set(orders.map(order => order.supplier.shopName))].join(', '),
    lines: orders.flatMap(order => order.items.getItems().map((item) => {
      const photo = item.product.photos?.[0] ?? null
      return { name: item.product.name, quantity: item.quantity, imageUrl: thumbnailUrlFor(photo) ?? photo }
    })),
  }
}
