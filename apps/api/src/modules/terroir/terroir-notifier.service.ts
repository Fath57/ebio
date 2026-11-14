import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, Logger } from '@nestjs/common'
import { SmsService } from '../../common/sms.service'
import { config } from '../../config/env.config'
import { User } from '../auth/auth.entity'
import { EmailService } from '../email/email.service'
import { NotificationChannel, NotificationType } from '../notifications/notification.entity'
import { NotificationsService } from '../notifications/notifications.service'
import { formatFcfa } from '../orders/order-format'
import { PlatformSettingsService } from '../settings/platform-settings.service'
import { ExportCountry, ExportShipmentStatus } from './contracts/terroir.contract'
import { ExportShipment } from './entities/export-shipment.entity'
import { addDays, shortName, spokenDay } from './terroir-texts'

/** What a parcel's news is about: a step, a free message, or both. */
export interface ShipmentNews {
  shipmentId: string
  step: ExportShipmentStatus | null
  message: string | null
  pickupPoint: string | null
  /** LOST, DAMAGED, CANCELLED: what the buyer got back on their wallet. */
  refunded?: number
}

const COUNTRY_NAMES: Record<ExportCountry, string> = {
  [ExportCountry.FR]: 'France',
  [ExportCountry.BE]: 'Belgique',
}

/** Only a Beninese number gets an SMS: the gateway sends nowhere else. */
const BENIN_PREFIX = '+229'

interface StepText {
  title: string
  /** To the buyer. */
  buyer: string
  /** To a gift's recipient: never a price. Null: the step is not theirs to know. */
  recipient: string | null
}

/**
 * What the terroir module tells whom (011, contracts §6). Never throws: the
 * action that triggered a message stands whatever the push or mail server
 * does.
 */
@Injectable()
export class TerroirNotifierService {
  private readonly logger = new Logger(TerroirNotifierService.name)

  constructor(
    private readonly em: EntityManager,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly sms: SmsService,
  ) {}

  /** The public page of a parcel (landing `colis/:token`), price-free. */
  trackingUrl(token: string): string {
    return `${config.clients.publicSite.url}/colis/${token}`
  }

  /**
   * A step or a free message on a parcel (FR-025): push and e-mail to the
   * buyer; e-mail (and SMS to a +229 number) to a gift's recipient, without
   * any amount (US10).
   */
  async shipmentNews(news: ShipmentNews): Promise<void> {
    try {
      const shipment = await this.em.fork().findOne(ExportShipment, { id: news.shipmentId }, { populate: ['buyer', 'departure', 'departure.agency'] })
      if (!shipment) {
        return
      }
      const text = this.stepText(shipment, news)
      const url = this.trackingUrl(shipment.trackingToken)
      await this.push(shipment.buyer.id, NotificationType.EXPORT_SHIPMENT_UPDATE, text.title, text.buyer, { shipmentId: shipment.id, step: news.step })
      await this.mail(shipment.buyer.email, text.title, {
        heading: text.title,
        greeting: `Bonjour ${shipment.buyer.name ?? ''},`.replace(' ,', ','),
        paragraphs: [text.buyer],
        pickupPoint: news.pickupPoint,
        trackingUrl: url,
        buttonLabel: 'Suivre le colis',
      })
      if (shipment.giftRecipientName && text.recipient) {
        await this.toRecipient(shipment, text.title, text.recipient, news.pickupPoint, url)
      }
    }
    catch (error) {
      this.logger.error(`Terroir parcel news for ${news.shipmentId} failed`, error instanceof Error ? error.stack : String(error))
    }
  }

  /** The parcel weighs more than paid for, beyond the tolerance (FR-020). */
  async supplementRequested(input: { shipmentId: string, amount: number, estimatedG: number, actualG: number, deadline: Date }): Promise<void> {
    try {
      const shipment = await this.em.fork().findOne(ExportShipment, { id: input.shipmentId }, { populate: ['buyer'] })
      if (!shipment) {
        return
      }
      const title = 'Complément de poids pour votre colis'
      const body = `Votre colis pèse ${kilos(input.actualG)} au lieu de ${kilos(input.estimatedG)} : un complément de ${formatFcfa(input.amount)} est demandé. Vous pouvez le payer ou retirer un produit (remboursé) avant le ${spokenInstant(input.deadline)} ; sans réponse, eBio prend l'écart à sa charge et votre colis part quand même.`
      await this.push(shipment.buyer.id, NotificationType.EXPORT_WEIGHT_SUPPLEMENT, title, body, { shipmentId: shipment.id })
      await this.mail(shipment.buyer.email, title, {
        heading: title,
        greeting: `Bonjour ${shipment.buyer.name ?? ''},`.replace(' ,', ','),
        paragraphs: [body, 'Répondez depuis l\'écran du colis, dans l\'application eBio.'],
        pickupPoint: null,
        trackingUrl: null,
        buttonLabel: '',
      })
    }
    catch (error) {
      this.logger.error(`Weight supplement notice for ${input.shipmentId} failed`, error instanceof Error ? error.stack : String(error))
    }
  }

