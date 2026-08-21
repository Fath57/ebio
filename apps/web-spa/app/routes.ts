import type { RouteConfig } from '@react-router/dev/routes'
import { index, layout, route } from '@react-router/dev/routes'

export default [
  index('features/home/home-redirect.tsx'),

  // Existing auth
  layout('features/auth/components/auth-layout.tsx', [
    route('login', 'features/auth/pages/auth-login-page.tsx'),
    route('register', 'features/auth/pages/auth-register-page.tsx'),
    route('verify-email', 'features/auth/pages/auth-verify-email-page.tsx'),
    route('forgot-password', 'features/auth/pages/auth-forgot-password-page.tsx'),
    route('reset-password', 'features/auth/pages/auth-reset-password-page.tsx'),
  ]),

  // eBio auth
  route('supplier/login', 'features/auth/pages/supplier-login-page.tsx'),
  route('admin/login', 'features/auth/pages/admin-login-page.tsx'),
  route('unauthorized', 'features/common/pages/unauthorized-page.tsx'),

  // App routes (protected via app-layout)
  layout('features/layouts/app-layout.tsx', [
    // Supplier — Catalogue
    route('catalogue', 'features/catalog/pages/catalog-page.tsx'),
    route('catalogue/nouveau', 'features/catalog/pages/product-create-page.tsx'),
    route('catalogue/:productId', 'features/catalog/pages/product-detail-page.tsx'),
    route('catalogue/:productId/modifier', 'features/catalog/pages/product-edit-page.tsx'),

    // Supplier — Commandes
    route('commandes', 'features/orders/pages/orders-page.tsx'),
    route('commandes/:orderId', 'features/orders/pages/order-detail-page.tsx'),

    // Supplier — Analytics, Notifications & Settings
    route('analytics', 'features/analytics/pages/analytics-page.tsx'),
    route('portefeuille', 'features/wallet/pages/wallet-page.tsx'),
    route('codes-promo', 'features/promo-codes/pages/supplier-promo-codes-page.tsx'),
    route('notifications', 'features/notifications/pages/notifications-page.tsx'),
    route('profil', 'features/settings/pages/profile-page.tsx'),
    route('parametres', 'features/settings/pages/settings-page.tsx'),

    // Admin routes nested in admin layout
    layout('features/layouts/admin-layout.tsx', [
      // Admin — Dashboard
      route('admin', 'features/admin/dashboard/pages/admin-dashboard-page.tsx'),

      // Admin — Validations
      route('admin/validations', 'features/admin/validation/pages/validation-page.tsx'),
      route('admin/validations/:supplierId', 'features/admin/validation/pages/validation-detail-page.tsx'),

      // Admin — Commandes
      route('admin/commandes', 'features/admin/orders/pages/admin-orders-page.tsx'),
      route('admin/commandes/:orderId', 'features/admin/orders/pages/admin-order-detail-page.tsx'),

      // Admin — Fournisseurs
      route('admin/fournisseurs', 'features/admin/suppliers/pages/admin-suppliers-page.tsx'),
      route('admin/fournisseurs/:supplierId', 'features/admin/suppliers/pages/admin-supplier-detail-page.tsx'),

      // Admin — Utilisateurs
      route('admin/utilisateurs', 'features/admin/users/pages/admin-users-page.tsx'),

      // Admin — Bannières
      route('admin/bannieres', 'features/admin/banners/pages/banners-page.tsx'),
      route('admin/bannieres/nouvelle', 'features/admin/banners/pages/banner-create-page.tsx'),
      route('admin/bannieres/:bannerId/modifier', 'features/admin/banners/pages/banner-edit-page.tsx'),

      // Admin — Moderation
      route('admin/moderation', 'features/admin/moderation/pages/moderation-page.tsx'),

      // Admin — Transactions
      route('admin/transactions', 'features/admin/transactions/pages/transactions-page.tsx'),

      route('admin/commissions', 'features/admin/commissions/pages/admin-commissions-page.tsx'),
      route('admin/reversements', 'features/admin/withdrawals/pages/admin-withdrawals-page.tsx'),
      route('admin/codes-promo', 'features/admin/promo-codes/pages/admin-promo-codes-page.tsx'),

      // Admin — Categories
      route('admin/categories', 'features/admin/categories/pages/categories-page.tsx'),
      route('admin/categories/nouveau', 'features/admin/categories/pages/category-create-page.tsx'),
      route('admin/categories/:categoryId/modifier', 'features/admin/categories/pages/category-edit-page.tsx'),

      // Admin — Site vitrine
      route('admin/site', 'features/admin/site/pages/site-page.tsx'),

      // Admin — Unites de vente
      route('admin/unites', 'features/admin/product-units/pages/product-units-page.tsx'),
      route('admin/unites/nouveau', 'features/admin/product-units/pages/product-unit-create-page.tsx'),
      route('admin/unites/:unitId/modifier', 'features/admin/product-units/pages/product-unit-edit-page.tsx'),

      // Admin — Settings & Roles
      route('admin/parametres', 'features/admin/settings/pages/admin-settings-page.tsx'),
      route('admin/roles', 'features/admin/roles/pages/roles-page.tsx'),
      route('admin/roles/nouveau', 'features/admin/roles/pages/role-create-page.tsx'),
      route('admin/roles/:roleId/modifier', 'features/admin/roles/pages/role-edit-page.tsx'),
    ]),
  ]),

  // Existing examples
  layout('features/dashboard/dashboard-page.tsx', [
    route('dashboard', 'features/examples/user-posts/user-posts-page.tsx'),
    route('dashboard/posts/new', 'features/examples/user-posts/user-post-create-page.tsx'),
    route('dashboard/posts/:userPostId/edit', 'features/examples/user-posts/user-post-edit-page.tsx'),
    route('ai', 'features/examples/ai/ai-page.tsx'),
  ]),
] satisfies RouteConfig
