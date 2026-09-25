import type { Actions, Subjects } from './casl-ability.factory'

/**
 * Single source of truth for what the back-office lets a staff member see or
 * do. The seeder and the migration insert these rows in `permissions`, the
 * guards reference the same (action, subject) pairs, and the web renders the
 * matrix section by section from `GET /admin/roles/permissions`.
 *
 * Keys are stable identifiers used for translations (`admin.team.permissions.<section>.<key>`).
 */
export interface CatalogPermission {
  key: string
  action: Actions
  subject: Subjects
  /** French description stored in the `permissions` table (admin-facing). */
  description: string
}

export interface CatalogSection {
  key: string
  permissions: CatalogPermission[]
}

export const ADMIN_PERMISSIONS_CATALOG: CatalogSection[] = [
  {
    key: 'orders',
    permissions: [
      { key: 'view', action: 'read', subject: 'Order', description: 'Voir les commandes et les litiges' },
      { key: 'manage', action: 'manage', subject: 'Order', description: 'Changer le statut d\'une commande, valider, trancher un litige' },
    ],
  },
  {
    key: 'deliveries',
    permissions: [
      { key: 'view', action: 'read', subject: 'Delivery', description: 'Voir les livraisons' },
      { key: 'manage', action: 'manage', subject: 'Delivery', description: 'Attribuer un livreur, relancer une diffusion' },
    ],
  },
  {
    key: 'suppliers',
    permissions: [
      { key: 'view', action: 'read', subject: 'Supplier', description: 'Voir les boutiques et les candidatures' },
      { key: 'manage', action: 'manage', subject: 'Supplier', description: 'Valider, refuser, suspendre une boutique, fixer sa commission' },
    ],
  },
  {
    key: 'couriers',
    permissions: [
      { key: 'view', action: 'read', subject: 'CourierProfile', description: 'Voir les livreurs' },
      { key: 'manage', action: 'manage', subject: 'CourierProfile', description: 'Valider, refuser, suspendre un livreur' },
    ],
  },
  {
    key: 'users',
    permissions: [
      { key: 'view', action: 'read', subject: 'User', description: 'Voir les utilisateurs' },
      { key: 'manage', action: 'manage', subject: 'User', description: 'Suspendre, bloquer ou réactiver un utilisateur' },
    ],
  },
  {
    key: 'payments',
    permissions: [
      { key: 'view', action: 'read', subject: 'Payment', description: 'Voir les transactions et les commissions' },
      { key: 'withdrawals', action: 'manage', subject: 'Withdrawal', description: 'Traiter les demandes de reversement' },
    ],
  },
  {
    key: 'content',
    permissions: [
      { key: 'moderation', action: 'manage', subject: 'ContentReport', description: 'Modérer les signalements' },
      { key: 'banners', action: 'manage', subject: 'Banner', description: 'Gérer les bannières' },
      { key: 'landing', action: 'manage', subject: 'LandingContent', description: 'Gérer la page d\'accueil du site' },
      { key: 'broadcast', action: 'manage', subject: 'Notification', description: 'Envoyer une notification à tous les utilisateurs' },
    ],
  },
  {
    key: 'catalog',
    permissions: [
      { key: 'products', action: 'read', subject: 'Product', description: 'Voir tous les produits' },
      { key: 'productsManage', action: 'manage', subject: 'Product', description: 'Modifier le catalogue d\'une boutique à sa place' },
      { key: 'categories', action: 'manage', subject: 'Category', description: 'Gérer les catégories' },
      { key: 'units', action: 'manage', subject: 'ProductUnit', description: 'Gérer les unités de vente' },
      { key: 'promoCodes', action: 'manage', subject: 'PromoCode', description: 'Gérer les codes promo' },
      { key: 'promotions', action: 'manage', subject: 'Promotion', description: 'Créer des promotions eBio sur les produits' },
    ],
  },
  {
    key: 'settings',
    permissions: [
      { key: 'view', action: 'read', subject: 'Settings', description: 'Voir les réglages de la plateforme' },
      { key: 'manage', action: 'manage', subject: 'Settings', description: 'Modifier les commissions et les réglages' },
    ],
  },
  {
    key: 'team',
    permissions: [
      { key: 'manage', action: 'manage', subject: 'Staff', description: 'Gérer l\'équipe et les rôles' },
    ],
  },
]

export const ALL_CATALOG_PERMISSIONS: CatalogPermission[] = ADMIN_PERMISSIONS_CATALOG.flatMap(s => s.permissions)

export function permissionKey(action: string, subject: string): string {
  return `${action}:${subject}`
}

/** Predefined staff roles shipped with the platform (name = DB `roles.name`). */
export interface StaffRoleDefinition {
  name: string
  description: string
  /** `${action}:${subject}` pairs from the catalog, or `manage:all`. */
  permissions: string[]
}

const READ_EVERYTHING = ALL_CATALOG_PERMISSIONS
  .filter(p => p.action === 'read')
  .map(p => permissionKey(p.action, p.subject))

export const STAFF_ROLES: StaffRoleDefinition[] = [
  {
    name: 'ADMIN',
    description: 'Super administrateur — tous les droits',
    permissions: ['manage:all'],
  },
  {
    name: 'OPERATIONS',
    description: 'Opérations — commandes, livraisons, livreurs, boutiques en lecture',
    permissions: [
      'read:Order',
      'manage:Order',
      'read:Delivery',
      'manage:Delivery',
      'read:CourierProfile',
      'manage:CourierProfile',
      'read:Supplier',
      'read:Product',
      'read:User',
    ],
  },
  {
    name: 'SUPPORT',
    description: 'Support — utilisateurs, commandes et litiges',
    permissions: [
      'read:Order',
      'manage:Order',
      'read:Delivery',
      'read:Supplier',
      'read:CourierProfile',
      'read:User',
      'manage:User',
      'read:Product',
    ],
  },
  {
    name: 'FINANCE',
    description: 'Finance — transactions, commissions, reversements',
    permissions: [
      'read:Payment',
      'manage:Withdrawal',
      'read:Order',
      'read:Supplier',
      'read:CourierProfile',
      'read:Settings',
    ],
  },
  {
    name: 'MODERATOR',
    description: 'Modération — signalements et contenu du site',
    permissions: [
      'manage:ContentReport',
      'manage:Banner',
      'manage:LandingContent',
      'read:Product',
      'read:Supplier',
      'read:User',
    ],
  },
  {
    name: 'READ_ONLY',
    description: 'Lecture seule — consultation de tout le back-office',
    permissions: READ_EVERYTHING,
  },
]
