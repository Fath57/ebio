import { Migration } from '@mikro-orm/migrations'

const NOTIFICATION_TYPES = [
  'ORDER_PLACED',
  'ORDER_ACCEPTED',
  'ORDER_REJECTED',
  'ORDER_READY',
  'ORDER_DELIVERED',
  'ORDER_CANCELLED',
  'PAYMENT_RECEIVED',
  'PAYMENT_RELEASED',
  'DISPUTE_OPENED',
  'DISPUTE_RESOLVED',
  'SUPPLIER_VALIDATED',
  'SUPPLIER_REJECTED',
  'SUPPLIER_COMPLEMENT',
  'STOCK_ALERT',
  'STOCK_AVAILABLE',
  'NEW_MESSAGE',
  'NEW_REVIEW',
  'PRODUCT_REVIEW_INVITE',
  'CART_REMINDER',
  'ESCROW_REMINDER',
  'PROMOTIONAL',
  'SYSTEM',
  'DELIVERY_OFFER',
  'DELIVERY_ASSIGNED',
  'DELIVERY_PICKED_UP',
  'DELIVERY_FAILED',
  'DELIVERY_REASSIGNED',
  'DELIVERY_PICKUP_REMINDER',
  'DELIVERY_WINDOW_CHANGED',
  'COURIER_VALIDATED',
  'COURIER_REJECTED',
  'COURIER_SUSPENDED',
  'COURIER_EARNING',
  'COURIER_PAYOUT',
  'COURIER_RATED',
  'COURIER_TIP',
  'REFERRAL_REWARD',
  'BANNER_APPROVED',
  'BANNER_REJECTED',
]

const DELIVERY_EVENT_TYPES = [
  'CREATED',
  'BROADCAST',
  'ACCEPTED',
  'PICKED_UP',
  'IN_TRANSIT',
  'DELIVERED',
  'FAILED',
  'REASSIGNED',
  'ORDER_CANCELLED',
  'SELF_DELIVERED',
  'ASSIGNED_BY_ADMIN',
  'OFFERED',
  'OFFER_DECLINED',
  'OFFER_EXPIRED',
  'PICKUP_REMINDER',
  'WINDOW_CHANGED',
]

function quoteList(values: string[]): string {
  return values.map(value => `'${value}'`).join(', ')
}

/**
 * Delivery window as two instants, so the courier search and the pickup clock
 * can follow it, and the reminder sent before a run is taken back.
 * Additive: the running code ignores the new columns until deployed.
 */
export class Migration20261109120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_window_start" timestamptz NULL;`)
    this.addSql(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_window_end" timestamptz NULL;`)
    this.addSql(`ALTER TABLE "deliveries" ADD COLUMN IF NOT EXISTS "pickup_warned_at" timestamptz NULL;`)
    this.addSql(`ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_type_check";`)
    this.addSql(`ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check" CHECK ("type" IN (${quoteList(NOTIFICATION_TYPES)}));`)
    this.addSql(`ALTER TABLE "delivery_events" DROP CONSTRAINT IF EXISTS "delivery_events_type_check";`)
    this.addSql(`ALTER TABLE "delivery_events" ADD CONSTRAINT "delivery_events_type_check" CHECK ("type" IN (${quoteList(DELIVERY_EVENT_TYPES)}));`)
  }

  override async down(): Promise<void> {
    const previousNotifications = NOTIFICATION_TYPES.filter(type => type !== 'DELIVERY_PICKUP_REMINDER' && type !== 'DELIVERY_WINDOW_CHANGED')
    const previousEvents = DELIVERY_EVENT_TYPES.filter(type => type !== 'PICKUP_REMINDER' && type !== 'WINDOW_CHANGED')
    this.addSql(`ALTER TABLE "delivery_events" DROP CONSTRAINT IF EXISTS "delivery_events_type_check";`)
    this.addSql(`ALTER TABLE "delivery_events" ADD CONSTRAINT "delivery_events_type_check" CHECK ("type" IN (${quoteList(previousEvents)}));`)
    this.addSql(`ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_type_check";`)
    this.addSql(`ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check" CHECK ("type" IN (${quoteList(previousNotifications)}));`)
    this.addSql(`ALTER TABLE "deliveries" DROP COLUMN IF EXISTS "pickup_warned_at";`)
    this.addSql(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "delivery_window_end";`)
    this.addSql(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "delivery_window_start";`)
  }
}
