import { Migration } from '@mikro-orm/migrations'

/**
 * Les sections de l'accueil, sorties du code.
 *
 * « Près de vous », « Validé eBio » et « En promotion » étaient écrites en dur
 * dans l'application : renommer l'une d'elles demandait un build et une
 * soumission au Play Store. Elles deviennent des lignes.
 *
 * Les trois existantes sont recréées à l'identique, pour que rien ne change à
 * l'écran le jour du déploiement.
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

    // Sur une base où la table existait déjà sans cette colonne.
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
