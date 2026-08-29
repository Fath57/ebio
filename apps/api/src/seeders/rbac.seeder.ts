/* eslint-disable no-console */
import type { Dictionary } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/core'
import { Seeder } from '@mikro-orm/seeder'

const PERMISSIONS = [
  { action: 'create', subject: 'Product', description: 'Creer un produit' },
  { action: 'read', subject: 'Product', description: 'Voir les produits' },
  { action: 'update', subject: 'Product', description: 'Modifier un produit' },
  { action: 'delete', subject: 'Product', description: 'Supprimer un produit' },
  { action: 'create', subject: 'Order', description: 'Passer une commande' },
  { action: 'read', subject: 'Order', description: 'Voir les commandes' },
  { action: 'update', subject: 'Order', description: 'Modifier le statut d\'une commande' },
  { action: 'delete', subject: 'Order', description: 'Annuler une commande' },
  { action: 'create', subject: 'Payment', description: 'Initier un paiement' },
  { action: 'read', subject: 'Payment', description: 'Voir les paiements' },
  { action: 'manage', subject: 'Payment', description: 'Gerer les paiements (escrow, remboursement)' },
  { action: 'create', subject: 'Supplier', description: 'S\'inscrire comme fournisseur' },
  { action: 'read', subject: 'Supplier', description: 'Voir les fournisseurs' },
  { action: 'update', subject: 'Supplier', description: 'Modifier un profil fournisseur' },
  { action: 'manage', subject: 'Supplier', description: 'Valider/suspendre des fournisseurs' },
  { action: 'read', subject: 'User', description: 'Voir les utilisateurs' },
  { action: 'update', subject: 'User', description: 'Modifier un profil utilisateur' },
  { action: 'manage', subject: 'User', description: 'Gerer les utilisateurs' },
  { action: 'create', subject: 'Review', description: 'Laisser un avis' },
  { action: 'read', subject: 'Review', description: 'Voir les avis' },
  { action: 'delete', subject: 'Review', description: 'Supprimer un avis (moderation)' },
  { action: 'create', subject: 'Conversation', description: 'Creer une conversation' },
  { action: 'read', subject: 'Conversation', description: 'Voir les conversations' },
  { action: 'create', subject: 'Message', description: 'Envoyer un message' },
  { action: 'read', subject: 'Message', description: 'Lire les messages' },
  { action: 'read', subject: 'CommunityGroup', description: 'Voir les groupes' },
  { action: 'manage', subject: 'CommunityGroup', description: 'Gerer les groupes' },
  { action: 'create', subject: 'Publication', description: 'Publier dans un groupe' },
  { action: 'read', subject: 'Publication', description: 'Voir les publications' },
  { action: 'delete', subject: 'Publication', description: 'Supprimer une publication (moderation)' },
  { action: 'read', subject: 'TrainingModule', description: 'Acceder aux formations' },
  { action: 'manage', subject: 'TrainingModule', description: 'Gerer les formations' },
  { action: 'read', subject: 'Notification', description: 'Voir ses notifications' },
  { action: 'manage', subject: 'Notification', description: 'Envoyer des notifications broadcast' },
  { action: 'read', subject: 'Category', description: 'Voir les categories' },
  { action: 'manage', subject: 'Category', description: 'Gerer les categories' },
  { action: 'read', subject: 'ContentReport', description: 'Voir les signalements' },
  { action: 'manage', subject: 'ContentReport', description: 'Gerer les signalements' },
  { action: 'read', subject: 'Badge', description: 'Voir les badges' },
  { action: 'manage', subject: 'Badge', description: 'Attribuer/retirer des badges' },
  { action: 'create', subject: 'CourierProfile', description: 'Deposer une candidature livreur' },
  { action: 'read', subject: 'CourierProfile', description: 'Voir son profil livreur' },
  { action: 'update', subject: 'CourierProfile', description: 'Modifier son profil livreur (disponibilite, position)' },
  { action: 'manage', subject: 'CourierProfile', description: 'Valider/suspendre des livreurs' },
  { action: 'read', subject: 'Delivery', description: 'Voir les courses' },
  { action: 'update', subject: 'Delivery', description: 'Accepter et faire progresser une course' },
  { action: 'manage', subject: 'Delivery', description: 'Superviser les livraisons' },
  { action: 'manage', subject: 'all', description: 'Acces complet a toute la plateforme' },
]

