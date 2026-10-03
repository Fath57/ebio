import { Migration } from '@mikro-orm/migrations'

/**
 * The journal of operations sent to payment providers.
 *
 * One line per attempt — topup, cart payment, payout — written before the
 * provider is called, then updated each time it is asked. Additive only: the
 * running code ignores the table until it is deployed.
 */
export class Migration20261003150000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`CREATE TABLE IF NOT EXISTS "provider_transactions" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "provider" varchar(32) NOT NULL,
      "kind" text NOT NULL CHECK ("kind" IN ('TOPUP', 'CART_PAYMENT', 'PAYOUT')),
      "subject_id" uuid NOT NULL,
      "reference" text NULL,
      "amount" int NOT NULL,
      "status" text NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING', 'COMPLETED', 'FAILED', 'ABANDONED')),
      "provider_status" varchar(32) NULL,
      "failure_reason" text NULL,
      "last_checked_at" timestamptz NULL,
      "settled_at" timestamptz NULL,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      "updated_at" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "provider_transactions_pkey" PRIMARY KEY ("id")
    );`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "provider_transactions_status_created_at_index" ON "provider_transactions" ("status", "created_at");`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "provider_transactions_subject_id_index" ON "provider_transactions" ("subject_id");`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "provider_transactions_reference_index" ON "provider_transactions" ("reference");`)
  }

  override async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS "provider_transactions";`)
  }
}
