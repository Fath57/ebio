import { Migration } from '@mikro-orm/migrations'

/**
 * An announcement poster gets its own media context.
 *
 * It used to borrow the banner's, which also decided the crop ratio: a shop
 * paying for a portrait poster had it squeezed into 2:1 before it was even
 * sent. Its own context carries no ratio, so the artwork travels whole.
 *
 * The list is rewritten from the TypeScript enum rather than appended to:
 * a hand-edited CHECK drifts from the enum, and that drift only ever shows up
 * in production, as an insert refused for a value the code believes in.
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
]

const WITHOUT_ANNOUNCEMENT = CONTEXTS.filter(context => context !== 'ANNOUNCEMENT_IMAGE')

function checkOver(values: string[]): string {
  return values.map(value => `'${value}'`).join(', ')
}

export class Migration20260925150000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "media" drop constraint if exists "media_context_check";`)
    this.addSql(`alter table "media" add constraint "media_context_check" check ("context" in (${checkOver(CONTEXTS)}));`)
  }

  override async down(): Promise<void> {
    // Posters already filed under the new context would fail the old check.
    this.addSql(`update "media" set "context" = 'BANNER_IMAGE' where "context" = 'ANNOUNCEMENT_IMAGE';`)
    this.addSql(`alter table "media" drop constraint if exists "media_context_check";`)
    this.addSql(`alter table "media" add constraint "media_context_check" check ("context" in (${checkOver(WITHOUT_ANNOUNCEMENT)}));`)
  }
}