const ROLES = [
  {
    name: 'BUYER',
    description: 'Acheteur -- recherche, commande, notation',
    isDefault: true,
    permissions: [
      'read:Product',
      'read:Supplier',
      'read:Category',
      'create:Order',
      'read:Order',
      'update:Order',
      'create:Payment',
      'read:Payment',
      'create:Conversation',
      'read:Conversation',
      'create:Message',
      'read:Message',
      'create:Review',
      'read:Review',
      'read:CommunityGroup',
      'create:Publication',
      'read:Publication',
      'read:TrainingModule',
      'read:Notification',
      'read:Badge',
      'read:Delivery',
      'create:CourierProfile',
      'read:CourierProfile',
    ],
  },
  {
    name: 'SUPPLIER',
    description: 'Fournisseur -- catalogue, commandes, chat, analytics',
    isDefault: false,
    permissions: [
      'create:Product',
      'read:Product',
      'update:Product',
      'delete:Product',
      'read:Supplier',
      'update:Supplier',
      'read:Order',
      'update:Order',
      'create:Conversation',
      'read:Conversation',
      'create:Message',
      'read:Message',
      'read:Review',
      'read:CommunityGroup',
      'create:Publication',
      'read:Publication',
      'read:TrainingModule',
      'read:Notification',
      'read:Badge',
      'read:Category',
      'read:Delivery',
      'update:Delivery',
    ],
  },
  {
    name: 'COURIER',
    description: 'Livreur -- courses, itineraires, preuves de livraison',
    isDefault: false,
    permissions: [
      'read:Order',
      'read:Delivery',
      'update:Delivery',
      'read:CourierProfile',
      'update:CourierProfile',
      'read:Supplier',
      'create:Conversation',
      'read:Conversation',
      'create:Message',
      'read:Message',
      'read:Notification',
    ],
  },
  {
    name: 'MODERATOR',
    description: 'Moderateur -- moderation de contenu, signalements',
    isDefault: false,
    permissions: [
      'read:Product',
      'read:Supplier',
      'read:Category',
      'read:Order',
      'read:Review',
      'delete:Review',
      'read:CommunityGroup',
      'read:Publication',
      'delete:Publication',
      'read:ContentReport',
      'manage:ContentReport',
      'read:Notification',
      'read:Badge',
      'read:Message',
      'read:Conversation',
    ],
  },
  {
    name: 'ADMIN',
    description: 'Administrateur -- acces complet a toute la plateforme',
    isDefault: false,
    permissions: ['manage:all'],
  },
]

export class RbacSeeder extends Seeder {
  async run(em: EntityManager, _context: Dictionary): Promise<void> {
    for (const perm of PERMISSIONS) {
      await em.getConnection().execute(
        `INSERT INTO permissions (id, action, subject, description, created_at)
         VALUES (gen_random_uuid(), ?, ?, ?, NOW())
         ON CONFLICT (action, subject) DO NOTHING`,
        [perm.action, perm.subject, perm.description],
      )
    }
    console.info(`Seeded ${PERMISSIONS.length} permissions`)

    for (const roleDef of ROLES) {
      await em.getConnection().execute(
        `INSERT INTO roles (id, name, description, is_default, created_at, updated_at)
         VALUES (gen_random_uuid(), ?, ?, ?, NOW(), NOW())
         ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description, is_default = EXCLUDED.is_default`,
        [roleDef.name, roleDef.description, roleDef.isDefault],
      )

      const roleRows = await em.getConnection().execute(
        `SELECT id FROM roles WHERE name = ?`,
        [roleDef.name],
      )
      const roleId = roleRows[0]?.id
      if (!roleId)
        continue

      await em.getConnection().execute(
        `DELETE FROM roles_permissions WHERE role_id = ?`,
        [roleId],
      )

      for (const permKey of roleDef.permissions) {
        const [action, subject] = permKey.split(':')
        await em.getConnection().execute(
          `INSERT INTO roles_permissions (role_id, permission_id)
           SELECT ?, p.id FROM permissions p WHERE p.action = ? AND p.subject = ?
           ON CONFLICT DO NOTHING`,
          [roleId, action, subject],
        )
      }
    }
    console.info(`Seeded ${ROLES.length} roles with permissions`)
  }
}
