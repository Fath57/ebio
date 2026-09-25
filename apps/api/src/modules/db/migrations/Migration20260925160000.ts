import { Migration } from '@mikro-orm/migrations'

/**
 * Trusted devices, for signing in with a fingerprint.
 *
 * The `users` table has carried `biometricEnabled` and `biometricKey` since
 * March without a single endpoint reading them — one secret per account, in
 * clear. They are dropped here: a per-device table can be revoked one phone at
 * a time, and it stores a hash.
 */
export class Migration20260925160000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "trusted_devices" (
        "id" uuid not null default gen_random_uuid(),
        "user_id" uuid not null,
        "device_id" varchar(128) not null,
        "key_hash" varchar(64) not null,
        "label" varchar(120) not null default 'Cet appareil',
        "created_at" timestamptz not null default now(),
        "last_used_at" timestamptz null,
        "revoked_at" timestamptz null,
        constraint "trusted_devices_pkey" primary key ("id")
      );
    `)
    this.addSql(`alter table "trusted_devices" add constraint "trusted_devices_user_id_foreign" foreign key ("user_id") references "users" ("id") on delete cascade;`)
    // Every lookup is "this device, still trusted?".
    this.addSql(`create index if not exists "trusted_devices_device_id_index" on "trusted_devices" ("device_id");`)
    this.addSql(`create index if not exists "trusted_devices_user_id_index" on "trusted_devices" ("user_id");`)

    this.addSql(`alter table "users" drop column if exists "biometricEnabled";`)
    this.addSql(`alter table "users" drop column if exists "biometricKey";`)
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "users" add column if not exists "biometricEnabled" boolean not null default false;`)
    this.addSql(`alter table "users" add column if not exists "biometricKey" varchar(255) null;`)
    this.addSql(`drop table if exists "trusted_devices";`)
  }
}
