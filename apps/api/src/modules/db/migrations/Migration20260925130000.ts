import { Migration } from '@mikro-orm/migrations'

/**
 * Les annonces affichées à l'ouverture de l'application.
 *
 * Trois tables : l'annonce, la demande payée d'une boutique — même circuit que
 * les bannières — et ce que chaque acheteur a déjà vu, qui est ce qui empêche
 * une annonce de revenir à chaque ouverture.
 */
export class Migration20260925130000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`CREATE TABLE IF NOT EXISTS "announcements" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "title" varchar(120) NOT NULL,
      "subtitle" varchar(500) NULL,
      "image_url" varchar(1024) NULL,
      "target_type" text NOT NULL CHECK (target_type = ANY (ARRAY['SUPPLIER'::text, 'PRODUCT'::text, 'URL'::text, 'NONE'::text])),
      "target_id" varchar(1024) NULL,
      "origin" text NOT NULL CHECK (origin = ANY (ARRAY['PLATFORM'::text, 'SUPPLIER'::text])),
      "supplier_id" uuid NULL REFERENCES "suppliers" ("id"),
      "starts_at" timestamptz NOT NULL,
      "ends_at" timestamptz NOT NULL,
      "active" boolean NOT NULL DEFAULT true,
      "priority" integer NOT NULL DEFAULT 0,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    )`)

    this.addSql(`CREATE INDEX IF NOT EXISTS "announcements_live_idx"
      ON "announcements" ("active", "starts_at")`)

    this.addSql(`CREATE TABLE IF NOT EXISTS "announcement_requests" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "supplier_id" uuid NOT NULL REFERENCES "suppliers" ("id") ON DELETE CASCADE,
      "title" varchar(120) NOT NULL,
      "subtitle" varchar(500) NULL,
      "image_url" varchar(1024) NULL,
      "target_type" text NOT NULL CHECK (target_type = ANY (ARRAY['SUPPLIER'::text, 'PRODUCT'::text, 'URL'::text, 'NONE'::text])),
      "target_id" varchar(1024) NULL,
      "duration_days" integer NOT NULL,
      "price" integer NOT NULL,
      "status" text NOT NULL DEFAULT 'PENDING' CHECK (status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'REJECTED'::text, 'CANCELLED'::text])),
      "rejection_reason" varchar(500) NULL,
      "announcement_id" uuid NULL REFERENCES "announcements" ("id"),
      "paid_at" timestamptz NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now()
    )`)

    this.addSql(`CREATE INDEX IF NOT EXISTS "announcement_requests_shop_idx"
      ON "announcement_requests" ("supplier_id", "createdAt")`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "announcement_requests_status_idx"
      ON "announcement_requests" ("status")`)

    // Une ligne par couple, pas une par affichage : ce qu'on veut savoir est
    // « faut-il la remontrer ? ». La contrainte d'unicité est ce qui permet
    // l'écriture en une seule instruction.
    this.addSql(`CREATE TABLE IF NOT EXISTS "announcement_views" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "announcement_id" uuid NOT NULL REFERENCES "announcements" ("id") ON DELETE CASCADE,
      "user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
      "seen_at" timestamptz NOT NULL DEFAULT now(),
      "times" integer NOT NULL DEFAULT 1,
      CONSTRAINT "announcement_views_unique" UNIQUE ("announcement_id", "user_id")
    )`)
  }

  override async down(): Promise<void> {
    this.addSql('DROP TABLE IF EXISTS "announcement_views"')
    this.addSql('DROP TABLE IF EXISTS "announcement_requests"')
    this.addSql('DROP TABLE IF EXISTS "announcements"')
  }
}
