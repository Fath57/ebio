import { Migration } from '@mikro-orm/migrations'

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
]

/**
 * Back-office courier assignment journals an ASSIGNED_BY_ADMIN event; the
 * delivery_events type CHECK still listed the original enum. Rebuilt with
 * the full list, same approach as the notifications CHECK.
 */
export class Migration20260909180000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`ALTER TABLE "delivery_events" DROP CONSTRAINT IF EXISTS "delivery_events_type_check";`)
    this.addSql(`ALTER TABLE "delivery_events" ADD CONSTRAINT "delivery_events_type_check"
      CHECK ("type" IN (${DELIVERY_EVENT_TYPES.map(t => `'${t}'`).join(', ')}));`)
  }

  override async down(): Promise<void> {
    // Keep the widened constraint: narrowing it back would reject existing rows.
  }
}
