import { Migration } from '@mikro-orm/migrations'

export class Migration20260814090000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`CREATE TABLE "banners" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "title" varchar(255) NOT NULL,
      "subtitle" varchar(255) NULL,
      "image_url" varchar(1024) NOT NULL,
      "target_type" text NOT NULL,
      "target_id" uuid NOT NULL,
      "is_active" boolean NOT NULL DEFAULT true,
      "position" int NOT NULL DEFAULT 0,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
    )`)
    // La lecture publique filtre sur is_active et trie par position.
    this.addSql(`CREATE INDEX "banners_active_position_idx" ON "banners" ("is_active", "position")`)
  }

  override async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS "banners"`)
  }
}
