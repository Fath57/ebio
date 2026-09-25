import { Migration } from '@mikro-orm/migrations'

/**
 * The assistant's face gets its own media context.
 *
 * Her name and her portrait are settings now, so the portrait has to be
 * uploadable. Filing it under the banners' context would make it turn up in
 * any listing that asks for banners, which is how a face ends up on a home
 * page carousel by accident.
 *
 * The list is rewritten from the TypeScript enum rather than appended to: a
 * hand-edited CHECK drifts from the enum, and that drift only ever shows up in
 * production, as an insert refused for a value the code believes in.
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
]

const WITHOUT_AVATAR = CONTEXTS.filter(context => context !== 'ASSISTANT_AVATAR')

function checkOver(values: string[]): string {
  return values.map(value => `'${value}'`).join(', ')
}

export class Migration20260925200000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "media" drop constraint if exists "media_context_check";`)
    this.addSql(`alter table "media" add constraint "media_context_check" check ("context" in (${checkOver(CONTEXTS)}));`)
  }

  override async down(): Promise<void> {
    // A portrait already filed under the new context would fail the old check.
    this.addSql(`update "media" set "context" = 'BANNER_IMAGE' where "context" = 'ASSISTANT_AVATAR';`)
    this.addSql(`alter table "media" drop constraint if exists "media_context_check";`)
    this.addSql(`alter table "media" add constraint "media_context_check" check ("context" in (${checkOver(WITHOUT_AVATAR)}));`)
  }
}
