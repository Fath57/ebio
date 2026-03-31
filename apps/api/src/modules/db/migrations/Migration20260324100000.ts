import { Migration } from '@mikro-orm/migrations'

export class Migration20260324100000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`CREATE TABLE IF NOT EXISTS "permissions" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "action" varchar(50) NOT NULL,
      "subject" varchar(50) NOT NULL,
      "conditions" jsonb NULL,
      "description" varchar(255) NULL,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "permissions_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "permissions_action_subject_unique" UNIQUE ("action", "subject")
    );`)

    this.addSql(`CREATE TABLE IF NOT EXISTS "roles" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "name" varchar(50) NOT NULL,
      "description" varchar(255) NULL,
      "is_default" boolean NOT NULL DEFAULT false,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      "updated_at" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "roles_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "roles_name_unique" UNIQUE ("name")
    );`)

    this.addSql(`CREATE TABLE IF NOT EXISTS "role_permissions" (
      "role_id" uuid NOT NULL REFERENCES "roles" ("id") ON DELETE CASCADE,
      "permission_id" uuid NOT NULL REFERENCES "permissions" ("id") ON DELETE CASCADE,
      CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id", "permission_id")
    );`)

    this.addSql(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role_id" uuid NULL REFERENCES "roles" ("id") ON DELETE SET NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "users_role_id_idx" ON "users" ("role_id");`)
  }

  override async down(): Promise<void> {
    this.addSql(`ALTER TABLE "users" DROP COLUMN IF EXISTS "role_id";`)
    this.addSql(`DROP TABLE IF EXISTS "role_permissions";`)
    this.addSql(`DROP TABLE IF EXISTS "roles";`)
    this.addSql(`DROP TABLE IF EXISTS "permissions";`)
  }
}
