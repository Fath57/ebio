import { Migration } from '@mikro-orm/migrations'

/**
 * Who opened a campaign.
 *
 * Delivery was the only thing measured, and it says nothing: a notification
 * handed to a phone and never looked at counts the same as one that led to an
 * order. One row per person, so the campaign that someone opened four times
 * is not flattered for it.
 */
export class Migration20260925190000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "campaign_opens" (
        "id" uuid not null default gen_random_uuid(),
        "campaign_id" uuid not null,
        "user_id" uuid not null,
        "opened_at" timestamptz not null default now(),
        constraint "campaign_opens_pkey" primary key ("id")
      );
    `)
    this.addSql(`alter table "campaign_opens" add constraint "campaign_opens_unique" unique ("campaign_id", "user_id");`)
    this.addSql(`alter table "campaign_opens" add constraint "campaign_opens_campaign_id_foreign" foreign key ("campaign_id") references "notification_campaigns" ("id") on delete cascade;`)
    this.addSql(`alter table "campaign_opens" add constraint "campaign_opens_user_id_foreign" foreign key ("user_id") references "users" ("id") on delete cascade;`)
    this.addSql(`create index if not exists "campaign_opens_campaign_id_index" on "campaign_opens" ("campaign_id");`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "campaign_opens";`)
  }
}
