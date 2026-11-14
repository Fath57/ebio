import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, NotFoundException } from '@nestjs/common'
import { AdminService } from './admin.service'

export interface PaymentDetail {
  payment: {
    id: string
    amount: number
    status: string
    provider: string
    providerTransactionId: string | null
    providerReference: string | null
    paymentMethod: string | null
    operator: string | null
    phoneNumber: string | null
    receiptUrl: string | null
    createdAt: string
    paidAt: string | null
    releasedAt: string | null
    refundedAt: string | null
  }
  /** The order the payment settles, as the order page shows it; null for a legacy row. */
  order: unknown
  checkout: {
    id: string
    status: string
    totalAmount: number
    deliveryFee: number
    discount: number
    paymentMethod: string
    createdAt: string
    /** Every order this one payment covers, a unified cart pays for several shops. */
    orders: Array<{ id: string, orderNumber: string, status: string, totalAmount: number, supplierName: string }>
  } | null
  /** What eBio asked the provider and what it answered, oldest first. */
  providerJournal: Array<{
    kind: string
    reference: string | null
    amount: number
    status: string
    providerStatus: string | null
    failureReason: string | null
    createdAt: string
    lastCheckedAt: string | null
    settledAt: string | null
  }>
  /** Money that moved on eBio wallets because of this payment or its order. */
  walletMovements: Array<{
    id: string
    type: string
    amount: number
    balanceAfter: number
    description: string | null
    ownerLabel: string
    ownerKind: 'BUYER' | 'SUPPLIER' | 'COURIER' | 'PLATFORM' | 'OTHER'
    createdAt: string
  }>
  dispute: { id: string, status: string, reason: string | null, createdAt: string } | null
}

/**
 * Everything the back office needs to answer « what happened to this
 * payment? » on one page: the payment, its order, the cart it was part of,
 * the provider's side of the story and the money it moved inside eBio.
 */
@Injectable()
export class AdminPaymentDetailService {
  constructor(
    private readonly em: EntityManager,
    private readonly adminService: AdminService,
  ) {}

