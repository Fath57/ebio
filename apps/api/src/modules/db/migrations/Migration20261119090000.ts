import { Migration } from '@mikro-orm/migrations'

/** The five tables whose `country` named a hard-coded destination. */
const COUNTRY_TABLES = [
  'export_pickup_points',
  'export_departure_rates',
  'export_departure_alerts',
  'export_checkout_drafts',
  'export_shipments',
]

/**
 * 011: destination countries become data. `export_countries` is edited in
 * the back office (name, « vers la France » / « en France » wordings,
 * display currency, order, on or off); the `country` columns lose their
 * CHECK (FR, BE) for a foreign key. A country is never deleted (RESTRICT);
 * fixing a code cascades. Idempotent: replayed by the prod SQL script.
 */
export class Migration20261119090000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`CREATE TABLE IF NOT EXISTS "export_countries" (
      "code" varchar(2) NOT NULL,
      "name" varchar(80) NOT NULL,
      "to_phrase" varchar(120) NOT NULL,
      "in_phrase" varchar(120) NOT NULL,
      "display_currency" varchar(3) NOT NULL DEFAULT 'EUR',
      "flag_emoji" varchar(16) NULL,
      "sort_order" int NOT NULL DEFAULT 0,
      "is_active" boolean NOT NULL DEFAULT true,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      "updated_at" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "export_countries_pkey" PRIMARY KEY ("code")
    );`)
    this.addSql(`ALTER TABLE "export_countries" DROP CONSTRAINT IF EXISTS "export_countries_code_check";`)
    this.addSql(`ALTER TABLE "export_countries" ADD CONSTRAINT "export_countries_code_check" CHECK ("code" ~ '^[A-Z]{2}$');`)
    this.addSql(`INSERT INTO "export_countries" ("code", "name", "to_phrase", "in_phrase", "display_currency", "flag_emoji", "sort_order", "is_active")
      VALUES ('FR', 'France', 'vers la France', 'en France', 'EUR', '🇫🇷', 10, true),
             ('BE', 'Belgique', 'vers la Belgique', 'en Belgique', 'EUR', '🇧🇪', 20, true)
      ON CONFLICT ("code") DO NOTHING;`)

    for (const table of COUNTRY_TABLES) {
      this.addSql(`ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${table}_country_check";`)
      this.addSql(`ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${table}_country_foreign";`)
      this.addSql(`ALTER TABLE "${table}" ADD CONSTRAINT "${table}_country_foreign" FOREIGN KEY ("country") REFERENCES "export_countries" ("code") ON UPDATE CASCADE ON DELETE RESTRICT;`)
    }
  }

  override async down(): Promise<void> {
    for (const table of COUNTRY_TABLES) {
      this.addSql(`ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${table}_country_foreign";`)
      this.addSql(`ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${table}_country_check";`)
      this.addSql(`ALTER TABLE "${table}" ADD CONSTRAINT "${table}_country_check" CHECK ("country" IN ('FR', 'BE'));`)
    }
    this.addSql(`DROP TABLE IF EXISTS "export_countries";`)
  }
}
