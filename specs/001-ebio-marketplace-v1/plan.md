# Implementation Plan: eBio Marketplace V1

**Branch**: `001-ebio-marketplace-v1` | **Date**: 2026-03-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-ebio-marketplace-v1/spec.md`

## Summary

eBio is a geolocated organic product marketplace for West Africa (Benin). The V1 delivers a React Native mobile app (acheteur + fournisseur roles), a web SPA for fournisseur management, a web admin dashboard, and a NestJS API with PostgreSQL/PostGIS. Core features: geolocation-based product search, supplier profiles with catalogs, real-time chat, order management with FedaPay Mobile Money escrow payments, reputation system with badges, community groups, and training modules. The architecture follows the Lonestone monorepo pattern with feature-driven directory structure, OpenAPI-generated SDK for type-safe frontend-backend communication, and WebSockets for real-time updates.

## Technical Context

**Language/Version**: TypeScript (strict mode) on Node.js 24.13.0
**Primary Dependencies**:
- **API**: NestJS, MikroORM, Zod, Better Auth, @nestjs/websockets (Socket.IO)
- **Mobile**: React Native (Expo), MapLibre GL Native, expo-google-fonts
- **Web SPA**: React 19, TailwindCSS, Radix UI / shadcn/ui, React Router v7, TanStack Query
- **Web Admin**: React 19 (web-ssr), TailwindCSS, shadcn/ui
- **Shared**: packages/openapi-generator (SDK + Zod validators), packages/ui (shadcn), packages/i18n

**Storage**: PostgreSQL + PostGIS (geospatial queries), Redis (cache, sessions, rate limiting, WebSocket adapter), Cloudflare R2 (S3-compatible file storage)
**Testing**: vitest (unit + integration), Arrange-Act-Assert convention
**Target Platform**: Android (priority) + iOS via React Native, Web (SPA + SSR)
**Project Type**: Monorepo (mobile-app + web-service + admin-dashboard)
**Performance Goals**: Initial load < 3s on 3G, search results < 1.5s, APK < 30 Mo
**Constraints**: Offline-first (2G/3G zones), WCAG AA accessibility, French (Benin) locale, Mobile Money payments via FedaPay
**Scale/Scope**: 5 000 MAU acheteurs, 800 fournisseurs actifs, ~50 screens mobile, ~30 screens web

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Design System Compliance | ✅ PASS | eBio design system tokens will be implemented in `apps/mobile/theme.ts` (React Native) and `tailwind.config.ts` (web). DM Serif Display + Plus Jakarta Sans + JetBrains Mono. Dark mode via semantic variables. All component dimensions per design system spec. |
| II. Brand Consistency | ✅ PASS | All entities use canonical vocabulary (Fournisseur, Acheteur, Mise en relation, Commander, Validé eBio, Fiche boutique). French locale with `toLocaleString('fr-FR')` formatting. Prices in JetBrains Mono. i18n package for text management. |
| III. Monorepo Architecture | ✅ PASS | Follows Lonestone structure: `apps/api` (NestJS), `apps/mobile` (React Native), `apps/web-spa` (fournisseur web), `apps/web-ssr` (admin dashboard). Shared via `packages/openapi-generator`, `packages/ui`, `packages/i18n`. OpenAPI SDK for all frontend-backend communication. |
| IV. Accessibility First | ✅ PASS | 44px minimum touch targets (design system enforced), WCAG AA contrast ratios per color palette, `accessibilityLabel` on all RN interactive components, visible form labels, color never sole information carrier, French alt text. |
| V. TypeScript Strict | ✅ PASS | `strict: true` in all tsconfigs. MikroORM entities → OpenAPI Zod schemas → generated SDK types → frontend. No `any`. class-validator/Zod runtime validation. DI via NestJS. |
| VI. Token-Based Styling | ✅ PASS | CSS custom properties (`--ebio-*`) mapped to Tailwind config for web. Central `theme.ts` for React Native. Hex values only in token definition files. Semantic variables for dark mode. |

## Project Structure

### Documentation (this feature)

```text
specs/001-ebio-marketplace-v1/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── auth.md
│   ├── search.md
│   ├── suppliers.md
│   ├── products.md
│   ├── orders.md
│   ├── payments.md
│   ├── chat.md
│   ├── ratings.md
│   ├── community.md
│   ├── training.md
│   ├── subscriptions.md
│   └── admin.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
apps/
├── api/                          # NestJS backend
│   └── src/
│       ├── modules/
│       │   ├── auth/             # OTP SMS, JWT, biometric, admin 2FA
│       │   ├── users/            # Acheteur + Fournisseur profiles
│       │   ├── suppliers/        # Supplier management, validation
│       │   ├── products/         # Catalog, variants, stock, promotions
│       │   ├── search/           # Geolocation search, PostGIS queries
│       │   ├── orders/           # Cart, order lifecycle, escrow
│       │   ├── payments/         # FedaPay integration, commissions
│       │   ├── chat/             # WebSocket gateway, conversations
│       │   ├── ratings/          # Reviews, badges, reputation
│       │   ├── community/        # Groups, publications, moderation
│       │   ├── training/         # Modules, quizzes, badges
│       │   ├── subscriptions/    # Plans, limits, billing
│       │   ├── notifications/    # Push (FCM), SMS, in-app
│       │   ├── files/            # Upload to Cloudflare R2
│       │   └── admin/            # Dashboard KPIs, validation queue
│       ├── common/               # Guards, decorators, filters, pipes
│       └── config/               # Environment, database, redis
│
├── mobile/                       # React Native (Expo) — acheteur + fournisseur
│   └── src/
│       ├── features/
│       │   ├── common/           # Shared hooks, utils, atoms
│       │   ├── auth/             # OTP login, biometric
│       │   ├── search/           # Search bar, filters, results
│       │   ├── map/              # MapLibre, markers, clustering
│       │   ├── supplier-profile/ # Fiche boutique
│       │   ├── catalog/          # Product browsing
│       │   ├── chat/             # Conversations, voice notes
│       │   ├── cart/             # Cart, checkout
│       │   ├── orders/           # Order tracking, timeline
│       │   ├── ratings/          # Rating form, badges display
│       │   ├── community/        # Groups, publications
│       │   ├── training/         # Video player, quizzes
│       │   ├── supplier-dashboard/ # Fournisseur management
│       │   ├── profile/          # User profile, role switch
│       │   └── notifications/    # Push notification handling
│       ├── app/                  # Navigation, providers, layouts
│       ├── theme/                # eBio design tokens (theme.ts)
│       └── utils/                # Offline storage, sync
│
├── web-spa/                      # React web — fournisseur + admin (unified)
│   └── src/
│       ├── features/
│       │   ├── common/           # Shared hooks, utils
│       │   ├── auth/             # Login (phone OTP for fournisseur, email+2FA for admin)
│       │   ├── catalog/          # Product CRUD, variants (fournisseur)
│       │   ├── orders/           # Order management (fournisseur)
│       │   ├── analytics/        # Fournisseur analytics
│       │   ├── settings/         # Shop settings, delivery zones, subscriptions
│       │   └── admin/            # Admin-only features
│       │       └── components/   # Dashboard KPIs, validation queue, moderation,
│       │                         # transactions, admin settings
│       ├── app/                  # Routes, unified layout (role-based), providers
│       └── lib/                  # API client, query setup
│
└── documentation/                # Starlight docs (existing)

