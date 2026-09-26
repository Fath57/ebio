import { Migration } from '@mikro-orm/migrations'

/**
 * Partners shown on the landing page, and the context their logos are filed under.
 *
 * The list of contexts is rewritten from the TypeScript enum rather than
 * appended to: a hand-edited CHECK drifts from the enum, and that drift only
 * ever shows up in production, as an insert refused for a value the code
 * believes in.
 */
const CONTEXTS = [
  'PRODUCT_PHOTO',
  'SUPPLIER_COVER',
  'SUPPLIER_PROFILE',
  'IDENTITY_DOCUMENT',
  'BUSINESS_PROOF',
  'CHAT_ATTACHMENT',
  'VOICE_NOTE',
  'VOICE_DESCRIPTION',
  'TRAINING_CONTENT',
  'TRAINING_THUMBNAIL',
  'COMMUNITY_MEDIA',
  'CATEGORY_IMAGE',
  'BANNER_IMAGE',
  'ANNOUNCEMENT_IMAGE',
  'DELIVERY_PROOF',
  'ASSISTANT_AVATAR',
  'PARTNER_LOGO',
]

const WITHOUT_PARTNER = CONTEXTS.filter(context => context !== 'PARTNER_LOGO')

function checkOver(values: string[]): string {
  return values.map(value => `'${value}'`).join(', ')
}

export class Migration20260926230000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "landing_partners" (
      "id" uuid not null default gen_random_uuid(),
      "name" text not null,
      "logo_url" text not null,
      "is_active" boolean not null default true,
      "sort_order" int not null default 0,
      "createdAt" timestamptz not null default now(),
      "updatedAt" timestamptz not null default now(),
      constraint "landing_partners_pkey" primary key ("id")
    );`)
    // Read in display order on every landing page load.
    this.addSql(`create index if not exists "landing_partners_order_idx" on "landing_partners" ("is_active", "sort_order");`)

    this.addSql(`alter table "media" drop constraint if exists "media_context_check";`)
    this.addSql(`alter table "media" add constraint "media_context_check" check ("context" in (${checkOver(CONTEXTS)}));`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "landing_partners";`)
    // A logo already filed under the new context would fail the old check.
    this.addSql(`update "media" set "context" = 'BANNER_IMAGE' where "context" = 'PARTNER_LOGO';`)
    this.addSql(`alter table "media" drop constraint if exists "media_context_check";`)
    this.addSql(`alter table "media" add constraint "media_context_check" check ("context" in (${checkOver(WITHOUT_PARTNER)}));`)
  }
}
