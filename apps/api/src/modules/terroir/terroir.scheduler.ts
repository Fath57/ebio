import { EnsureRequestContext } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { SingleInstance } from '../db/cron-lock'
import { PlatformSettingsService } from '../settings/platform-settings.service'
import { ExportDepartureStatus, ExportShipmentStatus } from './contracts/terroir.contract'
import { ExportSupplementService } from './export-supplement.service'
import { orderDeadline } from './terroir-math'
import { TerroirNotifierService } from './terroir-notifier.service'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/** The unpaid-cart reminder goes out this long before the order deadline (FR-033). */
export const DEADLINE_REMINDER_HOURS = 48

/**
 * Terroir's clock (011): weight supplements unanswered for 48 h are
 * absorbed (FR-020), parcels waiting too long at the pickup point are
 * recalled once (FR-027), unpaid terroir checkouts are reminded once 48 h
 * before their departure's order deadline (FR-033). Every job takes its
 * clock as an argument, so tests drive it.
 */
@Injectable()
export class TerroirScheduler {
  private readonly logger = new Logger(TerroirScheduler.name)

  constructor(
    private readonly em: EntityManager,
    private readonly supplements: ExportSupplementService,
    private readonly notifier: TerroirNotifierService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  @SingleInstance()
  @EnsureRequestContext()
  async hourly(): Promise<void> {
    const now = new Date()
    const waived = await this.supplements.waiveOverdue(now)
    const reminded = await this.remindDeadlines(now)
    if (waived + reminded > 0) {
      this.logger.log(`Terroir : ${waived} complément(s) pris en charge, ${reminded} rappel(s) de panier`)
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_10AM)
  @SingleInstance()
  @EnsureRequestContext()
  async daily(): Promise<void> {
    const reminded = await this.remindPickups(new Date())
    if (reminded > 0) {
      this.logger.log(`Terroir : ${reminded} rappel(s) de retrait envoyé(s)`)
    }
  }

  /**
   * Parcels at the pickup point for `export_pickup_reminder_days` since the
   * step was published: the buyer (and a gift's recipient) reminded, once.
   */
  async remindPickups(now: Date): Promise<number> {
    const { pickupReminderDays } = await this.platformSettings.getTerroirExportSettings()
    const limit = new Date(now.getTime() - pickupReminderDays * DAY_MS)
    const rows = await this.em.getConnection().execute(
      `UPDATE export_shipments s SET pickup_reminded_at = ?
       WHERE s.status = ? AND s.pickup_reminded_at IS NULL
         AND (SELECT MAX(e.created_at) FROM export_shipment_events e WHERE e.shipment_id = s.id AND e.step = ?) <= ?
       RETURNING s.id,
         (SELECT e.pickup_point_snapshot FROM export_shipment_events e
          WHERE e.shipment_id = s.id AND e.step = ? ORDER BY e.created_at DESC LIMIT 1) AS snapshot`,
      [now, ExportShipmentStatus.READY_FOR_PICKUP, ExportShipmentStatus.READY_FOR_PICKUP, limit, ExportShipmentStatus.READY_FOR_PICKUP],
    ) as Array<{ id: string, snapshot: string | null }>
    for (const row of rows) {
      await this.notifier.pickupReminder(row.id, row.snapshot)
    }
    return rows.length
  }

  /**
   * Unpaid terroir checkout previews whose departure stops taking orders
   * within 48 h: the buyer reminded, once per preview (a new preview resets
   * `reminded_at`).
   */
  async remindDeadlines(now: Date): Promise<number> {
    const { collectionDays } = await this.platformSettings.getTerroirExportSettings()
    const rows = await this.em.getConnection().execute(
      `SELECT d.user_id, d.departure_id, x.deposit_deadline, x.departs_on
       FROM export_checkout_drafts d
       JOIN export_departures x ON x.id = d.departure_id
       WHERE d.reminded_at IS NULL AND x.status = ?`,
      [ExportDepartureStatus.OPEN],
    ) as Array<{ user_id: string, departure_id: string, deposit_deadline: Date | string, departs_on: Date | string }>
    let reminded = 0
    for (const row of rows) {
      const before = orderDeadline(new Date(row.deposit_deadline), collectionDays).getTime()
      if (before <= now.getTime() || before - now.getTime() > DEADLINE_REMINDER_HOURS * HOUR_MS) {
        continue
      }
      const marked = await this.em.getConnection().execute(
        `UPDATE export_checkout_drafts SET reminded_at = ? WHERE user_id = ? AND reminded_at IS NULL RETURNING user_id`,
        [now, row.user_id],
      ) as Array<{ user_id: string }>
      if (marked.length === 0) {
        continue
      }
      await this.notifier.deadlineReminder({ userId: row.user_id, departureId: row.departure_id, departsOn: isoDay(row.departs_on) })
      reminded++
    }
    return reminded
  }
}

/** A `date` column comes back as a string or a Date depending on the driver's parser. */
function isoDay(value: Date | string): string {
  if (typeof value === 'string') {
    return value.slice(0, 10)
  }
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}