  /** A departure opened towards a country the buyer asked to be told about (FR-032). */
  async departureOpen(input: { userId: string, city: string | null, departsOn: string, orderBefore: Date }): Promise<void> {
    const destination = input.city ? `vers ${input.city}` : 'à l\'étranger'
    const body = `Prochain envoi ${destination} le ${spokenDay(input.departsOn)} — commandez avant le ${spokenDay(input.orderBefore.toISOString().slice(0, 10))}.`
    await this.push(input.userId, NotificationType.EXPORT_DEPARTURE_OPEN, 'Un départ terroir est ouvert', body, { departsOn: input.departsOn })
  }

  /** An unpaid terroir checkout, 48 h before its departure's order deadline (FR-033). */
  async deadlineReminder(input: { userId: string, departureId: string, departsOn: string }): Promise<void> {
    const body = `Plus que 48 h pour le départ du ${spokenDay(input.departsOn)}. Votre panier terroir vous attend.`
    await this.push(input.userId, NotificationType.EXPORT_DEADLINE_REMINDER, 'Votre panier terroir', body, { departureId: input.departureId })
  }

  /** Still waiting at the pickup point (FR-027): the buyer, and a gift's recipient. */
  async pickupReminder(shipmentId: string, pickupPoint: string | null): Promise<void> {
    try {
      const shipment = await this.em.fork().findOne(ExportShipment, { id: shipmentId }, { populate: ['buyer', 'pickupPoint'] })
      if (!shipment) {
        return
      }
      const title = 'Votre colis vous attend'
      const where = pickupPoint ?? (shipment.pickupPoint ? `${shipment.pickupPoint.address}` : null)
      const buyer = shipment.giftRecipientName
        ? `Le colis offert à ${shipment.giftRecipientName} attend toujours au point de retrait${where ? ` : ${where}` : ''}. Pensez à le lui rappeler.`
        : `Votre colis attend toujours au point de retrait${where ? ` : ${where}` : ''}. Pensez à aller le chercher.`
      await this.push(shipment.buyer.id, NotificationType.EXPORT_SHIPMENT_UPDATE, title, buyer, { shipmentId: shipment.id })
      if (shipment.giftRecipientName) {
        const recipient = `Le colis que ${shortName(shipment.buyer.name)} vous a envoyé attend toujours au point de retrait. Présentez-vous à votre nom avec une pièce d'identité.`
        await this.toRecipient(shipment, title, recipient, where, this.trackingUrl(shipment.trackingToken))
      }
    }
    catch (error) {
      this.logger.error(`Pickup reminder for ${shipmentId} failed`, error instanceof Error ? error.stack : String(error))
    }
  }

  /** The shop learns eBio's answer on a product or a pack it submitted. */
  async exportReviewed(input: { userId: string, subject: string, approved: boolean, reason?: string | null, data: Record<string, unknown> }): Promise<void> {
    const body = input.approved
      ? `${input.subject} est validé pour l'export : il est visible par les clients à l'étranger.`
      : `${input.subject} n'est pas validé pour l'export${input.reason ? ` : ${input.reason}` : '.'}`
    await this.push(input.userId, NotificationType.EXPORT_PRODUCT_REVIEWED, input.approved ? 'Export validé' : 'Export refusé', body, input.data)
  }

  /** A parcel moved to another departure after a cancellation (FR-023). */
  async shipmentReassigned(input: { buyerId: string, shipmentId: string, departsOn: string, arrivalFrom: string, arrivalTo: string }): Promise<void> {
    const body = `Le départ de votre colis a changé : il partira le ${spokenDay(input.departsOn)}, arrivée estimée entre le ${spokenDay(input.arrivalFrom)} et le ${spokenDay(input.arrivalTo)}. Aucun supplément ne vous est demandé.`
    await this.push(input.buyerId, NotificationType.EXPORT_SHIPMENT_UPDATE, 'Nouveau départ pour votre colis', body, { shipmentId: input.shipmentId })
  }

