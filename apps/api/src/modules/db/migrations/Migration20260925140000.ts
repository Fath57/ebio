import { Migration } from '@mikro-orm/migrations'

/**
 * Le titre d'une annonce devient facultatif.
 *
 * Un visuel se suffit souvent à lui-même : une affiche porte déjà son texte,
 * et lui redemander un titre obligeait à en inventer un qui s'afficherait
 * par-dessus. L'un des deux reste exigé — une annonce vide n'aurait rien à
 * montrer —, mais c'est le contrat qui le vérifie, là où la règle se lit.
 */
export class Migration20260925140000 extends Migration {
  override async up(): Promise<void> {
    this.addSql('ALTER TABLE "announcements" ALTER COLUMN "title" DROP NOT NULL')
    this.addSql('ALTER TABLE "announcement_requests" ALTER COLUMN "title" DROP NOT NULL')
  }

  override async down(): Promise<void> {
    // Remettre la contrainte rejetterait les annonces déjà publiées sans titre.
  }
}
