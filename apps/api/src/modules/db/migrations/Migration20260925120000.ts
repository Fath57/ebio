import { Migration } from '@mikro-orm/migrations'

/**
 * The home sections, taken out of the code.
 *
 * "Près de vous", "Validé eBio" and "En promotion" were hard-coded in the app:
 * renaming one meant a build and a Play Store submission. They become rows.
 *
 * The three existing ones are recreated identically, so nothing changes on
 * screen the day this deploys.
 */
export class Migration20260925120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`CREATE TABLE IF NOT EXISTS "home_sections" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "title" varchar(120) NOT NULL,
      "subtitle" varchar(200) NULL,
      "icon" varchar(32) NULL,
      "mode" text NOT NULL CHECK (mode = ANY (ARRAY['CRITERIA'::text, 'MANUAL'::text])),
      "criteria" jsonb NULL,
      "product_ids" jsonb NULL,
      "position" integer NOT NULL DEFAULT 0,
      "active" boolean NOT NULL DEFAULT true,
      "limit" integer NOT NULL DEFAULT 10,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    )`)

    this.addSql(`CREATE INDEX IF NOT EXISTS "home_sections_order_idx"
      ON "home_sections" ("active", "position")`)

    // For a database where the table already existed without this column.
    this.addSql('ALTER TABLE "home_sections" ADD COLUMN IF NOT EXISTS "icon" varchar(32) NULL')

    this.addSql(`INSERT INTO "home_sections" ("title", "icon", "mode", "criteria", "position")
      SELECT * FROM (VALUES
        ('Près de vous', 'map-pin', 'CRITERIA', '{"sortBy":"distance"}'::jsonb, 0),
        ('Validé eBio', 'badge-check', 'CRITERIA', '{"validatedOnly":true}'::jsonb, 1),
        ('En promotion', 'tag', 'CRITERIA', '{"promoOnly":true}'::jsonb, 2)
      ) AS seed(title, icon, mode, criteria, position)
      WHERE NOT EXISTS (SELECT 1 FROM "home_sections")`)
  }

  override async down(): Promise<void> {
    this.addSql('DROP TABLE IF EXISTS "home_sections"')
  }
}
