import type { OrderPayerView } from '../orders/orders.mapper'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, Logger } from '@nestjs/common'
import { Delivery, DeliveryProofType } from '../deliveries/entities/delivery.entity'
import { MediaService } from '../media/media.service'
import { Order } from '../orders/entities/order.entity'
import { OrderMapper } from '../orders/orders.mapper'
import { Checkout } from '../payments/entities/checkout.entity'
import { RECIPIENT_SMS_RESEND_LIMIT } from './gift-texts'

/** The proof photo shown on the order screen, asked for when the screen opens. */
const PROOF_PHOTO_TTL_SECONDS = 3600

/**
 * What only the payer reads on their order: the relative, the code, the
 * resends left, the frozen currency and the hand-over photo. Anyone else,
 * the shop, a courier, gets none of it.
 */
@Injectable()
export class GiftViewService {
  private readonly logger = new Logger(GiftViewService.name)

  constructor(
    private readonly em: EntityManager,
    private readonly media: MediaService,
  ) {}

  async payerView(order: Order, requesterId: string): Promise<OrderPayerView> {
    if (order.buyer.id !== requesterId || !order.checkout) {
      return {}
    }
    const checkout = await this.em.findOne(Checkout, { id: order.checkout.id })
    if (!checkout) {
      return {}
    }
    const display = OrderMapper.displayOf(order)
    if (!checkout.recipientPhone) {
      return { display }
    }

    const delivery = await this.em.findOne(Delivery, { order: { id: order.id } }, { orderBy: { createdAt: 'DESC' } })
    return {
      display,
      gift: {
        recipient: { name: checkout.recipientName ?? '', phone: checkout.recipientPhone },
        confirmationCode: delivery?.confirmationCode ?? null,
        smsResendsLeft: Math.max(0, RECIPIENT_SMS_RESEND_LIMIT - checkout.recipientSmsResendCount),
      },
      proof: delivery?.proofType === DeliveryProofType.CODE_AND_PHOTO
        ? {
            photoUrl: await this.signedPhoto(delivery.proofMediaId),
            takenAt: delivery.proofTakenAt?.toISOString() ?? null,
            far: delivery.proofFar,
          }
        : null,
    }
  }

  private async signedPhoto(mediaId: string | null | undefined): Promise<string | null> {
    if (!mediaId) {
      return null
    }
    try {
      return await this.media.getSignedUrl(mediaId, PROOF_PHOTO_TTL_SECONDS)
    }
    catch (error) {
      // Purged after 90 days, or a storage hiccup: the order shows without it.
      this.logger.warn(`Photo de remise indisponible (${mediaId}) : ${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }
}
