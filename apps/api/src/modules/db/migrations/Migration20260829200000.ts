import { Migration } from '@mikro-orm/migrations'

/**
 * Product composition becomes queryable:
 * - allergens / labels move from free French strings to canonical codes
 *   (see products/composition.constants.ts); known legacy values are mapped,
 *   anything unrecognised is dropped (it could never have matched a filter).
 * - GIN indexes on both arrays, expression index on the energy value.
 */
export class Migration20260829200000 extends Migration {
  override async up(): Promise<void> {
    // Idempotent: codes map to themselves, so re-running is harmless.
    this.addSql(`UPDATE "products" p SET "allergens" = COALESCE((
      SELECT jsonb_agg(DISTINCT m.code)
      FROM jsonb_array_elements_text(p."allergens") AS v(value)
      JOIN (VALUES
        ('gluten', 'gluten'), ('Gluten', 'gluten'),
        ('crustacés', 'crustaceans'), ('Crustacés', 'crustaceans'), ('crustaceans', 'crustaceans'),
        ('œufs', 'eggs'), ('Œufs', 'eggs'), ('oeufs', 'eggs'), ('eggs', 'eggs'),
        ('poissons', 'fish'), ('Poissons', 'fish'), ('fish', 'fish'),
        ('arachides', 'peanuts'), ('Arachides', 'peanuts'), ('peanuts', 'peanuts'),
        ('soja', 'soy'), ('Soja', 'soy'), ('soy', 'soy'),
        ('lait', 'milk'), ('Lait', 'milk'), ('milk', 'milk'),
        ('fruits à coque', 'nuts'), ('Fruits à coque', 'nuts'), ('nuts', 'nuts'),
        ('céleri', 'celery'), ('Céleri', 'celery'), ('celery', 'celery'),
        ('moutarde', 'mustard'), ('Moutarde', 'mustard'), ('mustard', 'mustard'),
        ('sésame', 'sesame'), ('Sésame', 'sesame'), ('sesame', 'sesame'),
        ('sulfites', 'sulphites'), ('Sulfites', 'sulphites'), ('sulphites', 'sulphites'),
        ('lupin', 'lupin'), ('Lupin', 'lupin'),
        ('mollusques', 'molluscs'), ('Mollusques', 'molluscs'), ('molluscs', 'molluscs')
      ) AS m(fr, code) ON m.fr = v.value
    ), '[]'::jsonb)
    WHERE jsonb_array_length(p."allergens") > 0;`)

    this.addSql(`UPDATE "products" p SET "labels" = COALESCE((
      SELECT jsonb_agg(DISTINCT m.code)
      FROM jsonb_array_elements_text(p."labels") AS v(value)
      JOIN (VALUES
        ('Bio', 'organic'), ('bio', 'organic'), ('organic', 'organic'),
        ('Ecocert', 'ecocert'), ('ecocert', 'ecocert'),
        ('Agriculture locale', 'local'), ('local', 'local'),
        ('Commerce équitable', 'fair-trade'), ('fair-trade', 'fair-trade'),
        ('Sans OGM', 'gmo-free'), ('gmo-free', 'gmo-free'),
        ('Fait main', 'handmade'), ('handmade', 'handmade'),
        ('Artisanal', 'artisanal'), ('artisanal', 'artisanal'),
        ('Végan', 'vegan'), ('Vegan', 'vegan'), ('vegan', 'vegan'),
        ('Végétarien', 'vegetarian'), ('vegetarian', 'vegetarian'),
        ('Sans gluten', 'gluten-free'), ('gluten-free', 'gluten-free'),
        ('Sans lactose', 'lactose-free'), ('lactose-free', 'lactose-free'),
        ('Sans sucre ajouté', 'sugar-free'), ('sugar-free', 'sugar-free')
      ) AS m(fr, code) ON m.fr = v.value
    ), '[]'::jsonb)
    WHERE jsonb_array_length(p."labels") > 0;`)

    // Legacy rows were always entered per 100 g; make the basis explicit.
    this.addSql(`UPDATE "products"
      SET "nutritional_values" = "nutritional_values" || '{"basis": "100g"}'::jsonb
      WHERE "nutritional_values" IS NOT NULL AND NOT ("nutritional_values" ? 'basis');`)

    this.addSql(`CREATE INDEX IF NOT EXISTS "products_allergens_gin" ON "products" USING GIN ("allergens" jsonb_path_ops);`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "products_labels_gin" ON "products" USING GIN ("labels" jsonb_path_ops);`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "products_energy_kcal_idx"
      ON "products" ((("nutritional_values"->>'energyKcal')::numeric))
      WHERE "nutritional_values" ? 'energyKcal';`)
  }

  override async down(): Promise<void> {
    this.addSql(`DROP INDEX IF EXISTS "products_energy_kcal_idx";`)
    this.addSql(`DROP INDEX IF EXISTS "products_labels_gin";`)
    this.addSql(`DROP INDEX IF EXISTS "products_allergens_gin";`)
    // Codes stay in place: the previous free-text form cannot be rebuilt.
  }
}
