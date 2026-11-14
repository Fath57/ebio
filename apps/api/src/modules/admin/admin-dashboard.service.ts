import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable } from '@nestjs/common'
import { DEFAULT_TIMEZONE } from '../suppliers/supplier.entity'

export const DASHBOARD_PERIODS = ['7d', '30d', '90d', 'month'] as const
export type DashboardPeriod = typeof DASHBOARD_PERIODS[number]

/** A measure over the period, and the same measure over the period just before it. */
export interface DashboardMeasure {
  value: number
  previous: number
}

export interface DashboardDay {
  /** Local calendar day (Africa/Porto-Novo), `YYYY-MM-DD`. */
  date: string
  orders: number
  gmv: number
}

export interface DashboardTopSupplier {
  id: string
  shopName: string
  orders: number
  gmv: number
}

export interface DashboardOverview {
  period: { key: DashboardPeriod, from: string, to: string }
  kpis: {
    /** Order value of every order that went through (paid, not cancelled). */
    gmv: DashboardMeasure
    orders: DashboardMeasure
    /** Commission on the period's orders that reached the buyer. */
    commission: DashboardMeasure
    newBuyers: DashboardMeasure
    /** Cancelled share of the orders placed, 0 to 1. */
    cancellationRate: DashboardMeasure
  }
  daily: DashboardDay[]
  topSuppliers: DashboardTopSupplier[]
  platform: { validatedSuppliers: number, validatedCouriers: number, buyers: number }
}

/** Reads the `period` query; anything unknown falls back to the last 30 days. */
export function parseDashboardPeriod(value?: string): DashboardPeriod {
  return (DASHBOARD_PERIODS as readonly string[]).includes(value ?? '') ? value as DashboardPeriod : '30d'
}

/**
 * Days a rolling period spans, today included; `null` for the calendar month,
 * whose start is the 1st and whose comparison is the month before.
 */
export function rollingDays(period: DashboardPeriod): number | null {
  if (period === '7d')
    return 7
  if (period === '30d')
    return 30
  if (period === '90d')
    return 90
  return null
}

/** An order counts once it is paid and not cancelled: what a shop actually sold. */
const COUNTED = `o.status NOT IN ('PENDING_PAYMENT', 'CANCELLED')`

interface Window {
  from: Date
  to: Date
  previousFrom: Date
  previousTo: Date
  /** Local calendar days, for the daily series. */
  fromDay: string
  toDay: string
}

/**
 * Figures of the back-office home.
 *
 * Every period is cut on local days (Africa/Porto-Novo), and is compared with
 * the stretch of the same length just before it, the month to date against
 * the same days of last month, so a trend never compares a full week with
 * three days.
 */
@Injectable()
export class AdminDashboardService {
  constructor(private readonly em: EntityManager) {}

