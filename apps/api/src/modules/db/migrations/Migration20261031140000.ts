import { Migration } from '@mikro-orm/migrations'

/**
 * The labels and certifications products can carry, until now a list fixed
 * in the code, become a table the back office manages. Seeded with that same
 * list, codes unchanged, so every product keeps its labels as they are.
 * Additive only: the running code ignores the table until it is deployed.
 */
const SEED: Array<[string, string, number]> = [
  ['organic', 'Bio', 10],
  ['ecocert', 'Ecocert', 20],
  ['local', 'Agriculture locale', 30],
  ['fair-trade', 'Commerce équitable', 40],
  ['gmo-free', 'Sans OGM', 50],
  ['handmade', 'Fait main', 60],
  ['artisanal', 'Artisanal', 70],
  ['vegan', 'Végan', 80],
  ['vegetarian', 'Végétarien', 90],
  ['gluten-free', 'Sans gluten', 100],
  ['lactose-free', 'Sans lactose', 110],
  ['sugar-free', 'Sans sucre ajouté', 120],
]

export class Migration20261031140000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`CREATE TABLE IF NOT EXISTS "certifications" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "code" varchar(64) NOT NULL,
      "name" varchar(100) NOT NULL,
      "description" text NULL,
      "logo_url" text NULL,
      "is_active" boolean NOT NULL DEFAULT true,
      "sort_order" int NOT NULL DEFAULT 0,
      "createdAt" timestamptz NOT NULL DEFAULT NOW(),
      "updatedAt" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "certifications_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "certifications_code_unique" UNIQUE ("code")
    );`)
    for (const [code, name, order] of SEED) {
      this.addSql(
        `INSERT INTO "certifications" ("code", "name", "sort_order") VALUES ('${code}', '${name.replace(/'/g, '\'\'')}', ${order}) ON CONFLICT ("code") DO NOTHING;`,
      )
    }
  }

  override async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS "certifications";`)
  }
}
