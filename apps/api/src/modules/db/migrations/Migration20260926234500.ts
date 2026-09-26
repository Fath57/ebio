import { Migration } from '@mikro-orm/migrations'

/**
 * Products a buyer keeps aside.
 *
 * The pair is unique: keeping the same product twice means nothing, and the
 * list would show the same card twice. Both sides cascade — a deleted account
 * takes its shelf with it, and a deleted product leaves no dangling card.
 */
export class Migration20260926234500 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "favorites" (
      "id" uuid not null default gen_random_uuid(),
      "user_id" uuid not null,
      "product_id" uuid not null,
      "createdAt" timestamptz not null default now(),
      constraint "favorites_pkey" primary key ("id")
    );`)
    this.addSql(`alter table "favorites" add constraint "favorites_user_id_foreign"
      foreign key ("user_id") references "users" ("id") on delete cascade;`)
    this.addSql(`alter table "favorites" add constraint "favorites_product_id_foreign"
      foreign key ("product_id") references "products" ("id") on delete cascade;`)
    this.addSql(`alter table "favorites" add constraint "favorites_user_product_unique"
      unique ("user_id", "product_id");`)
    // Always read as "this person's shelf, newest first".
    this.addSql(`create index if not exists "favorites_user_recent_idx"
      on "favorites" ("user_id", "createdAt" desc);`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "favorites";`)
  }
}