  async getOverview(period: DashboardPeriod): Promise<DashboardOverview> {
    const window = await this.resolveWindow(period)
    const connection = this.em.getConnection()
    const bounds = [window.from, window.to, window.previousFrom, window.previousTo]

    const [orderRows, buyerRows, dailyRows, topRows, platformRows] = await Promise.all([
      connection.execute(
        `SELECT CASE WHEN o."createdAt" >= ? THEN 'current' ELSE 'previous' END AS bucket,
                COUNT(*) FILTER (WHERE ${COUNTED}) AS orders,
                COALESCE(SUM(o.total_amount) FILTER (WHERE ${COUNTED}), 0) AS gmv,
                COALESCE(SUM(o.commission_amount) FILTER (WHERE o.status = 'DELIVERED'), 0) AS commission,
                COUNT(*) FILTER (WHERE o.status = 'CANCELLED') AS cancelled,
                COUNT(*) FILTER (WHERE o.status <> 'PENDING_PAYMENT') AS placed
         FROM orders o
         WHERE (o."createdAt" >= ? AND o."createdAt" < ?) OR (o."createdAt" >= ? AND o."createdAt" < ?)
         GROUP BY 1`,
        [window.from, ...bounds],
      ) as Promise<Array<Record<string, unknown>>>,
      connection.execute(
        `SELECT CASE WHEN u."createdAt" >= ? THEN 'current' ELSE 'previous' END AS bucket, COUNT(*) AS count
         FROM users u
         WHERE u.role = 'BUYER'
           AND ((u."createdAt" >= ? AND u."createdAt" < ?) OR (u."createdAt" >= ? AND u."createdAt" < ?))
         GROUP BY 1`,
        [window.from, ...bounds],
      ) as Promise<Array<Record<string, unknown>>>,
      connection.execute(
        `SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
                COUNT(o.id) AS orders,
                COALESCE(SUM(o.total_amount), 0) AS gmv
         FROM generate_series(?::date, ?::date, interval '1 day') AS d(day)
         LEFT JOIN orders o
           ON (o."createdAt" AT TIME ZONE ?)::date = d.day::date AND ${COUNTED}
         GROUP BY d.day
         ORDER BY d.day`,
        [window.fromDay, window.toDay, DEFAULT_TIMEZONE],
      ) as Promise<Array<Record<string, unknown>>>,
      connection.execute(
        `SELECT s.id, s.shop_name, COUNT(o.id) AS orders, COALESCE(SUM(o.total_amount), 0) AS gmv
         FROM orders o
         JOIN suppliers s ON s.id = o.supplier_id
         WHERE ${COUNTED} AND o."createdAt" >= ? AND o."createdAt" < ?
         GROUP BY s.id, s.shop_name
         ORDER BY gmv DESC
         LIMIT 5`,
        [window.from, window.to],
      ) as Promise<Array<Record<string, unknown>>>,
      connection.execute(
        `SELECT (SELECT COUNT(*) FROM suppliers WHERE validation_status = 'VALIDATED') AS suppliers,
                (SELECT COUNT(*) FROM courier_profiles WHERE validation_status = 'VALIDATED') AS couriers,
                (SELECT COUNT(*) FROM users WHERE role = 'BUYER') AS buyers`,
      ) as Promise<Array<Record<string, unknown>>>,
    ])

    const current = orderRows.find(row => row.bucket === 'current') ?? {}
    const previous = orderRows.find(row => row.bucket === 'previous') ?? {}
    const measure = (key: string): DashboardMeasure => ({
      value: Number(current[key] ?? 0),
      previous: Number(previous[key] ?? 0),
    })
    const rate = (row: Record<string, unknown>) => {
      const placed = Number(row.placed ?? 0)
      return placed > 0 ? Number(row.cancelled ?? 0) / placed : 0
    }
    const buyers = (bucket: string) => Number(buyerRows.find(row => row.bucket === bucket)?.count ?? 0)
    const platform = platformRows[0] ?? {}

    return {
      period: { key: period, from: window.from.toISOString(), to: window.to.toISOString() },
      kpis: {
        gmv: measure('gmv'),
        orders: measure('orders'),
        commission: measure('commission'),
        newBuyers: { value: buyers('current'), previous: buyers('previous') },
        cancellationRate: { value: rate(current), previous: rate(previous) },
      },
      daily: dailyRows.map(row => ({
        date: String(row.date),
        orders: Number(row.orders ?? 0),
        gmv: Number(row.gmv ?? 0),
      })),
      topSuppliers: topRows.map(row => ({
        id: String(row.id),
        shopName: String(row.shop_name ?? ''),
        orders: Number(row.orders ?? 0),
        gmv: Number(row.gmv ?? 0),
      })),
      platform: {
        validatedSuppliers: Number(platform.suppliers ?? 0),
        validatedCouriers: Number(platform.couriers ?? 0),
        buyers: Number(platform.buyers ?? 0),
      },
    }
  }

  /**
   * Cuts the period on local midnights in SQL, where the time zone arithmetic
   * is exact; the previous window has the same length, shifted back by the
   * period (a month for the calendar month).
   */
  private async resolveWindow(period: DashboardPeriod): Promise<Window> {
    const days = rollingDays(period)
    const rows = await this.em.getConnection().execute(
      `WITH local AS (SELECT (now() AT TIME ZONE ?) AS now_local),
            bounds AS (
              SELECT now_local,
                     CASE WHEN ?::int IS NULL THEN date_trunc('month', now_local)
                          ELSE date_trunc('day', now_local) - make_interval(days => ?::int - 1) END AS from_local,
                     CASE WHEN ?::int IS NULL THEN interval '1 month' ELSE make_interval(days => ?::int) END AS shift
              FROM local
            )
       SELECT from_local AT TIME ZONE ? AS from_at,
              now() AS to_at,
              (from_local - shift) AT TIME ZONE ? AS previous_from_at,
              (from_local - shift + (now_local - from_local)) AT TIME ZONE ? AS previous_to_at,
              to_char(from_local, 'YYYY-MM-DD') AS from_day,
              to_char(now_local, 'YYYY-MM-DD') AS to_day
       FROM bounds`,
      [DEFAULT_TIMEZONE, days, days, days, days, DEFAULT_TIMEZONE, DEFAULT_TIMEZONE, DEFAULT_TIMEZONE],
    ) as Array<Record<string, unknown>>
    const row = rows[0] ?? {}
    return {
      from: new Date(row.from_at as string | Date),
      to: new Date(row.to_at as string | Date),
      previousFrom: new Date(row.previous_from_at as string | Date),
      previousTo: new Date(row.previous_to_at as string | Date),
      fromDay: String(row.from_day),
      toDay: String(row.to_day),
    }
  }
}
