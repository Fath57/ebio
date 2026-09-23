import { Migration } from '@mikro-orm/migrations'

/**
 * L'extension `unaccent`, pour que la recherche ignore les accents.
 *
 * Le catalogue est saisi sans accents — « Tomates fraiches », « Panier de
 * legumes » — alors que la dictée vocale en met. « légumes » ne trouvait donc
 * rien, et l'assistant annonçait une rupture qui n'existait pas.
 *
 * `unaccent` est marquée *trusted* depuis PostgreSQL 13 : le propriétaire de la
 * base la crée sans être superutilisateur.
 */
export class Migration20260924001500 extends Migration {
  override async up(): Promise<void> {
    this.addSql('CREATE EXTENSION IF NOT EXISTS unaccent')
  }

  override async down(): Promise<void> {
    // Laissée en place : d'autres requêtes s'en servent déjà, et la retirer
    // ferait échouer la recherche au lieu de revenir en arrière proprement.
  }
}
