import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, Logger } from '@nestjs/common'
import { User } from '../auth/auth.entity'
import { EmailService } from '../email/email.service'
import { NotificationChannel, NotificationType } from '../notifications/notification.entity'
import { NotificationsService } from '../notifications/notifications.service'
import { PlatformSettingsService } from '../settings/platform-settings.service'
import { spokenDay } from './terroir-texts'

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
  ) {}

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
