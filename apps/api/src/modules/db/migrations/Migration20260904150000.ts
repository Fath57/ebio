import { Migration } from '@mikro-orm/migrations'

/**
 * `Message.durationMs` was added with the voice notes but never migrated:
 * production still lacked `messages.duration_ms`, so every `chat:send` of a
 * voice note failed on insert and the bubble stayed on "réessayer".
 */
export class Migration20260904150000 extends Migration {
  override async up(): Promise<void> {
    this.addSql('ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "duration_ms" INT NULL;')
  }

  override async down(): Promise<void> {
    this.addSql('ALTER TABLE "messages" DROP COLUMN IF EXISTS "duration_ms";')
  }
}
