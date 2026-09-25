import { Migration } from '@mikro-orm/migrations'

/**
 * The basket moves to the server.
 *
 * It lived on the phone alone, which was enough to buy with and wrong for
 * everything else: it did not follow its owner to another device, nobody
 * could be reminded of what they left behind, and support had nothing to look
 * at. One row per buyer, its lines beside it.
 *
 * `checkout_attempts` comes with it, and holds no product on purpose: what
 * answers "I can't order" is the refusal, not the contents.
 */
export class Migration20260925170000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "carts" (
        "id" uuid not null default gen_random_uuid(),
        "user_id" uuid not null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "reminded_at" timestamptz null,
        "reminders" int not null default 0,
        constraint "carts_pkey" primary key ("id")
      );
    `)
    // One basket per person: the constraint is the rule, not a hint.
    this.addSql(`alter table "carts" add constraint "carts_user_id_unique" unique ("user_id");`)
    this.addSql(`alter table "carts" add constraint "carts_user_id_foreign" foreign key ("user_id") references "users" ("id") on delete cascade;`)
    // Finding what has not moved in N hours is the only scan this table gets.
    this.addSql(`create index if not exists "carts_updated_at_index" on "carts" ("updated_at");`)

    this.addSql(`
      create table if not exists "cart_items" (
        "id" uuid not null default gen_random_uuid(),
        "cart_id" uuid not null,
        "product_id" uuid not null,
        "supplier_id" uuid not null,
        "product_name" varchar(200) not null,
        "unit_price" int not null,
        "quantity" int not null,
        "added_at" timestamptz not null default now(),
        constraint "cart_items_pkey" primary key ("id")
      );
    `)
    this.addSql(`alter table "cart_items" add constraint "cart_items_cart_id_foreign" foreign key ("cart_id") references "carts" ("id") on delete cascade;`)
    this.addSql(`alter table "cart_items" add constraint "cart_items_product_id_foreign" foreign key ("product_id") references "products" ("id") on delete cascade;`)
    this.addSql(`alter table "cart_items" add constraint "cart_items_supplier_id_foreign" foreign key ("supplier_id") references "suppliers" ("id") on delete cascade;`)
    this.addSql(`create index if not exists "cart_items_cart_id_index" on "cart_items" ("cart_id");`)
    this.addSql(`create index if not exists "cart_items_product_id_index" on "cart_items" ("product_id");`)

    this.addSql(`
      create table if not exists "checkout_attempts" (
        "id" uuid not null default gen_random_uuid(),
        "user_id" uuid not null,
        "kind" text not null,
        "outcome" text not null,
        "detail" varchar(300) null,
        "shop_count" int not null,
        "item_count" int not null,
        "total" int not null,
        "distance_km" real null,
        "at" timestamptz not null default now(),
        constraint "checkout_attempts_pkey" primary key ("id")
      );
    `)
    this.addSql(`alter table "checkout_attempts" add constraint "checkout_attempts_kind_check" check ("kind" in ('QUOTE', 'ORDER'));`)
    this.addSql(`alter table "checkout_attempts" add constraint "checkout_attempts_outcome_check" check ("outcome" in ('OK', 'REFUSED'));`)
    this.addSql(`alter table "checkout_attempts" add constraint "checkout_attempts_user_id_foreign" foreign key ("user_id") references "users" ("id") on delete cascade;`)
    this.addSql(`create index if not exists "checkout_attempts_user_at_index" on "checkout_attempts" ("user_id", "at" desc);`)

    // Regenerated from the TypeScript enum rather than appended to by hand: a
    // hand-edited CHECK drifts from the enum, and the drift only ever shows up
    // in production, as an insert refused for a value the code believes in.
    this.addSql(`alter table "notifications" drop constraint if exists "notifications_type_check";`)
    this.addSql(`alter table "notifications" add constraint "notifications_type_check" check ("type" in ('ORDER_PLACED', 'ORDER_ACCEPTED', 'ORDER_REJECTED', 'ORDER_READY', 'ORDER_DELIVERED', 'ORDER_CANCELLED', 'PAYMENT_RECEIVED', 'PAYMENT_RELEASED', 'DISPUTE_OPENED', 'DISPUTE_RESOLVED', 'SUPPLIER_VALIDATED', 'SUPPLIER_REJECTED', 'SUPPLIER_COMPLEMENT', 'STOCK_ALERT', 'STOCK_AVAILABLE', 'NEW_MESSAGE', 'NEW_REVIEW', 'PRODUCT_REVIEW_INVITE', 'CART_REMINDER', 'ESCROW_REMINDER', 'PROMOTIONAL', 'SYSTEM', 'DELIVERY_OFFER', 'DELIVERY_ASSIGNED', 'DELIVERY_PICKED_UP', 'DELIVERY_FAILED', 'DELIVERY_REASSIGNED', 'COURIER_VALIDATED', 'COURIER_REJECTED', 'COURIER_SUSPENDED', 'COURIER_EARNING', 'COURIER_PAYOUT', 'COURIER_RATED', 'COURIER_TIP', 'BANNER_APPROVED', 'BANNER_REJECTED'));`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "checkout_attempts";`)
    this.addSql(`drop table if exists "cart_items";`)
    this.addSql(`drop table if exists "carts";`)
  }
}
