# Checklist de conformité aux conventions du projet

**Date**: 2026-03-26
**Objectif**: Vérifier que tout le code généré respecte les guidelines documentées dans `apps/documentation/src/content/docs/references/`

---

## 1. Web-SPA — Structure et architecture

### 1.1 Dossier source
- [ ] Tout le code applicatif est dans `app/` (PAS dans `src/`)
- [ ] Les fichiers dans `src/` sont supprimés ou déplacés dans `app/`
- [ ] `app/routes.ts` contient toutes les nouvelles routes

### 1.2 Pattern features
- [ ] Chaque feature suit la structure : `app/features/featureName/`
- [ ] Les **pages** (composants de route) sont dans `features/featureName/pages/`
- [ ] Les **formulaires** sont dans `features/featureName/forms/` et utilisent react-hook-form + zod
- [ ] Les **composants** réutilisables sont dans `features/featureName/components/`
- [ ] Les **hooks/queries** sont dans `features/featureName/utils/` ou `features/featureName/hooks/`

### 1.3 Features attendues dans app/features/
- [ ] `auth/` — pages: login fournisseur (OTP), login admin (email+2FA) ; forms: login-form, admin-login-form
- [ ] `catalog/` — pages: catalog-page ; forms: product-form ; components: product-table
- [ ] `orders/` — pages: orders-page ; components: order-detail, order-status-badge
- [ ] `analytics/` — pages: analytics-page ; components: revenue-chart, top-products
- [ ] `settings/` — pages: settings-page ; forms: shop-info-form, opening-hours-form ; components: delivery-zones, mode-selector
- [ ] `subscriptions/` — pages: subscription-page ; components: plan-card, plan-comparison
- [ ] `admin/dashboard/` — pages: admin-dashboard-page ; components: kpi-card
- [ ] `admin/validation/` — pages: validation-page ; components: validation-queue, supplier-dossier
- [ ] `admin/moderation/` — pages: moderation-page ; components: report-list
- [ ] `admin/transactions/` — pages: transactions-page ; components: transaction-table
- [ ] `admin/settings/` — pages: admin-settings-page ; forms: commission-form
- [ ] `admin/roles/` — pages: roles-page ; forms: role-form ; components: permissions-grid
- [ ] `common/` — components: unauthorized-page

### 1.4 Layout et routing
- [ ] `app/features/layouts/` contient le layout unifié (role-based: fournisseur/admin)
- [ ] `app/routes.ts` définit toutes les routes avec layout, route, index
- [ ] Routes fournisseur sous `/` (catalogue, commandes, analytics, parametres)
- [ ] Routes admin sous `/admin/` (dashboard, validations, moderation, transactions, parametres, roles)
- [ ] Route `/login` et `/admin/login` pour l'authentification
- [ ] Route `/unauthorized` pour les accès refusés

---

## 2. Web-SPA — Librairies et patterns

### 2.1 Data fetching
- [ ] Utilise TanStack Query (`useQuery`, `useMutation`) — PAS de `fetch` brut
- [ ] Les queries options sont dans `features/featureName/utils/featureName-queries.ts`
- [ ] Utilise le SDK généré `@boilerstone/openapi-generator/client/sdk.gen` pour les appels API
- [ ] Client configuré dans `app/root.tsx` via `client.setConfig()`

### 2.2 Formulaires
- [ ] Utilise `react-hook-form` pour tous les formulaires
- [ ] Utilise `zod` pour la validation (schémas importés ou créés localement)
- [ ] Les formulaires sont dans `features/featureName/forms/`

### 2.3 Composants UI
- [ ] Utilise `@boilerstone/ui` (shadcn/ui) pour les composants de base (Button, Input, Card, Dialog, etc.)
- [ ] Pas de composants HTML bruts là où shadcn fournit une alternative

### 2.4 Internationalisation
- [ ] Utilise `@boilerstone/i18n` — PAS de strings hardcodées en français dans le JSX
- [ ] Toutes les chaînes visibles passent par les clés i18n

### 2.5 RBAC / Protection
- [ ] `app/lib/casl/` contient ability.ts, ability-context.tsx, protected-route.tsx, can.tsx
- [ ] AbilityProvider wrappé dans root.tsx
- [ ] Toutes les routes protégées utilisent `<ProtectedRoute>`
- [ ] Éléments conditionnels utilisent `<Can>`

---

## 3. Backend API — Structure et conventions

### 3.1 Structure des modules
- [ ] Chaque module suit : `modules/feature-name/feature-name.module.ts`, `.controller.ts`, `.service.ts`
- [ ] Entité unique → `feature-name.entity.ts` ; multiples → `entities/`
- [ ] Contrat unique → `feature-name.contract.ts` ; multiples → `contracts/`
- [ ] Mapper présent → `feature-name.mapper.ts`
- [ ] Tous les modules sont importés dans `app.module.ts`

### 3.2 Contracts (Zod)
- [ ] Tous les schémas utilisent `.meta({ title, description })` pour OpenAPI
- [ ] Pattern base → create (extends base) → update (partial) → response
- [ ] Enums dans les contracts, PAS dans les entities
- [ ] Types exportés via `z.infer<typeof schema>` (PAS `._type`)
- [ ] Exemples dans `.meta({ examples: [...] })` pour les schémas principaux

### 3.3 Controllers
- [ ] Utilise `@TypedBody`, `@TypedParam` de `@lonestone/nzoth/server`
- [ ] Utilise `@TypedRoute.Get`, `@TypedRoute.Post` etc.
- [ ] Pas de `@Body()` de NestJS brut
- [ ] Chaque endpoint a le bon verbe HTTP (GET/POST/PUT/PATCH/DELETE)

