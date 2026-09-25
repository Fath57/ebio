import { Migration } from '@mikro-orm/migrations'

/**
 * Broadcast notifications, written on purpose.
 *
 * Everything the app sent until now was a consequence — an order moved, a
 * courier accepted. Nothing let anyone address a group deliberately, with a
 * picture and a moment of their choosing, and see afterwards how far it went.
 */
export class Migration20260925180000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "notification_campaigns" (
        "id" uuid not null default gen_random_uuid(),
        "title" varchar(120) not null,
        "body" varchar(500) not null,
        "image_url" varchar(1024) null,
        "app" varchar(20) not null,
        "segment" text not null default 'ALL',
        "target_type" varchar(20) not null default 'NONE',
        "target_id" varchar(1024) null,
        "status" text not null default 'DRAFT',
        "scheduled_at" timestamptz null,
        "sent_at" timestamptz null,
        "recipients" int not null default 0,
        "sent" int not null default 0,
        "failed" int not null default 0,
        "created_by" uuid null,
        "created_at" timestamptz not null default now(),
        constraint "notification_campaigns_pkey" primary key ("id")
      );
    `)
    this.addSql(`alter table "notification_campaigns" add constraint "notification_campaigns_status_check" check ("status" in ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED'));`)
    this.addSql(`alter table "notification_campaigns" add constraint "notification_campaigns_segment_check" check ("segment" in ('ALL', 'ACTIVE', 'NEVER_ORDERED', 'LAPSED', 'WITH_CART'));`)
    this.addSql(`alter table "notification_campaigns" add constraint "notification_campaigns_created_by_foreign" foreign key ("created_by") references "users" ("id") on delete set null;`)
    // The only scan: what is due to go out.
    this.addSql(`create index if not exists "notification_campaigns_scheduled_at_index" on "notification_campaigns" ("scheduled_at");`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "notification_campaigns";`)
  }
}
