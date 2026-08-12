import { Migration } from '@mikro-orm/migrations'

export class Migration20260812200000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`ALTER TABLE "suppliers" ADD COLUMN "timezone" varchar(64) NOT NULL DEFAULT 'Africa/Porto-Novo'`)
  }

  override async down(): Promise<void> {
    this.addSql(`ALTER TABLE "suppliers" DROP COLUMN "timezone"`)
  }
}
