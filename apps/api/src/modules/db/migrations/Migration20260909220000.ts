import { Migration } from '@mikro-orm/migrations'

/**
 * Account standing (suspend / ban) on `users`, and the staff audit trail.
 */
export class Migration20260909220000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "status" varchar(20) NOT NULL DEFAULT 'ACTIVE',
      ADD COLUMN IF NOT EXISTS "status_reason" varchar(255) NULL,
      ADD COLUMN IF NOT EXISTS "suspended_until" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "status_changed_at" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "status_changed_by" varchar(255) NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "users_status_index" ON "users" ("status");`)

    this.addSql(`CREATE TABLE IF NOT EXISTS "audit_logs" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "actor_user_id" varchar(255) NOT NULL,
      "action" varchar(255) NOT NULL,
      "target_type" varchar(255) NOT NULL,
      "target_id" varchar(255) NOT NULL,
      "reason" varchar(255) NULL,
      "payload" jsonb NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
    );`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "audit_logs_actor_user_id_index" ON "audit_logs" ("actor_user_id");`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "audit_logs_target_id_index" ON "audit_logs" ("target_id");`)
  }

  override async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS "audit_logs";`)
    this.addSql(`ALTER TABLE "users"
      DROP COLUMN IF EXISTS "status",
      DROP COLUMN IF EXISTS "status_reason",
      DROP COLUMN IF EXISTS "suspended_until",
      DROP COLUMN IF EXISTS "status_changed_at",
      DROP COLUMN IF EXISTS "status_changed_by";`)
  }
}
