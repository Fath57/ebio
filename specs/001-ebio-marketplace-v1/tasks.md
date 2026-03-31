# Tasks: eBio Marketplace V1

**Input**: Design documents from `/specs/001-ebio-marketplace-v1/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Not explicitly requested — test tasks omitted. Add via `/speckit.tasks` with TDD flag if needed.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **API**: `apps/api/src/`
- **Mobile**: `apps/mobile/src/`
- **Web SPA**: `apps/web-spa/src/`
- **Web SSR**: `apps/web-ssr/src/`
- **Packages**: `packages/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, tooling, design system tokens, shared packages

- [x] T001 Initialize `apps/mobile` Expo project with TypeScript strict, configure `apps/mobile/package.json` with dependencies (expo, react-native, expo-location, expo-local-authentication, expo-av, expo-file-system, expo-notifications, @maplibre/maplibre-react-native)
- [x] T002 [P] Configure eBio design system tokens for React Native in `apps/mobile/src/theme/theme.ts` (colors, fonts, radius, spacing from design system doc)
- [x] T003 [P] Extend TailwindCSS config in `apps/web-spa/tailwind.config.ts` with eBio tokens (ebio-green-*, ebio-earth-*, etc.) and semantic dark mode variables
- [x] T004 [P] Extend TailwindCSS config in `apps/web-ssr/tailwind.config.ts` with eBio tokens (same as web-spa)
- [x] T005 [P] Configure Google Fonts loading in `apps/mobile/src/app/` — DM Serif Display, Plus Jakarta Sans (400/500/600/700), JetBrains Mono (400/500) via expo-google-fonts
- [x] T006 [P] Add eBio CSS custom properties (`--ebio-*` tokens, `--bg-page`, `--bg-surface`, `--text-primary`, dark mode media query) to `apps/web-spa/src/app/globals.css`
- [x] T007 [P] Add eBio CSS custom properties to `apps/web-ssr/src/app/globals.css`
- [x] T008 [P] Setup `packages/i18n` with French (Benin) locale: brand vocabulary (Fournisseur, Acheteur, Validé eBio, Fiche boutique, Itinéraire, Commander, Mise en relation), number formatting (1 200 FCFA), date formatting (il y a 2 h, hier, lun. 20 mars), distance formatting (1,2 km)
- [x] T009 Configure Docker Compose to add Redis service and update PostgreSQL image to `postgis/postgis:16-3.4` in `docker-compose.yml`
- [x] T010 [P] Create Redis configuration module in `apps/api/src/config/redis.config.ts` with connection factory
- [x] T011 [P] Create S3/R2 configuration module in `apps/api/src/config/s3.config.ts` for file uploads (MinIO in dev, Cloudflare R2 in prod)
- [x] T012 Create initial database migration enabling PostGIS extension (`CREATE EXTENSION IF NOT EXISTS postgis`) in `apps/api/src/migrations/`

