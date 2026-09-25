import { Migration } from '@mikro-orm/migrations'

/**
 * An announcement's title becomes optional.
 *
 * A poster is often enough on its own: it already carries its text, and asking
 * for a title on top forced someone to invent one that would be written over
 * it. One of the two is still required — an empty announcement would have
 * nothing to show — but the contract is what checks it, where the rule reads.
 */
export class Migration20260925140000 extends Migration {
  override async up(): Promise<void> {
    this.addSql('ALTER TABLE "announcements" ALTER COLUMN "title" DROP NOT NULL')
    this.addSql('ALTER TABLE "announcement_requests" ALTER COLUMN "title" DROP NOT NULL')
  }

  override async down(): Promise<void> {
    // Restoring the constraint would reject announcements already published
    // without a title.
  }
}