  async getDetail(paymentId: string): Promise<PaymentDetail> {
    const connection = this.em.getConnection()
    const [row] = await connection.execute(
      `SELECT p.*, p."createdAt" AS created_at FROM payments p WHERE p.id = ?`,
      [paymentId],
    ) as Array<Record<string, unknown>>
    if (!row) {
      throw new NotFoundException('Paiement introuvable')
    }

    const orderId = (row.order_id as string | null) ?? null
    const checkoutId = (row.checkout_id as string | null) ?? null

    const [order, checkoutRows, siblingRows, journalRows, movementRows, disputeRows] = await Promise.all([
      orderId ? this.adminService.getOrderById(orderId).catch(() => null) : Promise.resolve(null),
      checkoutId
        ? connection.execute(`SELECT * FROM checkouts WHERE id = ?`, [checkoutId]) as Promise<Array<Record<string, unknown>>>
        : Promise.resolve([] as Array<Record<string, unknown>>),
      checkoutId
        ? connection.execute(
          `SELECT o.id, o.order_number, o.status, o.total_amount, s.shop_name
             FROM orders o LEFT JOIN suppliers s ON s.id = o.supplier_id
             WHERE o.checkout_id = ? ORDER BY o.order_number`,
          [checkoutId],
        ) as Promise<Array<Record<string, unknown>>>
        : Promise.resolve([] as Array<Record<string, unknown>>),
      connection.execute(
        // Knex expands a bound array into a value list: `IN (?)`, not `ANY(?)`.
        `SELECT * FROM provider_transactions
         WHERE subject_id IN (?) OR (reference IS NOT NULL AND reference = ?)
         ORDER BY created_at`,
        [[checkoutId, orderId, paymentId].filter(Boolean), (row.provider_transaction_id as string | null) ?? ''],
      ) as Promise<Array<Record<string, unknown>>>,
      connection.execute(
        `SELECT wt.id, wt.type, wt.amount, wt.balance_after, wt.description, wt."createdAt" AS created_at,
                w.user_id, w.supplier_id, w.courier_profile_id, w.platform_account,
                u.name AS user_name, s.shop_name, cp.full_name AS courier_name
         FROM wallet_transactions wt
         JOIN wallets w ON w.id = wt.wallet_id
         LEFT JOIN users u ON u.id = w.user_id
         LEFT JOIN suppliers s ON s.id = w.supplier_id
         LEFT JOIN courier_profiles cp ON cp.id = w.courier_profile_id
         WHERE wt.payment_id = ? OR (? IS NOT NULL AND wt.order_id = ?)
         ORDER BY wt."createdAt"`,
        [paymentId, orderId, orderId],
      ) as Promise<Array<Record<string, unknown>>>,
      orderId
        ? connection.execute(
          `SELECT id, status, reason, "createdAt" AS created_at FROM disputes WHERE order_id = ? ORDER BY "createdAt" DESC LIMIT 1`,
          [orderId],
        ) as Promise<Array<Record<string, unknown>>>
        : Promise.resolve([] as Array<Record<string, unknown>>),
    ])

    const checkout = checkoutRows[0]
    const dispute = disputeRows[0]

    return {
      payment: {
        id: row.id as string,
        amount: Number(row.amount ?? 0),
        status: row.status as string,
        provider: row.provider as string,
        providerTransactionId: (row.provider_transaction_id as string | null) ?? null,
        providerReference: (row.provider_reference as string | null) ?? null,
        paymentMethod: (row.payment_method as string | null) ?? null,
        operator: (row.operator as string | null) ?? null,
        phoneNumber: (row.phone_number as string | null) ?? null,
        receiptUrl: (row.receipt_url as string | null) ?? null,
        createdAt: iso(row.created_at) ?? '',
        paidAt: iso(row.paid_at),
        releasedAt: iso(row.released_at),
        refundedAt: iso(row.refunded_at),
      },
      order,
      checkout: checkout
        ? {
            id: checkout.id as string,
            status: checkout.status as string,
            totalAmount: Number(checkout.total_amount ?? 0),
            deliveryFee: Number(checkout.delivery_fee ?? 0),
            discount: Number(checkout.discount ?? 0),
            paymentMethod: checkout.payment_method as string,
            createdAt: iso(checkout.createdAt) ?? '',
            orders: siblingRows.map(sibling => ({
              id: sibling.id as string,
              orderNumber: sibling.order_number as string,
              status: sibling.status as string,
              totalAmount: Number(sibling.total_amount ?? 0),
              supplierName: (sibling.shop_name as string | null) ?? '-',
            })),
          }
        : null,
      providerJournal: journalRows.map(entry => ({
        kind: entry.kind as string,
        reference: (entry.reference as string | null) ?? null,
        amount: Number(entry.amount ?? 0),
        status: entry.status as string,
        providerStatus: (entry.provider_status as string | null) ?? null,
        failureReason: (entry.failure_reason as string | null) ?? null,
        createdAt: iso(entry.created_at) ?? '',
        lastCheckedAt: iso(entry.last_checked_at),
        settledAt: iso(entry.settled_at),
      })),
      walletMovements: movementRows.map(movement => ({
        id: movement.id as string,
        type: movement.type as string,
        amount: Number(movement.amount ?? 0),
        balanceAfter: Number(movement.balance_after ?? 0),
        description: (movement.description as string | null) ?? null,
        ...walletOwner(movement),
        createdAt: iso(movement.created_at) ?? '',
      })),
      dispute: dispute
        ? {
            id: dispute.id as string,
            status: dispute.status as string,
            reason: (dispute.reason as string | null) ?? null,
            createdAt: iso(dispute.created_at) ?? '',
          }
        : null,
    }
  }
}

function iso(value: unknown): string | null {
  if (!value)
    return null
  const date = value instanceof Date ? value : new Date(value as string)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** Who a wallet belongs to, in words the back office can show. */
function walletOwner(row: Record<string, unknown>): { ownerLabel: string, ownerKind: PaymentDetail['walletMovements'][number]['ownerKind'] } {
  if (row.platform_account)
    return { ownerLabel: `eBio, ${String(row.platform_account)}`, ownerKind: 'PLATFORM' }
  if (row.supplier_id)
    return { ownerLabel: (row.shop_name as string | null) ?? 'Boutique', ownerKind: 'SUPPLIER' }
  if (row.courier_profile_id)
    return { ownerLabel: (row.courier_name as string | null) ?? 'Livreur', ownerKind: 'COURIER' }
  if (row.user_id)
    return { ownerLabel: (row.user_name as string | null) ?? 'Acheteur', ownerKind: 'BUYER' }
  return { ownerLabel: '-', ownerKind: 'OTHER' }
}