### 3.4 Services
- [ ] Retournent des **entités** (pas des contracts) pour réutilisation inter-services
- [ ] Utilisent `EntityManager` (pas de repositories custom)
- [ ] `em.getReference()` pour les relations (PAS `ref()`, PAS `as any`)

### 3.5 Mappers
- [ ] Chaque module avec des réponses API a un mapper
- [ ] Mapper utilisé dans le controller (pas dans le service)
- [ ] Gère les collections avec `isInitialized()` + `getItems()`

### 3.6 Entities
- [ ] UUID pour les PK (`defaultRaw: 'gen_random_uuid()'`)
- [ ] `createdAt` + `updatedAt` audit fields
- [ ] `[OptionalProps]` déclaré pour les champs avec defaults
- [ ] Index définis pour les requêtes fréquentes
- [ ] Pas d'enums dans les entités — ils sont dans les contracts

### 3.7 Auth & Guards
- [ ] Utilise Better Auth pour l'authentification (PAS de JWT custom pour le web)
- [ ] CASL guard (`CaslGuard`) sur les endpoints protégés
- [ ] Decorators `@CanCreate`, `@CanRead`, `@CanUpdate`, `@CanDelete`, `@CanManage`
- [ ] `@Public()` sur les endpoints publics

### 3.8 Erreurs
- [ ] Utilise les exceptions NestJS (`NotFoundException`, `BadRequestException`, etc.)
- [ ] Messages d'erreur en français pour les erreurs métier utilisateur
- [ ] Pas de `console.log` — utilise `Logger` de NestJS

---

## 4. Style et conventions de code

### 4.1 ESLint / Formatting
- [ ] Pas de semicolons (enforced par @antfu/eslint-config)
- [ ] Single quotes
- [ ] Pas de `any` (sauf `// eslint-disable-next-line` justifié)
- [ ] Pas de `require()` — imports ES modules uniquement
- [ ] `Number.isNaN()` au lieu de `isNaN()`
- [ ] Pas de `console.log` dans le code applicatif

### 4.2 Naming
- [ ] Fichiers en kebab-case : `supplier-profile.tsx`, `order.service.ts`
- [ ] Classes en PascalCase : `SuppliersService`, `OrdersController`
- [ ] Variables/fonctions en camelCase
- [ ] Constantes en UPPER_SNAKE_CASE
- [ ] Handlers préfixés avec `handle` : `handleSubmit`, `handleClick`
- [ ] Booleans préfixés : `isLoading`, `hasError`, `canSubmit`
- [ ] Hooks préfixés : `useAuth`, `useSearch`

### 4.3 TypeScript
- [ ] `strict: true` dans tous les tsconfig
- [ ] Types déclarés pour toutes les fonctions et paramètres
- [ ] Interfaces avec préfixe `I` pour les interfaces métier
- [ ] Un export par fichier pour les composants React

---

## 5. Mobile (React Native / Expo)

### 5.1 Structure
- [ ] Code source dans `apps/mobile/src/`
- [ ] Features dans `src/features/featureName/components/`
- [ ] Theme dans `src/theme/theme.ts`
- [ ] Navigation dans `src/app/navigation.tsx`
- [ ] Utilitaires dans `src/utils/`

### 5.2 Design System
- [ ] Tous les composants utilisent les tokens de `theme.ts` (colors, fonts, spacing, radius)
- [ ] Pas de couleurs hex hardcodées dans les composants
- [ ] Hauteur minimum 44px sur tous les éléments interactifs
- [ ] `accessibilityLabel` sur les boutons sans texte visible
- [ ] Prix en JetBrains Mono, format "X XXX FCFA / unité"

### 5.3 API
- [ ] Utilise `apiFetch` (ou SDK généré quand disponible)
- [ ] Gestion des tokens JWT dans expo-secure-store
- [ ] Auto-refresh sur 401

### 5.4 RBAC
- [ ] `src/lib/casl/` contient ability, context, protected-screen, can
- [ ] AbilityProvider wrappé autour de la navigation
- [ ] Écrans protégés avec `<ProtectedScreen>`

---

## 6. Infrastructure

### 6.1 Database
- [ ] Migrations pour TOUTES les nouvelles tables (pas seulement 3)
- [ ] PostGIS extension activée
- [ ] Index spatiaux GIST sur les colonnes geography
- [ ] Seeders idempotents (ON CONFLICT DO NOTHING)

### 6.2 Docker
- [ ] PostgreSQL avec PostGIS
- [ ] Redis
- [ ] MinIO (dev)
- [ ] MailDev (dev)

### 6.3 Configuration
- [ ] `.env.example` à jour avec toutes les variables
- [ ] `env.config.ts` valide toutes les variables avec Zod
- [ ] Pas de secrets en dur dans le code

---

## 7. Qualité

### 7.1 Build
- [ ] `pnpm --filter=api typecheck` — 0 erreurs
- [ ] `pnpm --filter=api build` — compile
- [ ] `pnpm --filter=web-spa build` — compile
- [ ] Mobile `tsc --noEmit` — 0 erreurs (hors tsconfig env)
- [ ] `pnpm lint` — 0 erreurs (warnings OK)

### 7.2 Tests
- [ ] Tests unitaires pour les services critiques (search, orders, payments)
- [ ] Tests d'intégration pour les controllers
- [ ] Convention Arrange-Act-Assert
- [ ] Nommage : `inputX`, `mockX`, `actualX`, `expectedX`
