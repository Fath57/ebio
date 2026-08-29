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
  'ESCROW_REMINDER',
  'PROMOTIONAL',
  'SYSTEM',
  'DELIVERY_OFFER',
  'DELIVERY_ASSIGNED',
  'DELIVERY_PICKED_UP',
  'DELIVERY_FAILED',
  'DELIVERY_REASSIGNED',
  'COURIER_VALIDATED',
  'COURIER_REJECTED',
  'COURIER_SUSPENDED',
  'COURIER_EARNING',
  'COURIER_PAYOUT',
]

/**
 * The notifications type CHECK predates the courier types: inserting a
 * COURIER_EARNING row failed, which silently killed the courier's
 * « Course réglée » notification. Rebuilt with the full enum.
 */
export class Migration20260829600000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_type_check";`)
    this.addSql(`ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check"
      CHECK ("type" IN (${NOTIFICATION_TYPES.map(t => `'${t}'`).join(', ')}));`)
  }

  override async down(): Promise<void> {
    // Keep the widened constraint: narrowing it back would reject existing rows.
  }
}