**Checkpoint**: Infrastructure ready — all apps bootable, design tokens configured, Docker services running.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core modules that ALL user stories depend on — auth, users, file upload, notifications framework

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T013 Create User entity with phone, name, role (BUYER/SUPPLIER/ADMIN), email, passwordHash, deviceId, biometricEnabled, biometricKey in `apps/api/src/modules/users/users.entity.ts`
- [x] T014 Create User module, service, and controller in `apps/api/src/modules/users/` (CRUD operations, role management)
- [x] T015 Create auth module with OTP SMS flow (request + verify) using Africa's Talking in `apps/api/src/modules/auth/auth.module.ts`, `auth.service.ts`, `auth.controller.ts`
- [x] T016 [P] Create auth contracts (Zod schemas with `.meta()`) for OTP request, OTP verify, refresh, admin login, admin verify-otp, biometric enable/verify in `apps/api/src/modules/auth/contracts/auth.contract.ts`
- [x] T017 Implement JWT access/refresh token generation with rotation in `apps/api/src/modules/auth/auth.service.ts`
- [x] T018 [P] Create JWT auth guard and role-based guard in `apps/api/src/common/guards/jwt-auth.guard.ts` and `apps/api/src/common/guards/roles.guard.ts`
- [x] T019 [P] Create rate limiting decorator and guard for auth endpoints (3 OTP requests per phone per 10 min) in `apps/api/src/common/guards/rate-limit.guard.ts`
- [x] T020 Create files module for S3/R2 uploads (presigned URL generation, image compression validation < 200Ko WebP) in `apps/api/src/modules/files/files.module.ts`, `files.service.ts`, `files.controller.ts`
- [x] T021 Create notifications module with push (FCM) and SMS (Africa's Talking) channels in `apps/api/src/modules/notifications/notifications.module.ts`, `notifications.service.ts`
- [x] T022 [P] Create Notification entity in `apps/api/src/modules/notifications/notification.entity.ts` (user, type, title, body, data JSON, readAt, sentAt, channel)
- [x] T023 Generate OpenAPI SDK after foundational API contracts are defined — run `pnpm generate` to populate `packages/openapi-generator/client/`
- [x] T024 Setup mobile app navigation structure in `apps/mobile/src/app/` — bottom tab navigator (Recherche, Carte, Chat, Communauté, Profil), stack navigators per tab
- [x] T025 [P] Create API client setup in `apps/mobile/src/utils/api-client.ts` using generated OpenAPI SDK, configure JWT token storage (expo-secure-store), refresh token interceptor
- [x] T026 [P] Create API client setup in `apps/web-spa/src/lib/api-client.ts` using generated OpenAPI SDK with TanStack Query provider
- [x] T027 [P] Create API client setup in `apps/web-ssr/src/lib/api-client.ts` using generated OpenAPI SDK with TanStack Query provider
- [x] T028 Create mobile offline storage utility in `apps/mobile/src/utils/offline-storage.ts` using WatermelonDB for structured data and MMKV for key-value cache
- [x] T029 Create mobile sync manager in `apps/mobile/src/utils/sync-manager.ts` — queue offline actions, replay on reconnect, server-wins conflict resolution
- [x] T030 Create database seed script with initial data: categories (Huiles, Céréales, Légumes, Semences, Compost, Autres), subscription plans (Gratuit/Essentiel/Pro/Coopérative), commission rates, admin user in `apps/api/src/seeders/`

**Checkpoint**: Foundation ready — auth works, file uploads work, notifications framework ready, OpenAPI SDK generated, mobile app boots with navigation.

---

## Phase 3: User Story 1 — Recherche géolocalisée de produits (Priority: P1) 🎯 MVP

**Goal**: An acheteur opens eBio, searches for a product, and sees nearby fournisseurs sorted by distance with their products, prices, notes, and badges.

**Independent Test**: A non-registered user can search for "huile de palme" and see supplier results sorted by distance within 30 seconds.

### Implementation for User Story 1

- [x] T031 [P] [US1] Create Category entity in `apps/api/src/modules/products/entities/category.entity.ts` (name, slug, icon, sortOrder)
- [x] T032 [P] [US1] Create Supplier entity with PostGIS Point location in `apps/api/src/modules/suppliers/supplier.entity.ts` (shopName, type, location geography, validationStatus, mode, rating, badges, openingHours JSON)
- [x] T033 [P] [US1] Create Product entity in `apps/api/src/modules/products/entities/product.entity.ts` (name, category, photos, pricePerUnit, unit, stock, status, promotionalPrice)
- [x] T034 [P] [US1] Create ProductVariant entity in `apps/api/src/modules/products/entities/product-variant.entity.ts`
- [x] T035 [US1] Create database migration for Supplier (with GIST spatial index on location), Product (composite index on supplier+category+status), ProductVariant, Category entities in `apps/api/src/migrations/`
- [x] T036 [US1] Create search module with geospatial query service using PostGIS `ST_DWithin` and `ST_Distance` in `apps/api/src/modules/search/search.service.ts`
- [x] T037 [P] [US1] Create search contracts (Zod schemas) for product search, autocomplete, categories in `apps/api/src/modules/search/contracts/search.contract.ts`
- [x] T038 [US1] Create search controller with GET /search/products (7 filters, 3 sort options, pagination), GET /search/autocomplete, GET /search/categories in `apps/api/src/modules/search/search.controller.ts`
- [x] T039 [P] [US1] Create full-text search index (GIN) on Product.name and Supplier.shopName for autocomplete in migration
- [x] T040 [US1] Create mobile search screen with search bar, category pictograms, filter sheet, sort options in `apps/mobile/src/features/search/components/search-screen.tsx`
- [x] T041 [P] [US1] Create mobile search result card component (supplier name, product photo, price in JetBrains Mono, distance, rating stars, mode badge, Validé eBio badge) in `apps/mobile/src/features/search/components/search-result-card.tsx`
- [x] T042 [P] [US1] Create mobile filter bottom sheet component (distance slider default 10km, category chips, price max, in-stock toggle, min rating, mode filter, validated-only toggle) in `apps/mobile/src/features/search/components/filter-sheet.tsx`
- [x] T043 [US1] Create mobile search hooks using OpenAPI SDK (useSearchProducts, useAutocomplete, useCategories) in `apps/mobile/src/features/search/hooks/use-search.ts`
- [x] T044 [US1] Create mobile map screen with MapLibre GL, supplier markers colored by category, clustering in dézoom, tap marker → mini-fiche in `apps/mobile/src/features/map/components/map-screen.tsx`
- [x] T045 [P] [US1] Create mobile map marker component and cluster component in `apps/mobile/src/features/map/components/supplier-marker.tsx`
- [x] T046 [US1] Create mobile list/map toggle (switch between search results list and map view) in `apps/mobile/src/features/search/components/view-toggle.tsx`
- [x] T047 [US1] Implement offline search: cache last search results and recent searches in WatermelonDB, serve from cache when offline in `apps/mobile/src/features/search/hooks/use-offline-search.ts`
- [x] T048 [US1] Create onboarding flow: splash screen → geolocation permission → search screen (3 screens max, no account required) in `apps/mobile/src/features/common/components/onboarding.tsx`

**Checkpoint**: User Story 1 fully functional — acheteur can search products, see results on list/map, filter, and sort. MVP deliverable.

---

## Phase 4: User Story 2 — Inscription et profil fournisseur avec catalogue (Priority: P2)

**Goal**: A fournisseur registers via OTP, sets up profile with photos/GPS/docs, adds products to catalog, and awaits admin validation.

**Independent Test**: A fournisseur can register, add 3 products with photos, and see "En attente de validation" status.

### Implementation for User Story 2

- [x] T049 [P] [US2] Create supplier contracts (Zod schemas) for register, update, dashboard, analytics, delivery zones in `apps/api/src/modules/suppliers/contracts/supplier.contract.ts`
- [x] T050 [P] [US2] Create product contracts for CRUD, stock update, promotion in `apps/api/src/modules/products/contracts/product.contract.ts`
- [x] T051 [US2] Create suppliers service (register with file upload, update profile, GPS location, validation status management) in `apps/api/src/modules/suppliers/suppliers.service.ts`
- [x] T052 [US2] Create suppliers controller (POST /suppliers/register, GET/PUT /suppliers/me, GET /suppliers/:id) in `apps/api/src/modules/suppliers/suppliers.controller.ts`
- [x] T053 [US2] Create products service (CRUD with plan limit enforcement, stock management, alerts) in `apps/api/src/modules/products/products.service.ts`
- [x] T054 [US2] Create products controller (CRUD under /suppliers/me/products, stock update, promotion) in `apps/api/src/modules/products/products.controller.ts`
- [x] T055 [P] [US2] Create DeliveryZone entity with PostGIS Polygon in `apps/api/src/modules/suppliers/entities/delivery-zone.entity.ts`
- [x] T056 [P] [US2] Create StockAlert entity (buyer + product, notifiedAt) in `apps/api/src/modules/products/entities/stock-alert.entity.ts`
- [x] T057 [US2] Create supplier stock alert service: trigger push notification to supplier when stock < threshold, notify buyers on restock in `apps/api/src/modules/products/stock-alert.service.ts`
- [x] T058 [US2] Create mobile fournisseur registration flow: phone OTP → profile form (shop name, type, photo, GPS, Mobile Money) → document upload → "En attente" screen in `apps/mobile/src/features/auth/components/supplier-registration.tsx`
- [x] T059 [US2] Create mobile product creation form: photos (3 max with cadrage guide), name, category picker (pictograms), price + unit, variants, stock, voice description in `apps/mobile/src/features/supplier-dashboard/components/product-form.tsx`
- [x] T060 [P] [US2] Create mobile product list (supplier's own catalog) with status indicators (Active/En rupture/Masqué) in `apps/mobile/src/features/supplier-dashboard/components/product-list.tsx`
- [x] T061 [US2] Create mobile supplier mode selector (Mise en relation / Commande) in `apps/mobile/src/features/supplier-dashboard/components/mode-selector.tsx`
- [x] T062 [US2] Create mobile delivery zone configuration with map polygon drawing in `apps/mobile/src/features/supplier-dashboard/components/delivery-zone-editor.tsx`
- [x] T063 [US2] Create mobile opening hours editor in `apps/mobile/src/features/supplier-dashboard/components/opening-hours-editor.tsx`
- [x] T064 [US2] Regenerate OpenAPI SDK after supplier and product contracts are added — run `pnpm generate`

**Checkpoint**: Fournisseurs can register, create catalogs, and appear in search (after admin validation in US5).

---

## Phase 5: User Story 3 — Consultation fiche fournisseur et mise en relation (Priority: P3)

**Goal**: Acheteur views supplier profile, browses products, initiates contact via chat/WhatsApp/phone, and can navigate to supplier.

**Independent Test**: Acheteur taps a search result, sees the full fiche boutique, and sends a chat message with auto-generated prompt.

### Implementation for User Story 3

- [x] T065 [P] [US3] Create Conversation entity in `apps/api/src/modules/chat/entities/conversation.entity.ts` (buyer, supplier, order nullable, lastMessageAt, archivedAt)
- [x] T066 [P] [US3] Create Message entity in `apps/api/src/modules/chat/entities/message.entity.ts` (conversation, sender, type TEXT/PHOTO/VOICE/LOCATION, content, mediaUrl, latitude, longitude, readAt)
- [x] T067 [US3] Create chat module with WebSocket gateway (Socket.IO) in `apps/api/src/modules/chat/chat.gateway.ts` — events: chat:send, chat:read, chat:typing, JWT auth in handshake
- [x] T068 [US3] Create chat service (create/get conversations, send messages, mark read, auto-prompt generation) in `apps/api/src/modules/chat/chat.service.ts`
- [x] T069 [US3] Create chat REST controller (POST /conversations, GET /conversations, GET /conversations/:id/messages, quick replies, WhatsApp share) in `apps/api/src/modules/chat/chat.controller.ts`
- [x] T070 [P] [US3] Create chat contracts in `apps/api/src/modules/chat/contracts/chat.contract.ts`
- [x] T071 [US3] Configure Redis adapter for Socket.IO (multi-instance support) in `apps/api/src/modules/chat/chat.module.ts`
- [x] T072 [US3] Create mobile fiche boutique screen (cover photo, name, location, distance, rating, badges, products grid, opening hours, action buttons) in `apps/mobile/src/features/supplier-profile/components/supplier-profile-screen.tsx`
- [x] T073 [P] [US3] Create mobile badge component (Validé eBio green, Top Vendeur earth, Certifié Bio sky) following design system badge specs in `apps/mobile/src/features/common/components/badge.tsx`
- [x] T074 [P] [US3] Create mobile product card component (image 4:3, name, price in JetBrains Mono Green 600, stock status) in `apps/mobile/src/features/catalog/components/product-card.tsx`
- [x] T075 [US3] Create mobile contact action sheet: Chat eBio / WhatsApp (wa.me deep link) / Appel téléphonique in `apps/mobile/src/features/supplier-profile/components/contact-action-sheet.tsx`
- [x] T076 [US3] Create mobile "Y aller" button — opens native Maps with supplier coordinates in `apps/mobile/src/features/supplier-profile/components/navigate-button.tsx`
- [x] T077 [US3] Create mobile chat screen with message list, text input, photo/voice/location attachment buttons, typing indicator, read receipts in `apps/mobile/src/features/chat/components/chat-screen.tsx`
- [x] T078 [P] [US3] Create mobile voice note recorder and player components using expo-av in `apps/mobile/src/features/chat/components/voice-note.tsx`
- [x] T079 [US3] Create mobile chat list screen (conversations sorted by lastMessageAt, unread count badge) in `apps/mobile/src/features/chat/components/conversation-list.tsx`
- [x] T080 [US3] Create WebSocket connection manager in mobile with auto-reconnect for unstable 2G/3G in `apps/mobile/src/utils/websocket-client.ts`
- [x] T081 [US3] Create mobile quick replies selector for fournisseur in chat in `apps/mobile/src/features/chat/components/quick-replies.tsx`
- [x] T082 [US3] Regenerate OpenAPI SDK after chat contracts — run `pnpm generate`

**Checkpoint**: Acheteurs can browse fiche boutique and communicate with fournisseurs via chat, WhatsApp, or phone.

---

## Phase 6: User Story 4 — Commande et paiement Mobile Money via FedaPay (Priority: P4)

**Goal**: Acheteur adds products to cart, pays via FedaPay Mobile Money, fournisseur manages order lifecycle, escrow release after delivery.

**Independent Test**: Complete order flow from cart → FedaPay payment → supplier acceptance → delivery confirmation → escrow release.

### Implementation for User Story 4

- [x] T083 [P] [US4] Create Order entity with status state machine in `apps/api/src/modules/orders/entities/order.entity.ts`
- [x] T084 [P] [US4] Create OrderItem entity in `apps/api/src/modules/orders/entities/order-item.entity.ts`
- [x] T085 [P] [US4] Create Payment entity (fedapayTransactionId, status state machine, operator, commission) in `apps/api/src/modules/payments/payment.entity.ts`
- [x] T086 [P] [US4] Create Dispute entity in `apps/api/src/modules/orders/entities/dispute.entity.ts`
- [x] T087 [US4] Create orders service (create order with stock validation, duplicate detection, accept/reject, status transitions, auto-cancel 24h) in `apps/api/src/modules/orders/orders.service.ts`
- [x] T088 [US4] Create orders controller (POST /orders, GET /orders, PATCH status/accept/reject/confirm-delivery, POST dispute) in `apps/api/src/modules/orders/orders.controller.ts`
- [x] T089 [P] [US4] Create order and payment contracts in `apps/api/src/modules/orders/contracts/order.contract.ts` and `apps/api/src/modules/payments/contracts/payment.contract.ts`
- [x] T090 [US4] Create payments service with FedaPay SDK integration (initiate transaction, webhook handler, escrow logic, release, refund) in `apps/api/src/modules/payments/payments.service.ts`
- [x] T091 [US4] Create payments controller (POST /payments/initiate, POST /payments/webhook/fedapay) with webhook signature verification in `apps/api/src/modules/payments/payments.controller.ts`
- [x] T092 [US4] Create escrow release scheduler: CRON job checking for orders past 48h dispute window or 7 days auto-release with reminders at day 3 and 6 in `apps/api/src/modules/payments/escrow-scheduler.service.ts`
- [x] T093 [US4] Create commission calculation service (4% alimentaire, 3% intrants, 2.5% semences) in `apps/api/src/modules/payments/commission.service.ts`
- [x] T094 [US4] Create receipt PDF generation service (order summary, payment details, WhatsApp/SMS delivery) in `apps/api/src/modules/payments/receipt.service.ts`
- [x] T095 [US4] Create mobile cart screen with multi-supplier sections, quantity selectors, variant pickers, delivery mode selection, total per supplier in `apps/mobile/src/features/cart/components/cart-screen.tsx`
- [x] T096 [US4] Create mobile checkout flow: pickup mode → delivery slot (if delivery) → payment method selection → FedaPay operator selection → confirmation in `apps/mobile/src/features/cart/components/checkout-flow.tsx`
- [x] T097 [US4] Create mobile order confirmation screen with order number and tracking access in `apps/mobile/src/features/orders/components/order-confirmation.tsx`
- [x] T098 [US4] Create mobile order tracking screen with status timeline (Passée → Acceptée → En préparation → Prête → Livrée) and chat shortcut in `apps/mobile/src/features/orders/components/order-tracking.tsx`
- [x] T099 [US4] Create mobile order list screen (buyer view: my orders, filter by status) in `apps/mobile/src/features/orders/components/order-list.tsx`
- [x] T100 [US4] Create mobile supplier order management (incoming orders, accept/reject/update status) in `apps/mobile/src/features/supplier-dashboard/components/order-management.tsx`
- [x] T101 [US4] Create mobile dispute form (reason text, within 48h of delivery) in `apps/mobile/src/features/orders/components/dispute-form.tsx`
- [x] T102 [US4] Regenerate OpenAPI SDK after order/payment contracts — run `pnpm generate`

**Checkpoint**: Full order + payment flow working end-to-end with escrow.

---

## Phase 7: User Story 5 — Validation fournisseurs et administration (Priority: P5)

**Goal**: Admin dashboard with KPIs, supplier validation queue, content moderation, transaction management.

**Independent Test**: Admin logs in with 2FA, validates a pending supplier, supplier becomes visible in search.

### Implementation for User Story 5

- [x] T103 [US5] Create admin auth with email + password + OTP 2FA flow in `apps/api/src/modules/auth/admin-auth.service.ts`
- [x] T104 [US5] Create admin module with dashboard KPIs endpoint (active users, searches, transactions, revenue, pending validations) in `apps/api/src/modules/admin/admin.service.ts` and `admin.controller.ts`
- [x] T105 [P] [US5] Create admin contracts in `apps/api/src/modules/admin/contracts/admin.contract.ts`
- [x] T106 [US5] Create supplier validation service (validate/reject/request complement, auto-notify) in `apps/api/src/modules/admin/validation.service.ts`
- [x] T107 [P] [US5] Create ContentReport entity in `apps/api/src/modules/admin/entities/content-report.entity.ts`
- [x] T108 [US5] Create moderation service (content reports, resolve/dismiss) in `apps/api/src/modules/admin/moderation.service.ts`
- [x] T109 [US5] Create transaction export service (CSV/Excel) in `apps/api/src/modules/admin/export.service.ts`
- [x] T110 [US5] Create web-ssr admin login page with email + password + OTP 2FA in `apps/web-ssr/src/features/auth/components/admin-login.tsx`
- [x] T111 [US5] Create web-ssr admin layout with sidebar navigation (Dashboard, Validations, Modération, Transactions, Paramètres) in `apps/web-ssr/src/app/admin-layout.tsx`
- [x] T112 [US5] Create web-ssr dashboard page with KPI cards and charts in `apps/web-ssr/src/features/analytics/components/dashboard-page.tsx`
- [x] T113 [US5] Create web-ssr supplier validation queue: list pending, view dossier (info + documents), actions (Valider/Rejeter/Demander complément) in `apps/web-ssr/src/features/validation/components/validation-queue.tsx`
- [x] T114 [US5] Create web-ssr moderation page: content reports list, review content, actions (delete/warn/dismiss) in `apps/web-ssr/src/features/moderation/components/moderation-page.tsx`
- [x] T115 [US5] Create web-ssr transactions page with filters, dispute management, CSV export in `apps/web-ssr/src/features/transactions/components/transactions-page.tsx`
- [x] T116 [US5] Create web-ssr settings page: commission rates editor, subscription plans editor, system messages in `apps/web-ssr/src/features/settings/components/settings-page.tsx`
- [x] T117 [US5] Regenerate OpenAPI SDK after admin contracts — run `pnpm generate`

**Checkpoint**: Admin can manage the platform — validate suppliers, moderate content, track transactions.

---

## Phase 8: User Story 6 — Notation, réputation et badges de confiance (Priority: P6)

**Goal**: Acheteur rates fournisseurs on 4 criteria, badges auto-calculated, anti-fraud detection.

**Independent Test**: After completing an order, acheteur rates the supplier, rating appears on fiche boutique.

### Implementation for User Story 6

- [x] T118 [P] [US6] Create Review entity in `apps/api/src/modules/ratings/entities/review.entity.ts` (buyer, supplier, order, 4 criteria ratings, comment, unique constraint buyer+order)
- [x] T119 [P] [US6] Create Badge entity in `apps/api/src/modules/ratings/entities/badge.entity.ts` (supplier, type, grantedAt, grantedBy, expiresAt)
- [x] T120 [US6] Create ratings service (submit review, weighted rating calculation last 90 days, badge eligibility check: Top Vendeur ≥ 4.5 + ≥ 20 transactions/90 days) in `apps/api/src/modules/ratings/ratings.service.ts`
- [x] T121 [US6] Create ratings controller (POST /reviews, GET /suppliers/:id/reviews with summary, POST /reviews/:id/report, GET /suppliers/:id/badges) in `apps/api/src/modules/ratings/ratings.controller.ts`
- [x] T122 [P] [US6] Create ratings contracts in `apps/api/src/modules/ratings/contracts/rating.contract.ts`
- [x] T123 [US6] Create multi-account detection service (same phone, same deviceId) with admin alerting in `apps/api/src/modules/ratings/fraud-detection.service.ts`
- [x] T124 [US6] Create mobile rating form screen (4 star criteria: qualité, délais, communication, conformité + comment) in `apps/mobile/src/features/ratings/components/rating-form.tsx`
- [x] T125 [US6] Create mobile reviews list component for fiche boutique (summary stats, individual reviews) in `apps/mobile/src/features/ratings/components/reviews-list.tsx`
- [x] T126 [US6] Create mobile star rating component (Earth 400 active, Neutral 200 inactive) following design system in `apps/mobile/src/features/common/components/star-rating.tsx`
- [x] T127 [US6] Regenerate OpenAPI SDK after ratings contracts — run `pnpm generate`

**Checkpoint**: Reputation system functional — ratings, badges, and fraud detection active.

---

## Phase 9: User Story 7 — Tableau de bord fournisseur et gestion (Priority: P7)

**Goal**: Fournisseur dashboard (mobile + web) with orders, analytics, stock alerts, revenue tracking.

**Independent Test**: Fournisseur logs in, sees pending orders count, accepts an order, views monthly revenue.

### Implementation for User Story 7

- [x] T128 [US7] Create supplier dashboard endpoint (pending orders, unread messages, critical stock, revenue, escrow pending, rating) in `apps/api/src/modules/suppliers/suppliers.controller.ts` (GET /suppliers/me/dashboard)
- [x] T129 [US7] Create supplier analytics endpoint (revenue by period, top products, buyer locations, rating trend) in `apps/api/src/modules/suppliers/suppliers.controller.ts` (GET /suppliers/me/analytics)
- [x] T130 [US7] Create mobile supplier dashboard screen (summary cards: commandes en attente, messages non lus, stock critique, CA) in `apps/mobile/src/features/supplier-dashboard/components/dashboard-screen.tsx`
- [x] T131 [US7] Create mobile supplier analytics screen (revenue chart, top products, buyer heatmap, rating trend) in `apps/mobile/src/features/supplier-dashboard/components/analytics-screen.tsx`
- [x] T132 [US7] Create web-spa fournisseur auth (phone OTP login) in `apps/web-spa/src/features/auth/components/supplier-login.tsx`
- [x] T133 [US7] Create web-spa layout with sidebar (Catalogue, Commandes, Analytics, Paramètres) in `apps/web-spa/src/app/supplier-layout.tsx`
- [x] T134 [US7] Create web-spa catalog management page (product list, create/edit forms, stock quick-update, variant management) in `apps/web-spa/src/features/catalog/components/catalog-page.tsx`
- [x] T135 [US7] Create web-spa orders management page (incoming orders list, accept/reject, status updates, order detail) in `apps/web-spa/src/features/orders/components/orders-page.tsx`
- [x] T136 [US7] Create web-spa analytics dashboard (revenue charts, top products, buyer map, rating overview) in `apps/web-spa/src/features/analytics/components/analytics-page.tsx`
- [x] T137 [US7] Create web-spa settings page (shop info, opening hours, delivery zones, quick replies) in `apps/web-spa/src/features/settings/components/settings-page.tsx`

**Checkpoint**: Fournisseur can manage their business from both mobile and web interfaces.

---

## Phase 10: User Story 8 — Réseau communautaire (Priority: P8)

**Goal**: Community groups by filière and region, publications, social sharing, moderation.

**Independent Test**: User joins a group, posts an announcement, other members see it, can share to WhatsApp.

### Implementation for User Story 8

- [x] T138 [P] [US8] Create CommunityGroup entity in `apps/api/src/modules/community/entities/community-group.entity.ts`
- [x] T139 [P] [US8] Create GroupMembership entity in `apps/api/src/modules/community/entities/group-membership.entity.ts`
- [x] T140 [P] [US8] Create Publication entity in `apps/api/src/modules/community/entities/publication.entity.ts`
- [x] T141 [US8] Create community service (groups CRUD, join/leave, publications, share URLs, reporting) in `apps/api/src/modules/community/community.service.ts`
- [x] T142 [US8] Create community controller (GET /groups, POST join/leave, GET/POST publications, report, share-url) in `apps/api/src/modules/community/community.controller.ts`
- [x] T143 [P] [US8] Create community contracts in `apps/api/src/modules/community/contracts/community.contract.ts`
- [x] T144 [US8] Create mobile community tab screen: group list (filière + geographic), group detail with publication feed in `apps/mobile/src/features/community/components/community-screen.tsx`
- [x] T145 [US8] Create mobile publication composer (type selector, text content, media attachment) in `apps/mobile/src/features/community/components/publication-composer.tsx`
- [x] T146 [US8] Create mobile social share component (WhatsApp, Facebook, TikTok deep links) in `apps/mobile/src/features/community/components/social-share.tsx`
- [x] T147 [US8] Regenerate OpenAPI SDK — run `pnpm generate`

**Checkpoint**: Community groups active, users can publish and share content.

---

## Phase 11: User Story 9 — Modules de formation audio/vidéo (Priority: P9)

**Goal**: Training modules with video/audio/illustrated content, offline download, pictographic quizzes, completion badges.

**Independent Test**: User browses training modules, downloads one, watches offline, completes quiz, receives badge.

### Implementation for User Story 9

- [x] T148 [P] [US9] Create TrainingModule entity in `apps/api/src/modules/training/entities/training-module.entity.ts`
- [x] T149 [P] [US9] Create TrainingCompletion entity in `apps/api/src/modules/training/entities/training-completion.entity.ts`
- [x] T150 [US9] Create training service (list modules, signed content URLs, download URLs, submit quiz, badge award) in `apps/api/src/modules/training/training.service.ts`
- [x] T151 [US9] Create training controller (GET /training/modules, GET /:id, GET /:id/download, POST /:id/complete, GET /my-progress) in `apps/api/src/modules/training/training.controller.ts`
- [x] T152 [P] [US9] Create training contracts in `apps/api/src/modules/training/contracts/training.contract.ts`
- [x] T153 [US9] Create mobile training screen: module list by theme, format icons, progress indicator in `apps/mobile/src/features/training/components/training-screen.tsx`
- [x] T154 [US9] Create mobile video/audio player component (portrait video, audio-only mode) using expo-av in `apps/mobile/src/features/training/components/media-player.tsx`
- [x] T155 [US9] Create mobile pictographic quiz component (image-based questions and options, score calculation) in `apps/mobile/src/features/training/components/quiz.tsx`
- [x] T156 [US9] Create mobile offline download manager for training content using expo-file-system in `apps/mobile/src/features/training/hooks/use-download-module.ts`
- [x] T157 [US9] Regenerate OpenAPI SDK — run `pnpm generate`

**Checkpoint**: Training platform functional with offline support.

---

## Phase 12: User Story 10 — Abonnements fournisseur et monétisation (Priority: P10)

**Goal**: Subscription plans with limits, recurring billing, ads, boost services.

**Independent Test**: Fournisseur on plan Gratuit subscribes to Essentiel, gains access to Mode Commande with 20 products.

### Implementation for User Story 10

- [x] T158 [P] [US10] Create SubscriptionPlan entity in `apps/api/src/modules/subscriptions/entities/subscription-plan.entity.ts`
- [x] T159 [P] [US10] Create Subscription entity in `apps/api/src/modules/subscriptions/entities/subscription.entity.ts`
- [x] T160 [US10] Create subscriptions service (list plans, subscribe via FedaPay, enforce limits, upgrade, cancel, expiry handling) in `apps/api/src/modules/subscriptions/subscriptions.service.ts`
- [x] T161 [US10] Create subscriptions controller (GET /plans, POST /subscriptions, GET /me, PATCH cancel, POST upgrade) in `apps/api/src/modules/subscriptions/subscriptions.controller.ts`
- [x] T162 [P] [US10] Create subscription contracts in `apps/api/src/modules/subscriptions/contracts/subscription.contract.ts`
- [x] T163 [US10] Create plan limit enforcement middleware: check product count, order mode access, analytics level in `apps/api/src/modules/subscriptions/plan-guard.service.ts`
- [x] T164 [US10] Create mobile subscription screen: plan comparison table, current plan display, upgrade CTA in `apps/mobile/src/features/profile/components/subscription-screen.tsx`
- [x] T165 [US10] Create web-spa subscription management in settings in `apps/web-spa/src/features/settings/components/subscription-settings.tsx`
- [x] T166 [US10] Regenerate OpenAPI SDK — run `pnpm generate`

**Checkpoint**: Monetization system active — plans, limits, and billing working.

---

## Phase 13: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T167 [P] Create WebSocket event for real-time stock updates (product:stock-update) broadcast to search sessions in `apps/api/src/modules/search/stock-update.gateway.ts`
- [x] T168 [P] Implement mobile dark mode support using design system semantic variables and `useColorScheme` in `apps/mobile/src/theme/use-theme.ts`
- [x] T169 [P] Implement web dark mode support via `prefers-color-scheme` media query in CSS custom properties
- [ ] T170 [P] Add MapLibre offline tile download manager (20km radius zones) in `apps/mobile/src/features/map/hooks/use-offline-tiles.ts`
- [x] T171 [P] Create mobile PriceTag component (JetBrains Mono, Green 600 light / Green 200 dark, "X XXX FCFA / unité" format) in `apps/mobile/src/features/common/components/price-tag.tsx`
- [x] T172 [P] Create mobile connectivity indicator ("En attente de connexion" banner) in `apps/mobile/src/features/common/components/connectivity-banner.tsx`
- [x] T173 [P] Create mobile profile screen with role switch (acheteur → fournisseur), biometric settings, notification preferences in `apps/mobile/src/features/profile/components/profile-screen.tsx`
- [x] T174 [P] Add biometric login flow (expo-local-authentication) in `apps/mobile/src/features/auth/hooks/use-biometric-auth.ts`
- [x] T175 [P] Create mobile notification handler (FCM registration, topic subscription by zone + filière, notification display) in `apps/mobile/src/features/notifications/hooks/use-notifications.ts`
- [ ] T176 [P] Create admin broadcast notification endpoint in `apps/api/src/modules/admin/admin.controller.ts` (POST /admin/notifications/broadcast with rate limit 1/week per user)
- [ ] T177 [P] Add Sentry error tracking to all apps (api, mobile, web-spa, web-ssr)
- [ ] T178 [P] Add OpenTelemetry tracing to API per existing instrument.ts pattern
- [ ] T179 Run accessibility audit on all mobile screens (44px touch targets, contrast ratios, accessibilityLabel on icon buttons, visible form labels)
- [ ] T180 Run `pnpm lint` and `pnpm build` across all apps — fix any TypeScript or ESLint errors
- [ ] T181 Run quickstart.md validation — verify setup steps work on a clean checkout

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Stories (Phase 3–12)**: All depend on Foundational phase completion
  - US1 (Search) can start immediately after Foundational
  - US2 (Suppliers) can start in parallel with US1 (different modules)
  - US3 (Chat) depends on US1 (search results → supplier profile) and US2 (supplier entity)
  - US4 (Orders) depends on US2 (products) and US3 (supplier profile)
  - US5 (Admin) depends on US2 (supplier validation)
  - US6 (Ratings) depends on US4 (completed orders) or US3 (completed contact)
  - US7 (Supplier Dashboard) depends on US2 (catalog) and US4 (orders)
  - US8 (Community) can start after Foundational (independent)
  - US9 (Training) can start after Foundational (independent)
  - US10 (Subscriptions) depends on US2 (supplier entity)
- **Polish (Phase 13)**: Depends on all desired user stories being complete

### User Story Dependencies

```
              ┌──────┐
              │ US1  │ (Search)
              └──┬───┘
                 │
    ┌────────────┼────────────┐
    │            │            │
┌───▼──┐   ┌────▼───┐   ┌────▼───┐
│ US2  │   │  US8   │   │  US9   │  (independent)
└──┬───┘   └────────┘   └────────┘
   │
   ├──────────────┬──────────────┐
   │              │              │
┌──▼───┐    ┌────▼───┐    ┌────▼────┐
│ US3  │    │  US5   │    │  US10   │
└──┬───┘    └────────┘    └─────────┘
   │
┌──▼───┐
│ US4  │
└──┬───┘
   │
   ├──────────────┐
   │              │
┌──▼───┐    ┌────▼───┐
│ US6  │    │  US7   │
└──────┘    └────────┘
```

### Parallel Opportunities

- **Phase 1**: T002–T008 (all design tokens) in parallel, T009–T012 (infra) in parallel
- **Phase 2**: T016, T018, T019, T022 in parallel; T025–T027 in parallel
- **Phase 3–12**: Within each story, entities ([P] marked) can be created in parallel, then services, then controllers, then frontend
- **Cross-story**: US1+US2 in parallel, US8+US9 in parallel with any other story

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1 (Search)
4. **STOP and VALIDATE**: Non-registered user can search and find products
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 (Search) → MVP: find products nearby
3. US2 (Suppliers) → Suppliers can register and add products
4. US3 (Chat) → Mise en relation functional
5. US5 (Admin) → Admin can validate suppliers
6. US4 (Orders) → Full commerce flow with FedaPay
7. US6 (Ratings) → Reputation system live
8. US7 (Dashboard) → Supplier management tools complete
9. US8 + US9 (Community + Training) → Ecosystem features
10. US10 (Subscriptions) → Monetization activated
11. Polish → Production-ready

### Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- Each user story is independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