  /** The parcel is paid: the buyer learns when it leaves (US1). */
  async shipmentPaid(input: { buyerId: string, shipmentId: string, departsOn: string }): Promise<void> {
    const body = `Votre colis terroir est payé. Les boutiques préparent vos produits ; il partira le ${spokenDay(input.departsOn)}. Vous serez prévenu à chaque étape.`
    await this.push(input.buyerId, NotificationType.EXPORT_SHIPMENT_UPDATE, 'Colis terroir confirmé', body, { shipmentId: input.shipmentId })
  }

  /** A departure cancelled with no other one yet: the buyer is told it waits. */
  async shipmentOnHold(input: { buyerId: string, shipmentId: string, departsOn: string }): Promise<void> {
    const body = `Le départ du ${spokenDay(input.departsOn)} est annulé. Nous vous proposons un nouveau départ très vite ; sans solution sous 30 jours, vous pourrez être remboursé.`
    await this.push(input.buyerId, NotificationType.EXPORT_SHIPMENT_UPDATE, 'Départ annulé', body, { shipmentId: input.shipmentId })
  }

  /** The team is told once a departure is 80 % full (FR-010a). */
  async departureFill(input: { departureId: string, agencyName: string, departsOn: string, ratio: number }): Promise<void> {
    try {
      const recipients = await this.platformSettings.getNewProductAlertEmails()
      const percent = Math.round(input.ratio * 100)
      const subject = `Départ du ${spokenDay(input.departsOn)} rempli à ${percent} %`
      const content = `Le départ ${input.agencyName} du ${spokenDay(input.departsOn)} est rempli à ${percent} % de sa capacité. À 100 %, il ne sera plus proposé aux clients.`
      await Promise.all(recipients.map(async (to) => {
        try {
          await this.email.sendEmail({ to, subject, content })
        }
        catch (error) {
          this.logger.error(`Departure fill e-mail to ${to} failed`, error instanceof Error ? error.message : String(error))
        }
      }))
    }
    catch (error) {
      this.logger.error(`Departure fill alert failed for ${input.departureId}`, error instanceof Error ? error.stack : String(error))
    }
  }

