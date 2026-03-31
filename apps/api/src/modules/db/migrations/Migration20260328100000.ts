import { Migration } from '@mikro-orm/migrations'

export class Migration20260328100000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`ALTER TABLE "categories" ADD COLUMN "image_url" varchar NULL`)
  }

  override async down(): Promise<void> {
    this.addSql(`ALTER TABLE "categories" DROP COLUMN "image_url"`)
  }
}
