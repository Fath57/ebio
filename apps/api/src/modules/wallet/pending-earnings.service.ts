import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable } from '@nestjs/common'
import { Delivery, DeliveryStatus } from '../deliveries/entities/delivery.entity'
import { OrderStatus, PickupMode } from '../orders/entities/order.entity'
import { effectiveDelays, escrowReleaseAt } from '../payments/escrow-release-policy'
import { Payment, PaymentStatus } from '../payments/payment.entity'
import { supplierShare } from '../payments/supplier-share'
import { PlatformSettingsService } from '../settings/platform-settings.service'
import { Supplier } from '../suppliers/supplier.entity'

/** Statuses of a paid order still on its way: the money will come, later. */
const IN_PROGRESS = [OrderStatus.PLACED, OrderStatus.ACCEPTED, OrderStatus.PREPARING, OrderStatus.READY, OrderStatus.IN_DELIVERY]

export interface PendingEarnings {
  /** Everything paid online and not yet in the wallet. */
  amount: number
  /** Delivered orders waiting for the release delay. */
  deliveredAmount: number
  deliveredCount: number
  /** Paid orders not delivered yet. */
  inProgressAmount: number
  inProgressCount: number
  /** When the next delivered order will be credited, if any. */
  nextReleaseAt: string | null
  /**
   * The delays in force for this shop, in hours, so the app can say them
   * instead of hard-coding them. `joursMaximum` is the ceiling rounded up to
   * days, for app versions that still read it.
   */
  delays: { heuresApresConfirmation: number, heuresMaximum: number, joursMaximum: number }
}

/**
 * What a shop has been paid for but not yet received.
 *
 * Money paid online sits with eBio until the release (see the escrow
 * scheduler): a shop that saw « 0 » in its wallet after a delivered sale
 * read it as lost. The amounts are computed by `supplierShare`, the very
 * function the release credits with. Before delivery the courier is not
 * known yet: a delivery order is counted as delivered by an eBio courier,
 * which is the usual case and the cautious one (the fee is not the shop's).
 */
@Injectable()
export class PendingEarningsService {
  constructor(
    private readonly em: EntityManager,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  async forSupplier(supplierId: string, now = new Date()): Promise<PendingEarnings> {
    const platform = await this.platformSettings.getEscrowRelease()
    const supplier = await this.em.findOneOrFail(Supplier, { id: supplierId }, { fields: ['escrowReleaseHours'] })
    const shopDelays = effectiveDelays(platform, supplier.escrowReleaseHours)
    const payments = await this.em.find(Payment, {
      status: { $in: [PaymentStatus.CAPTURED, PaymentStatus.ESCROW] },
      order: {
        supplier: { id: supplierId },
        status: { $in: [...IN_PROGRESS, OrderStatus.DELIVERED] },
        escrowReleasedAt: null,
      },
    }, { populate: ['order'] })

    const deliveredIds = payments.filter(p => p.order.status === OrderStatus.DELIVERED).map(p => p.order.id)
    const courierDelivered = new Set(
      deliveredIds.length === 0
        ? []
        : (await this.em.find(Delivery, {
            order: { id: { $in: deliveredIds } },
            status: DeliveryStatus.DELIVERED,
            courier: { $ne: null },
          }, { fields: ['order'] })).map(delivery => delivery.order.id),
    )

    const result: PendingEarnings = {
      amount: 0,
      deliveredAmount: 0,
      deliveredCount: 0,
      inProgressAmount: 0,
      inProgressCount: 0,
      nextReleaseAt: null,
      delays: { ...shopDelays, joursMaximum: Math.ceil(shopDelays.heuresMaximum / 24) },
    }
    let nextRelease: number | null = null

    for (const payment of payments) {
      const order = payment.order
      const isDelivered = order.status === OrderStatus.DELIVERED
      const share = supplierShare({
        paymentAmount: Number(payment.amount),
        commissionAmount: Number(order.commissionAmount),
        deliveryFee: Number(order.deliveryFee),
        deliveredByCourier: isDelivered ? courierDelivered.has(order.id) : order.pickupMode === PickupMode.DELIVERY,
        discountFundedBy: order.discountFundedBy,
        discountAmount: Number(order.discountAmount),
        platformPromoCompensation: Number(order.platformPromoCompensation),
      })

      if (isDelivered) {
        result.deliveredAmount += share.total
        result.deliveredCount += 1
        const releaseAt = escrowReleaseAt(platform, {
          deliveredAt: order.deliveredAt ?? null,
          bothConfirmed: order.deliveryConfirmedByBuyer && order.deliveryConfirmedBySupplier,
          supplierHours: supplier.escrowReleaseHours,
          exportOrder: order.pickupMode === PickupMode.EXPORT,
        }, now).getTime()
        nextRelease = nextRelease === null ? releaseAt : Math.min(nextRelease, releaseAt)
      }
      else {
        result.inProgressAmount += share.total
        result.inProgressCount += 1
      }
    }

    result.deliveredAmount = Math.round(result.deliveredAmount)
    result.inProgressAmount = Math.round(result.inProgressAmount)
    result.amount = result.deliveredAmount + result.inProgressAmount
    // The release runs hourly: never promise a moment already past.
    result.nextReleaseAt = nextRelease === null ? null : new Date(Math.max(nextRelease, now.getTime())).toISOString()
    return result
  }
}
