import { Migration } from '@mikro-orm/migrations'

/**
 * The ledger learns about runs.
 *
 * A run is settled once, on its own fee: the orders of a unified cart carry 0,
 * so a per-order settlement would pay the courier nothing. Hence a key saying
 * "this entry settles that run", and it is what makes the settlement
 * replayable without paying twice.
 *
 * Plain uuid, no foreign key, exactly like `delivery_id`: the wallet module
 * does not import the deliveries module, and that is deliberate.
 */
export class Migration20260922140000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`ALTER TABLE "wallet_transactions" ADD COLUMN IF NOT EXISTS "delivery_run_id" uuid NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "wallet_transactions_run_idx"
      ON "wallet_transactions" ("delivery_run_id");`)

    // The handover code belongs to the run: one handover, one code, whatever
    // the number of shops collected from.
    this.addSql(`ALTER TABLE "delivery_runs"
      ADD COLUMN IF NOT EXISTS "confirmation_code" varchar(4) NULL,
      ADD COLUMN IF NOT EXISTS "collecting_at" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "delivering_at" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "delivered_at" timestamptz NULL;`)
  }

  override async down(): Promise<void> {
    this.addSql(`ALTER TABLE "delivery_runs"
      DROP COLUMN IF EXISTS "confirmation_code",
      DROP COLUMN IF EXISTS "collecting_at",
      DROP COLUMN IF EXISTS "delivering_at",
      DROP COLUMN IF EXISTS "delivered_at";`)
    this.addSql(`DROP INDEX IF EXISTS "wallet_transactions_run_idx";`)
    this.addSql(`ALTER TABLE "wallet_transactions" DROP COLUMN IF EXISTS "delivery_run_id";`)
  }
}
