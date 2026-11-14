import { Migration } from '@mikro-orm/migrations'

/** Renames a column once: replayable, and a no-op on a schema built from the entities. */
function renameColumn(table: string, from: string, to: string): string {
  return `DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = '${table}' AND column_name = '${from}')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = '${table}' AND column_name = '${to}') THEN
    ALTER TABLE "${table}" RENAME COLUMN "${from}" TO "${to}";
  END IF;
END $$;`
}

/**
 * 011: export validation becomes automatic. A product (or pack) meeting
 * every criterion is EXPORTABLE at once, INCOMPLETE otherwise; eBio only
 * withdraws (WITHDRAWN, sticky until reinstated).
 *
 * Old statuses: APPROVED and PENDING become INCOMPLETE and are recomputed by
 * the API at boot (ExportCriteriaService.onApplicationBootstrap); an approved
 * product keeps the two checks eBio ticked (French label, printed dates) as
 * the shop's declarations, and its `exportable_since` so the shop is not told
 * again. REJECTED becomes WITHDRAWN, the rejection note kept as the reason.
 * The review columns become the withdrawal's; `checklist` is left unused.
 * Idempotent: replayed by the prod SQL script.
 */
export class Migration20261121090000 extends Migration {
  override async up(): Promise<void> {
    for (const table of ['export_profiles', 'export_packs']) {
      this.addSql(`ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${table}_status_check";`)
      this.addSql(renameColumn(table, 'rejection_reason', 'withdrawn_reason'))
      this.addSql(renameColumn(table, 'reviewed_by', 'withdrawn_by'))
      this.addSql(renameColumn(table, 'reviewed_at', 'withdrawn_at'))
      this.addSql(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "missing_criteria" jsonb NOT NULL DEFAULT '[]';`)
      this.addSql(`ALTER TABLE "${table}" ALTER COLUMN "status" SET DEFAULT 'INCOMPLETE';`)
    }

    this.addSql(`ALTER TABLE "export_profiles" DROP CONSTRAINT IF EXISTS "export_profiles_label_check";`)
    this.addSql(`ALTER TABLE "export_profiles" DROP CONSTRAINT IF EXISTS "export_profiles_sizes_check";`)
    this.addSql(`ALTER TABLE "export_profiles" ALTER COLUMN "packed_weight_g" DROP NOT NULL;`)
    this.addSql(`ALTER TABLE "export_profiles" ALTER COLUMN "shelf_life_days" DROP NOT NULL;`)
    this.addSql(`ALTER TABLE "export_profiles" ADD COLUMN IF NOT EXISTS "storage" varchar(10) NULL;`)
    this.addSql(`ALTER TABLE "export_profiles" ADD COLUMN IF NOT EXISTS "allergens" varchar(500) NULL;`)
    this.addSql(`ALTER TABLE "export_profiles" ADD COLUMN IF NOT EXISTS "no_allergens" boolean NOT NULL DEFAULT false;`)
    this.addSql(`ALTER TABLE "export_profiles" ADD COLUMN IF NOT EXISTS "declares_french_label" boolean NOT NULL DEFAULT false;`)
    this.addSql(`ALTER TABLE "export_profiles" ADD COLUMN IF NOT EXISTS "declares_dates_printed" boolean NOT NULL DEFAULT false;`)
    this.addSql(`ALTER TABLE "export_profiles" ADD COLUMN IF NOT EXISTS "declares_sealed_packaging" boolean NOT NULL DEFAULT false;`)
    this.addSql(`ALTER TABLE "export_profiles" ADD COLUMN IF NOT EXISTS "exportable_since" timestamptz NULL;`)

    // Approved products: what eBio checked becomes the shop's declaration;
    // they were already on sale abroad, so no « now exportable » message.
    this.addSql(`UPDATE "export_profiles" SET
      "declares_french_label" = COALESCE(("checklist" ->> 'label_french')::boolean, false),
      "declares_dates_printed" = COALESCE(("checklist" ->> 'dates_present')::boolean, false),
      "exportable_since" = COALESCE("exportable_since", "withdrawn_at", "updated_at")
      WHERE "status" = 'APPROVED';`)
    // The approving or pending review is no withdrawal.
    for (const table of ['export_profiles', 'export_packs']) {
      this.addSql(`UPDATE "${table}" SET "withdrawn_by" = NULL, "withdrawn_at" = NULL, "withdrawn_reason" = NULL WHERE "status" IN ('APPROVED', 'PENDING');`)
      this.addSql(`UPDATE "${table}" SET "status" = 'INCOMPLETE' WHERE "status" IN ('APPROVED', 'PENDING');`)
      this.addSql(`UPDATE "${table}" SET "status" = 'WITHDRAWN', "withdrawn_at" = COALESCE("withdrawn_at", "updated_at") WHERE "status" = 'REJECTED';`)
    }

    this.addSql(`ALTER TABLE "export_profiles" ADD CONSTRAINT "export_profiles_status_check" CHECK ("status" IN ('EXPORTABLE', 'INCOMPLETE', 'WITHDRAWN'));`)
    this.addSql(`ALTER TABLE "export_packs" ADD CONSTRAINT "export_packs_status_check" CHECK ("status" IN ('EXPORTABLE', 'INCOMPLETE', 'WITHDRAWN', 'RETIRED'));`)
    this.addSql(`ALTER TABLE "export_profiles" DROP CONSTRAINT IF EXISTS "export_profiles_storage_check";`)
    this.addSql(`ALTER TABLE "export_profiles" ADD CONSTRAINT "export_profiles_storage_check" CHECK ("storage" IS NULL OR "storage" IN ('AMBIENT', 'COOL', 'FROZEN'));`)
    this.addSql(`ALTER TABLE "export_profiles" ADD CONSTRAINT "export_profiles_label_check" CHECK ("status" <> 'EXPORTABLE' OR "label_photo" IS NOT NULL);`)
    this.addSql(`ALTER TABLE "export_profiles" ADD CONSTRAINT "export_profiles_sizes_check" CHECK (
      ("packed_weight_g" IS NULL OR "packed_weight_g" > 0)
      AND ("shelf_life_days" IS NULL OR "shelf_life_days" > 0)
      AND ("length_cm" IS NULL OR "length_cm" > 0)
      AND ("width_cm" IS NULL OR "width_cm" > 0)
      AND ("height_cm" IS NULL OR "height_cm" > 0)
      AND jsonb_array_length("origin_photos") <= 3);`)
  }

  override async down(): Promise<void> {
    for (const table of ['export_profiles', 'export_packs']) {
      this.addSql(`ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${table}_status_check";`)
      this.addSql(`UPDATE "${table}" SET "status" = 'REJECTED', "withdrawn_reason" = COALESCE("withdrawn_reason", 'Retiré par eBio') WHERE "status" = 'WITHDRAWN';`)
      this.addSql(`UPDATE "${table}" SET "status" = 'APPROVED' WHERE "status" = 'EXPORTABLE';`)
      this.addSql(`UPDATE "${table}" SET "status" = 'PENDING' WHERE "status" = 'INCOMPLETE';`)
      this.addSql(`ALTER TABLE "${table}" ALTER COLUMN "status" SET DEFAULT 'PENDING';`)
      this.addSql(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "missing_criteria";`)
      this.addSql(renameColumn(table, 'withdrawn_reason', 'rejection_reason'))
      this.addSql(renameColumn(table, 'withdrawn_by', 'reviewed_by'))
      this.addSql(renameColumn(table, 'withdrawn_at', 'reviewed_at'))
    }
    this.addSql(`ALTER TABLE "export_profiles" ADD CONSTRAINT "export_profiles_status_check" CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED'));`)
    this.addSql(`ALTER TABLE "export_packs" ADD CONSTRAINT "export_packs_status_check" CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED', 'RETIRED'));`)
    this.addSql(`ALTER TABLE "export_profiles" DROP CONSTRAINT IF EXISTS "export_profiles_storage_check";`)
    this.addSql(`ALTER TABLE "export_profiles" DROP CONSTRAINT IF EXISTS "export_profiles_label_check";`)
    this.addSql(`ALTER TABLE "export_profiles" ADD CONSTRAINT "export_profiles_label_check" CHECK ("status" <> 'APPROVED' OR "label_photo" IS NOT NULL);`)
    for (const column of ['storage', 'allergens', 'no_allergens', 'declares_french_label', 'declares_dates_printed', 'declares_sealed_packaging', 'exportable_since']) {
      this.addSql(`ALTER TABLE "export_profiles" DROP COLUMN IF EXISTS "${column}";`)
    }
  }
}
