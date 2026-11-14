import type { EmailAttachment } from '../email/email.service'
import { EntityManager } from '@mikro-orm/postgresql'
import { HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { SmsService } from '../../common/sms.service'
import { config } from '../../config/env.config'
import { User } from '../auth/auth.entity'
import { EmailService } from '../email/email.service'
import { Media } from '../media/media.entity'
import { MediaService } from '../media/media.service'
import { NotificationChannel, NotificationType } from '../notifications/notification.entity'
import { NotificationsService } from '../notifications/notifications.service'
import { formatFcfa } from '../orders/order-format'
import { Checkout, CheckoutStatus } from '../payments/entities/checkout.entity'
import {
  announceSms,
  cancellationSms,
  codeSms,
  firstName,
  giftBadRequest,
  handOverTimes,
  RECIPIENT_SMS_RESEND_LIMIT,
} from './gift-texts'

/** Signed link of the hand-over photo in the push: S3 refuses longer than 7 days. */
const PUSH_PHOTO_TTL_SECONDS = 7 * 24 * 3600

/** Accounts created by SMS code carry this placeholder address: nobody reads it. */
const PLACEHOLDER_EMAIL_SUFFIX = '@phone.ebio.app'

/** Order statuses of a delivery still on its way, whose code the relative needs. */
const CODE_DELIVERY_STATUSES = ['PICKED_UP', 'IN_TRANSIT']

interface RecipientRow {
  recipient_phone: string
  recipient_name: string
  tracking_token: string
  buyer_name: string
}

export interface GiftDeliveredInput {
  checkoutId: string
  orderId: string
  /** The hand-over photo; null when it could not be read back. */
  mediaId: string | null
  deliveredAt: Date
}

export interface GiftFailedInput {
  checkoutId: string
  orderId: string
  orderNumber: string
  reasonLabel: string
  /** What came back on the payer's wallet. */
  refunded: number
  /** What was kept: the courier made the trip. */
  withheld: number
}

/**
 * Everything said about a cart sent to a relative: the texts to the relative
 * (who may have no account, hence raw SMS), and the push and e-mail to the
 * payer once it is handed over or has failed.
 *
 * Never throws on the sending side: a refused SMS or an unreachable mail
 * server must not fail a payment, a pickup or a hand-over. Each message is
 * claimed in the database before it leaves, so a replay sends nothing twice.
 */
@Injectable()
export class GiftNotifierService {
  private readonly logger = new Logger(GiftNotifierService.name)

  constructor(
    private readonly em: EntityManager,
    private readonly sms: SmsService,
    private readonly notifications: NotificationsService,
    private readonly media: MediaService,
    private readonly email: EmailService,
  ) {}

  trackingUrl(token: string): string {
    return `${config.clients.publicSite.url}/suivi/${token}`
  }

  /** The window of the checkout's orders, the earliest one when they differ. */
  private async windowOf(checkoutId: string): Promise<{ start: Date, end: Date } | null> {
    const rows = await this.em.getConnection().execute(
      `SELECT MIN(delivery_window_start) AS start, MIN(delivery_window_end) AS "end"
       FROM orders WHERE checkout_id = ? AND delivery_window_start IS NOT NULL AND delivery_window_end IS NOT NULL`,
      [checkoutId],
    ) as Array<{ start: Date | string | null, end: Date | string | null }>
    const row = rows[0]
    if (!row?.start || !row.end) {
      return null
    }
    return { start: new Date(row.start), end: new Date(row.end) }
  }

  private async sendQuietly(phone: string, message: string, what: string, checkoutId: string): Promise<boolean> {
    try {
      await this.sms.send(phone, message)
      return true
    }
    catch (error) {
      this.logger.error(`SMS « ${what} » au proche non envoyé, passage en caisse ${checkoutId}`, error instanceof Error ? error.stack : String(error))
      return false
    }
  }

  private async announceText(row: RecipientRow, checkoutId: string): Promise<string> {
    return announceSms(row.buyer_name, await this.windowOf(checkoutId), this.trackingUrl(row.tracking_token), new Date())
  }

  /**
   * Payment confirmed: the relative learns a cart is coming, when, and where
   * to follow it. Once per checkout, whatever replays the confirmation.
   */
  async announceToRecipient(checkoutId: string): Promise<void> {
    try {
      const rows = await this.em.getConnection().execute(
        `UPDATE checkouts c SET recipient_announced_at = NOW()
         FROM users u
         WHERE c.id = ? AND u.id = c.buyer_id
           AND c.recipient_phone IS NOT NULL AND c.recipient_announced_at IS NULL
         RETURNING c.recipient_phone, c.recipient_name, c.tracking_token, u.name AS buyer_name`,
        [checkoutId],
      ) as RecipientRow[]
      const row = rows[0]
      if (!row) {
        return
      }
      await this.sendQuietly(row.recipient_phone, await this.announceText(row, checkoutId), 'annonce', checkoutId)
    }
    catch (error) {
      this.logger.error(`Annonce au proche impossible, passage en caisse ${checkoutId}`, error instanceof Error ? error.stack : String(error))
    }
  }

  /**
   * The courier is on the way: the relative gets the code to hand over. Sent
   * once per code, a run of two orders announces it once, and only a new
   * code (a reassigned courier) is texted again.
   */
  async sendCodeToRecipient(checkoutId: string, code: string): Promise<void> {
    try {
      const rows = await this.em.getConnection().execute(
        `UPDATE checkouts SET recipient_code_sent = ?
         WHERE id = ? AND recipient_phone IS NOT NULL AND recipient_code_sent IS DISTINCT FROM ?
         RETURNING recipient_phone`,
        [code, checkoutId, code],
      ) as Array<{ recipient_phone: string }>
      const row = rows[0]
      if (!row) {
        return
      }
      await this.sendQuietly(row.recipient_phone, codeSms(code), 'code', checkoutId)
    }
    catch (error) {
      this.logger.error(`Code au proche impossible, passage en caisse ${checkoutId}`, error instanceof Error ? error.stack : String(error))
    }
  }

  /**
   * Every order of the checkout is cancelled and the relative had been told
   * a cart was coming: they are told it is not. Silent otherwise, a relative
   * who never heard of the cart has nothing to be un-told.
   */
  async announceCancellation(checkoutId: string): Promise<void> {
    try {
      const rows = await this.em.getConnection().execute(
        `UPDATE checkouts c SET recipient_cancel_sent_at = NOW()
         FROM users u
         WHERE c.id = ? AND u.id = c.buyer_id
           AND c.recipient_phone IS NOT NULL
           AND c.recipient_announced_at IS NOT NULL
           AND c.recipient_cancel_sent_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.checkout_id = c.id AND o.status <> 'CANCELLED')
         RETURNING c.recipient_phone, u.name AS buyer_name`,
        [checkoutId],
      ) as Array<{ recipient_phone: string, buyer_name: string }>
      const row = rows[0]
      if (!row) {
        return
      }
      await this.sendQuietly(row.recipient_phone, cancellationSms(row.buyer_name), 'annulation', checkoutId)
    }
    catch (error) {
      this.logger.error(`Annulation au proche impossible, passage en caisse ${checkoutId}`, error instanceof Error ? error.stack : String(error))
    }
  }

  /**
   * The payer asks for the last useful text again: the code while the courier
   * is on the way, the announcement before. Three times at most (FR-010).
   */
  async resendToRecipient(checkoutId: string, payerId: string): Promise<void> {
    const checkout = await this.em.findOne(Checkout, { id: checkoutId }, { populate: ['buyer'] })
    if (!checkout || checkout.buyer.id !== payerId) {
      throw new NotFoundException('Passage en caisse introuvable')
    }
    if (!checkout.recipientPhone) {
      throw giftBadRequest('NOT_A_GIFT', 'Cette commande n\'est pas livrée à un proche')
    }
    if (checkout.status === CheckoutStatus.PENDING || checkout.status === CheckoutStatus.FAILED) {
      throw giftBadRequest('GIFT_NOT_PAID', 'Le paiement n\'est pas encore confirmé : aucun SMS n\'a été envoyé au proche')
    }

    // Counted atomically: two taps at once cannot both get under the limit.
    const counted = await this.em.getConnection().execute(
      `UPDATE checkouts SET recipient_sms_resend_count = recipient_sms_resend_count + 1
       WHERE id = ? AND recipient_sms_resend_count < ?
       RETURNING recipient_sms_resend_count`,
      [checkoutId, RECIPIENT_SMS_RESEND_LIMIT],
    ) as Array<{ recipient_sms_resend_count: number }>
    if (counted.length === 0) {
      throw new HttpException({
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: 'RECIPIENT_SMS_LIMIT',
        message: `Le SMS a déjà été renvoyé ${RECIPIENT_SMS_RESEND_LIMIT} fois`,
      }, HttpStatus.TOO_MANY_REQUESTS)
    }
    checkout.recipientSmsResendCount = Number(counted[0].recipient_sms_resend_count)

    const code = await this.currentCode(checkoutId)
    const message = code
      ? codeSms(code)
      : await this.announceText({
          recipient_phone: checkout.recipientPhone,
          recipient_name: checkout.recipientName ?? '',
          tracking_token: checkout.trackingToken ?? '',
          buyer_name: checkout.buyer.name,
        }, checkoutId)
    await this.sendQuietly(checkout.recipientPhone, message, code ? 'code (renvoi)' : 'annonce (renvoi)', checkoutId)
  }

  /** The hand-over code of a delivery of this checkout still on its way, if any. */
  async currentCode(checkoutId: string): Promise<string | null> {
    const rows = await this.em.getConnection().execute(
      `SELECT d.confirmation_code FROM deliveries d
       JOIN orders o ON o.id = d.order_id
       WHERE o.checkout_id = ? AND d.status IN (${CODE_DELIVERY_STATUSES.map(() => '?').join(', ')})
         AND d.confirmation_code IS NOT NULL
       ORDER BY d."updatedAt" DESC LIMIT 1`,
      [checkoutId, ...CODE_DELIVERY_STATUSES],
    ) as Array<{ confirmation_code: string }>
    return rows[0]?.confirmation_code ?? null
  }

  private canEmail(user: User): boolean {
    return Boolean(user.email) && !user.email.endsWith(PLACEHOLDER_EMAIL_SUFFIX)
  }

  /** The photo's bytes for an inline e-mail picture; null when unreadable. */
  private async photoAttachment(media: Media): Promise<EmailAttachment | null> {
    try {
      // The original rather than the WebP copy: some mail clients still
      // cannot show WebP.
      const content = await this.media.readObject(media, media.s3Key)
      return { filename: media.originalName || 'remise.jpg', content, contentType: media.mimeType, cid: 'proof' }
    }
    catch (error) {
      this.logger.warn(`Photo de remise illisible (${media.id}) : ${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }

  /**
   * The payer learns the cart is in their relative's hands, with the photo:
   * a push showing it, and an e-mail carrying it inline (a signed link would
   * die in their mailbox). Times in Benin time, and in theirs when known.
   */
  async notifyDelivered(input: GiftDeliveredInput): Promise<void> {
    try {
      const checkout = await this.em.findOne(Checkout, { id: input.checkoutId }, { populate: ['buyer'] })
      if (!checkout?.recipientPhone) {
        return
      }
      const recipient = firstName(checkout.recipientName)
      const times = handOverTimes(input.deliveredAt, checkout.payerTimeZone)
      const when = times.payer
        ? `à ${times.benin} (heure du Bénin), soit ${times.payer}`
        : `à ${times.benin} (heure du Bénin)`

      const media = input.mediaId ? await this.em.findOne(Media, { id: input.mediaId }) : null
      let imageUrl: string | undefined
      if (media) {
        try {
          imageUrl = await this.media.getSignedUrl(media.id, PUSH_PHOTO_TTL_SECONDS)
        }
        catch (error) {
          this.logger.warn(`Lien signé de la photo de remise impossible (${media.id}) : ${error instanceof Error ? error.message : String(error)}`)
        }
      }

      await this.notifications.send({
        user: checkout.buyer,
        type: NotificationType.GIFT_DELIVERED,
        title: `Panier remis à ${recipient}`,
        body: `Votre panier a été remis à ${checkout.recipientName} ${when}.`,
        data: { orderId: input.orderId, checkoutId: checkout.id },
        channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
        imageUrl,
      })

      if (this.canEmail(checkout.buyer)) {
        const attachment = media ? await this.photoAttachment(media) : null
        await this.email.sendTemplatedEmail({
          to: checkout.buyer.email,
          subject: `Votre panier a été remis à ${recipient}`,
          template: 'gift-delivered',
          data: {
            payerName: firstName(checkout.buyer.name),
            recipientName: checkout.recipientName,
            beninTime: times.benin,
            payerTime: times.payer,
            hasPhoto: attachment !== null,
            photoAlt: `Photo de la remise du panier à ${recipient}, ${times.benin}`,
            orderUrl: `ebio-mobile://orders/${input.orderId}`,
          },
          attachments: attachment ? [attachment] : undefined,
        })
      }
    }
    catch (error) {
      this.logger.error(`Avis de remise au payeur impossible, commande ${input.orderId}`, error instanceof Error ? error.stack : String(error))
    }
  }

  /** The hand-over failed: the payer is told why, and what came back on their wallet. */
  async notifyFailed(input: GiftFailedInput): Promise<void> {
    try {
      const checkout = await this.em.findOne(Checkout, { id: input.checkoutId }, { populate: ['buyer'] })
      if (!checkout?.recipientPhone) {
        return
      }
      const recipient = firstName(checkout.recipientName)
      const refunded = formatFcfa(input.refunded)
      await this.notifications.send({
        user: checkout.buyer,
        type: NotificationType.GIFT_DELIVERY_FAILED,
        title: `Panier non remis à ${recipient}`,
        body: input.refunded > 0
          ? `La livraison n'a pas pu aboutir (${input.reasonLabel}). ${refunded} ont été recrédités sur votre portefeuille eBio.`
          : `La livraison n'a pas pu aboutir (${input.reasonLabel}).`,
        data: { orderId: input.orderId, checkoutId: checkout.id, amount: input.refunded },
        channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      })

      if (this.canEmail(checkout.buyer)) {
        await this.email.sendTemplatedEmail({
          to: checkout.buyer.email,
          subject: `Votre panier n'a pas pu être remis à ${recipient}`,
          template: 'gift-delivery-failed',
          data: {
            payerName: firstName(checkout.buyer.name),
            recipientName: checkout.recipientName,
            orderNumber: input.orderNumber,
            reason: input.reasonLabel,
            refunded,
            withheld: input.withheld > 0 ? formatFcfa(input.withheld) : null,
            orderUrl: `ebio-mobile://orders/${input.orderId}`,
          },
        })
      }
    }
    catch (error) {
      this.logger.error(`Avis d'échec au payeur impossible, commande ${input.orderId}`, error instanceof Error ? error.stack : String(error))
    }
  }
}
