import { Migration } from '@mikro-orm/migrations'

/**
 * La trace de l'acceptation des conditions.
 *
 * L'écran d'inscription portait déjà la case à cocher, mais elle ne quittait
 * jamais le téléphone : elle désactivait le bouton et rien d'autre. En cas de
 * contestation, il n'y avait rien à produire.
 */
export class Migration20260925100000 extends Migration {
  override async up(): Promise<void> {
    this.addSql('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "terms_accepted_at" timestamptz NULL')
    this.addSql('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "terms_accepted_from" varchar(32) NULL')
    this.addSql('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "terms_version" varchar(32) NULL')
  }

  override async down(): Promise<void> {
    // Supprimer ces colonnes reviendrait à détruire la preuve.
  }
}