packages/
├── openapi-generator/            # Generated SDK, types, Zod validators
├── ui/                           # Shared shadcn/ui components (web only)
└── i18n/                         # Internationalization (French Benin)
```

**Structure Decision**: Lonestone monorepo with 3 apps (api, mobile, web-spa) and 3 shared packages. Mobile follows feature-driven directory structure matching web apps. `apps/mobile` is the React Native / Expo app (acheteur + fournisseur). `apps/web-spa` is the unified web app for both fournisseur management and admin dashboard, with role-based routing and layout. `apps/web-ssr` is retained from the boilerplate but not used for eBio V1. Backend modules follow NestJS conventions with one module per domain. All frontend-backend communication goes through the OpenAPI-generated SDK in `packages/openapi-generator`.

## Complexity Tracking

> No constitution violations to justify.

| Decision | Why Needed | Simpler Alternative Rejected Because |
|----------|------------|-------------------------------------|
| 2 frontend apps (mobile + web-spa) | Acheteur = mobile-only, Fournisseur = mobile + web, Admin = web-only. Web-spa serves both fournisseur and admin via role-based routing. | Separate web-ssr for admin was unnecessary overhead — same tech stack, same auth patterns, better code sharing in a single app. |
| PostGIS extension | Core product is geolocation-based search (`ST_DWithin`, `ST_Distance`). | Application-level distance calculation would be too slow for 800+ suppliers with spatial filtering. |
| Redis alongside PostgreSQL | WebSocket adapter (multi-instance), rate limiting, session cache, offline sync queue. | In-memory only would break on multi-instance deployment and lose state on restart. |
| WebSocket gateway | Real-time chat (FR-021) and live stock updates (FR-010) require bidirectional communication. | Polling would increase server load and not meet < 1.5s stock update requirement on 2G/3G. |
