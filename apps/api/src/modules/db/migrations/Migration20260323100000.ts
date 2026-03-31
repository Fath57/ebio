import { Migration } from '@mikro-orm/migrations'

export class Migration20260323100000 extends Migration {
  override async up(): Promise<void> {
    // PostGIS: run manually if needed: CREATE EXTENSION IF NOT EXISTS postgis;

    // Add eBio fields to users table
    this.addSql(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "phone" varchar(20) NULL;`)
    this.addSql(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "role" varchar(20) NOT NULL DEFAULT 'BUYER';`)
    this.addSql(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "device_id" varchar(255) NULL;`)
    this.addSql(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "biometric_enabled" boolean NOT NULL DEFAULT false;`)
    this.addSql(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "biometric_key" varchar(255) NULL;`)
    this.addSql(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "last_login_at" timestamptz NULL;`)
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "user_phone_unique" ON "user" ("phone") WHERE "phone" IS NOT NULL;`)
  }

  override async down(): Promise<void> {
    this.addSql(`DROP INDEX IF EXISTS "users_phone_unique";`)
    this.addSql(`ALTER TABLE "users" DROP COLUMN IF EXISTS "phone";`)
    this.addSql(`ALTER TABLE "users" DROP COLUMN IF EXISTS "role";`)
    this.addSql(`ALTER TABLE "users" DROP COLUMN IF EXISTS "device_id";`)
    this.addSql(`ALTER TABLE "users" DROP COLUMN IF EXISTS "biometric_enabled";`)
    this.addSql(`ALTER TABLE "users" DROP COLUMN IF EXISTS "biometric_key";`)
    this.addSql(`ALTER TABLE "users" DROP COLUMN IF EXISTS "last_login_at";`)
  }
}
