import { Migration } from '@mikro-orm/migrations'

/**
 * Production's `commission_rates` was created with camelCase timestamps while
 * `AdminService.updateCommissionRates` writes `updated_at`: every rate update
 * from the back-office failed there. Realigned on the snake_case shape the
 * code and the other environments use.
 */
export class Migration20260904160000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'commission_rates' AND column_name = 'createdAt') THEN
    ALTER TABLE "commission_rates" RENAME COLUMN "createdAt" TO "created_at";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'commission_rates' AND column_name = 'updatedAt') THEN
    ALTER TABLE "commission_rates" RENAME COLUMN "updatedAt" TO "updated_at";
  END IF;
END $$;`)
    this.addSql(`UPDATE "commission_rates" SET "created_at" = NOW() WHERE "created_at" IS NULL;`)
    this.addSql(`UPDATE "commission_rates" SET "updated_at" = NOW() WHERE "updated_at" IS NULL;`)
    this.addSql(`ALTER TABLE "commission_rates" ALTER COLUMN "created_at" SET DEFAULT NOW();`)
    this.addSql(`ALTER TABLE "commission_rates" ALTER COLUMN "updated_at" SET DEFAULT NOW();`)
    this.addSql(`ALTER TABLE "commission_rates" ALTER COLUMN "created_at" SET NOT NULL;`)
    this.addSql(`ALTER TABLE "commission_rates" ALTER COLUMN "updated_at" SET NOT NULL;`)
  }

  override async down(): Promise<void> {
    this.addSql(`ALTER TABLE "commission_rates" ALTER COLUMN "created_at" DROP NOT NULL;`)
    this.addSql(`ALTER TABLE "commission_rates" ALTER COLUMN "updated_at" DROP NOT NULL;`)
    this.addSql(`DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'commission_rates' AND column_name = 'created_at') THEN
    ALTER TABLE "commission_rates" RENAME COLUMN "created_at" TO "createdAt";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'commission_rates' AND column_name = 'updated_at') THEN
    ALTER TABLE "commission_rates" RENAME COLUMN "updated_at" TO "updatedAt";
  END IF;
END $$;`)
  }
}
