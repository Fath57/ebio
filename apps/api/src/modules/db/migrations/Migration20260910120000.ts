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
  'OFFERED',
  'OFFER_DECLINED',
  'OFFER_EXPIRED',
]

/**
 * Sequential dispatch: a new run is offered to one ranked courier at a time
 * (40 s each, a few rounds) before falling back to the broadcast. Offers are
 * journaled per courier so acceptance rates can feed the ranking.
 */
export class Migration20260910120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`ALTER TABLE "deliveries"
      ADD COLUMN IF NOT EXISTS "dispatch_phase" varchar(16) NOT NULL DEFAULT 'BROADCAST',
      ADD COLUMN IF NOT EXISTS "offer_round" int NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "offered_to_courier_id" uuid NULL REFERENCES "courier_profiles" ("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "offer_expires_at" timestamptz NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "deliveries_targeted_offer_idx"
      ON "deliveries" ("offer_expires_at") WHERE "dispatch_phase" = 'TARGETED';`)

    this.addSql(`CREATE TABLE IF NOT EXISTS "delivery_offers" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      "delivery_id" uuid NOT NULL REFERENCES "deliveries" ("id") ON DELETE CASCADE,
      "courier_id" uuid NOT NULL REFERENCES "courier_profiles" ("id") ON DELETE CASCADE,
      "round" int NOT NULL,
      "score" float NULL,
      "offered_at" timestamptz NOT NULL DEFAULT now(),
      "expires_at" timestamptz NOT NULL,
      "responded_at" timestamptz NULL,
      "response" varchar(16) NULL
    );`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "delivery_offers_delivery_idx" ON "delivery_offers" ("delivery_id");`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "delivery_offers_courier_idx" ON "delivery_offers" ("courier_id", "offered_at");`)

    this.addSql(`ALTER TABLE "delivery_events" DROP CONSTRAINT IF EXISTS "delivery_events_type_check";`)
    this.addSql(`ALTER TABLE "delivery_events" ADD CONSTRAINT "delivery_events_type_check"
      CHECK ("type" IN (${DELIVERY_EVENT_TYPES.map(t => `'${t}'`).join(', ')}));`)
  }

  override async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS "delivery_offers";`)
    this.addSql(`ALTER TABLE "deliveries"
      DROP COLUMN IF EXISTS "dispatch_phase",
      DROP COLUMN IF EXISTS "offer_round",
      DROP COLUMN IF EXISTS "offered_to_courier_id",
      DROP COLUMN IF EXISTS "offer_expires_at";`)
    // The widened event CHECK stays: narrowing it back would reject existing rows.
  }
}
