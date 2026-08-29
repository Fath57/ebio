import { Migration } from '@mikro-orm/migrations'

/** Device tokens remember which eBio app registered them (push routing). */
export class Migration20260829400000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`ALTER TABLE "device_tokens" ADD COLUMN IF NOT EXISTS "app" varchar(16) NULL;`)
  }

  override async down(): Promise<void> {
    this.addSql(`ALTER TABLE "device_tokens" DROP COLUMN IF EXISTS "app";`)
  }
}