  private stepText(shipment: ExportShipment, news: ShipmentNews): StepText {
    const sender = shortName(shipment.buyer.name)
    const country = COUNTRY_NAMES[shipment.country] ?? 'destination'
    const agency = shipment.departure.agency.name
    const arrival = `entre le ${spokenDay(addDays(shipment.departure.departsOn, shipment.departure.transitMinDays))} et le ${spokenDay(addDays(shipment.departure.departsOn, shipment.departure.transitMaxDays))}`
    const refunded = news.refunded ? ` ${formatFcfa(news.refunded)} vous sont remboursés sur votre portefeuille eBio.` : ''
    const extra = news.message ? ` ${news.message}` : ''
    const gift = shipment.giftRecipientName
    switch (news.step) {
      case ExportShipmentStatus.COLLECTING:
        return { title: 'Préparation de votre colis', buyer: `eBio récupère vos produits auprès des boutiques.${extra}`, recipient: null }
      case ExportShipmentStatus.PACKED:
        return { title: 'Colis emballé', buyer: `Tous vos produits sont réunis : votre colis est emballé.${extra}`, recipient: null }
      case ExportShipmentStatus.DROPPED_AT_AGENCY:
        return { title: 'Colis remis à l\'agence', buyer: `Votre colis a été déposé chez ${agency}.${extra}`, recipient: `Le colis que ${sender} vous envoie a été déposé chez ${agency}.${extra}` }
      case ExportShipmentStatus.DEPARTED:
        return { title: 'Colis parti', buyer: `Votre colis est parti vers la ${country}. Arrivée estimée ${arrival}.${extra}`, recipient: `Le colis que ${sender} vous envoie est parti. Arrivée estimée ${arrival}.${extra}` }
      case ExportShipmentStatus.ARRIVED:
        return { title: 'Colis arrivé', buyer: `Votre colis est arrivé en ${country}.${extra}`, recipient: `Le colis que ${sender} vous envoie est arrivé en ${country}.${extra}` }
      case ExportShipmentStatus.READY_FOR_PICKUP: {
        const where = news.pickupPoint ? ` : ${agency}, ${news.pickupPoint}` : ` chez ${agency}`
        return {
          title: 'Colis disponible au retrait',
          buyer: gift ? `Le colis offert à ${gift} est disponible au retrait${where}.${extra}` : `Votre colis est disponible au retrait${where}.${extra}`,
          recipient: `Le colis que ${sender} vous envoie est disponible au retrait${where}. Présentez-vous à votre nom avec une pièce d'identité.${extra}`,
        }
      }
      case ExportShipmentStatus.OUT_FOR_DELIVERY:
        return { title: 'Colis en livraison', buyer: `Votre colis est en cours de livraison à l'adresse indiquée.${extra}`, recipient: `Le colis que ${sender} vous envoie est en cours de livraison.${extra}` }
      case ExportShipmentStatus.HANDED_OVER:
        return {
          title: 'Colis remis',
          buyer: gift ? `${gift} a reçu le colis que vous avez offert. Merci d'avoir partagé le terroir béninois !${extra}` : `Votre colis vous a été remis. Bonne dégustation !${extra}`,
          recipient: null,
        }
      case ExportShipmentStatus.LOST:
        return { title: 'Colis perdu', buyer: `Votre colis a été perdu pendant le transport. Nous en sommes désolés.${refunded}${extra}`, recipient: null }
      case ExportShipmentStatus.DAMAGED:
        return { title: 'Colis abîmé', buyer: `Votre colis a été abîmé pendant le transport. Nous en sommes désolés.${refunded}${extra}`, recipient: null }
      case ExportShipmentStatus.CANCELLED:
        return { title: 'Colis annulé', buyer: `Votre colis terroir est annulé : aucun produit ne peut partir.${refunded}${extra}`, recipient: null }
      default:
        return { title: 'Nouvelle information sur votre colis', buyer: news.message ?? 'Votre colis a été mis à jour.', recipient: news.message ? `${sender} vous envoie un colis : ${news.message}` : null }
    }
  }

  private async toRecipient(shipment: ExportShipment, title: string, body: string, pickupPoint: string | null, url: string): Promise<void> {
    await this.mail(shipment.giftRecipientEmail ?? null, title, {
      heading: title,
      greeting: `Bonjour ${shipment.giftRecipientName ?? ''},`.replace(' ,', ','),
      paragraphs: [body],
      pickupPoint,
      trackingUrl: url,
      buttonLabel: 'Suivre le colis',
    })
    const phone = shipment.giftRecipientPhone
    if (phone?.startsWith(BENIN_PREFIX)) {
      try {
        await this.sms.send(phone, `eBio : ${body} Suivi : ${url}`)
      }
      catch (error) {
        this.logger.error(`Terroir SMS to the recipient of ${shipment.id} failed`, error instanceof Error ? error.message : String(error))
      }
    }
  }

  private async mail(to: string | null | undefined, subject: string, data: Record<string, unknown>): Promise<void> {
    if (!to) {
      return
    }
    try {
      await this.email.sendTemplatedEmail({ to, subject, template: 'export-shipment-update', data })
    }
    catch (error) {
      this.logger.error(`Terroir e-mail « ${subject} » failed`, error instanceof Error ? error.message : String(error))
    }
  }

  private async push(userId: string, type: NotificationType, title: string, body: string, data: Record<string, unknown>): Promise<void> {
    try {
      const user = await this.em.fork().findOne(User, { id: userId })
      if (!user) {
        return
      }
      await this.notifications.send({ user, type, title, body, data, channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP] })
    }
    catch (error) {
      this.logger.error(`Terroir notification ${type} to ${userId} failed`, error instanceof Error ? error.stack : String(error))
    }
  }
}

/** « 6,2 kg ». */
function kilos(grams: number): string {
  return `${(Math.round(grams / 100) / 10).toLocaleString('fr-FR')} kg`
}

/** « 22 novembre à 14 h » in Benin time (UTC+1). */
function spokenInstant(date: Date): string {
  const benin = new Date(date.getTime() + 60 * 60 * 1000)
  return `${spokenDay(benin.toISOString().slice(0, 10))} à ${benin.getUTCHours()} h`
}
