import { Migration } from '@mikro-orm/migrations'

/**
 * Le compte des essais sur un code à usage unique.
 *
 * Six chiffres valables cinq minutes, sans limite d'essais, se devinent : un
 * code de connexion ou de réinitialisation ouvrait le compte de qui avait le
 * numéro. Chaque essai est désormais compté sur la ligne du code, et le code
 * meurt au cinquième.
 */
export class Migration20261001120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`ALTER TABLE "verification" ADD COLUMN IF NOT EXISTS "attempts" int NOT NULL DEFAULT 0;`)
  }

  override async down(): Promise<void> {
    this.addSql(`ALTER TABLE "verification" DROP COLUMN IF EXISTS "attempts";`)
  }
}
