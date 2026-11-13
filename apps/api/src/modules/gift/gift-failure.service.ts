import type { Delivery } from '../deliveries/entities/delivery.entity'
import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common'
import { OrderStatus } from '../orders/entities/order.entity'
import { OrdersService } from '../orders/orders.service'
import { CompensationService } from '../payments/compensation.service'
import { GiftNotifierService } from './gift-notifier.service'

/** Why the hand-over failed, as told to the payer — the relative is the one who was not there. */
const PAYER_REASON_LABELS: Record<string, string> = {
  CUSTOMER_ABSENT: 'votre proche était absent',
  ADDRESS_NOT_FOUND: 'adresse introuvable',
  CUSTOMER_REFUSED: 'votre proche a refusé le panier',
  OTHER: 'autre motif',
}

export function giftFailReasonLabel(reason: string | null | undefined, comment?: string | null): string {
  const label = PAYER_REASON_LABELS[reason ?? 'OTHER'] ?? PAYER_REASON_LABELS.OTHER
  return reason === 'OTHER' && comment ? `${label} : ${comment}` : label
}

/**
 * A cart for a relative that could not be handed over (research §5).
 *
 * The card cannot be partly refunded, so the payer's eBio wallet gets the
 * order back minus its delivery fee — the courier made the trip and is paid
 * for it by the caller, as for a delivered run. The order is cancelled, the
 * payer told why, and the relative told the cart is not coming.
 *
 * Ordinary orders never come here: their failure keeps moving no money.
 */
@Injectable()
export class GiftFailureService {
  private readonly logger = new Logger(GiftFailureService.name)

  constructor(
    @Inject(forwardRef(() => CompensationService))
    private readonly compensation: CompensationService,
    @Inject(forwardRef(() => OrdersService))
    private readonly ordersService: OrdersService,
    private readonly notifier: GiftNotifierService,
  ) {}

  /**
   * `delivery` must carry its order (with `checkout`) and its fail reason.
   * Replay-safe: the refund is keyed on the order, and a second call finds it
   * done and tells nobody again.
   */
  async onGiftDeliveryFailed(delivery: Delivery): Promise<void> {
    const order = delivery.order
    const checkoutId = order.checkout?.id
    if (!checkoutId) {
      return
    }
    const reasonLabel = giftFailReasonLabel(delivery.failReason, delivery.failComment)

    // The refund first, with the fee withheld: the cancellation below would
    // otherwise refund the whole order through the ordinary path, and the
    // refund being keyed on the order, the first one written wins.
    const result = await this.compensation.compensateOrder(
      order.id,
      `remise impossible — ${reasonLabel}`,
      { withholdDeliveryFee: true },
    )

    try {
      // Cancelling also tells the relative (all orders of the checkout
      // cancelled, announcement sent) — see OrdersService.onOrderCancelled.
      await this.ordersService.applyStatusFromDelivery(order.id, OrderStatus.CANCELLED)
    }
    catch (error) {
      this.logger.error(`Annulation de la commande ${order.id} après échec de remise impossible`, error instanceof Error ? error.stack : String(error))
    }

    if (result.alreadyDone) {
      return
    }
    await this.notifier.notifyFailed({
      checkoutId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      reasonLabel,
      refunded: result.amount,
      withheld: result.withheld,
    })
  }
}
