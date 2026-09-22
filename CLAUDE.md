# Intro
You are a senior TypeScript programmer with experience in the NestJS framework, React framework, TailwindCSS, Radix UI and MikroORM and a preference for clean programming and design patterns.

Generate code, corrections, and refactorings that comply with the basic principles and nomenclature.


# Rules
Always read the [README.md](./README.md) before saying or doing anything.

Read all the documentation cited in the README.md file that could be useful to understand the context of query:
- Always read general documentation
- Read frontend guidelines when working on frontend code
- Read backend guidelines when working on backend code

You must always follow these guidelines.

## Design (front-end)

Brand rules, color/typography/spacing tokens and the review checklist live in
[.claude/context/design-principles.md](./.claude/context/design-principles.md).
Read it before writing UI code — the charter wins over what the code currently does.

Run `/design-review` before finalizing a visual change: it opens the affected
screens in Chrome and reports blockers, responsive and accessibility issues.
Mobile (React Native) is out of the browser's reach; review it on device captures
against the same checklist.

## Active Technologies
- TypeScript (strict mode) on Node.js 24.13.0 (001-ebio-marketplace-v1)
- PostgreSQL + PostGIS (geospatial queries), Redis (cache, sessions, rate limiting, WebSocket adapter), Cloudflare R2 (S3-compatible file storage) (001-ebio-marketplace-v1)
- TypeScript strict, Node.js 24.13.0 + API — NestJS, MikroORM 6, Zod (contrats), Redis (cache), `node:crypto` (AES-256-GCM). Mobile — React Native/Expo, `react-native-webview` (présent), `expo-web-browser` + `expo-auth-session` (à ajouter), `expo-crypto` (PKCE, à confirmer). (002-tiktok-videos)
- PostgreSQL (champs TikTok sur `Supplier`) ; Redis (cache liste vidéos, TTL court). (002-tiktok-videos)
- TypeScript strict, Node.js 24.13.0 (API/web) ; React Native 0.81.5 / Expo SDK 54, React 19.1 (mobile) + API — NestJS, MikroORM 6 (PostgreSQL + PostGIS), Zod + nzoth (`@TypedBody`), Better Auth, firebase-admin (FCM), `@nestjs/schedule` (cron). Mobile — Expo (npm hors workspace pnpm, `legacy-peer-deps`), React Navigation 7, `expo-location`, `expo-notifications` (token FCM natif), `react-native-mmkv` (file hors-ligne), `@react-native-community/netinfo`, socket.io-client (chat uniquement). Web-spa — React 19 + SDK généré `@boilerstone/openapi-generator`. (005-split-three-apps)
- PostgreSQL + PostGIS (`geography(Point,4326)` en SQL brut, pattern `suppliers.service.ts`) ; Redis (cache) ; media via module `media` existant (R2/MinIO) (005-split-three-apps)
- Aucune technologie nouvelle : pile identique à 005. Deux tables PostgreSQL ajoutées — `checkouts` (un paiement couvre N commandes) et `delivery_runs` (une tournée regroupe N livraisons). `Order`, `Payment.order` et `Delivery.order` restent inchangés. (006-unified-cart)
- TypeScript strict, Node.js 24.13.0 (API) ; React Native 0.81.5 / Expo SDK 54, React 19.1 (mobile) + NestJS, MikroORM 6, Zod + nzoth (`@TypedBody`), Better Auth, CASL (API) ; React Navigation 7 (mobile) ; React 19 + SDK OpenAPI généré (back-office) (007-product-reviews)
- PostgreSQL — une table `product_reviews`, deux colonnes sur `products` (007-product-reviews)

## Lint rules — avoid these 8 repeat offenders

Project uses `@antfu/eslint-config` strict. Run `pnpm lint` before declaring work done (exit code 0 = done, warnings are tolerated).

1. **No `any`** (`ts/no-explicit-any`) — RN event handlers → `GestureResponderEvent`; untyped API data → `Record<string, unknown>` + `as` per field. Exception: `apps/mobile/src/app/navigation.tsx` + `navigation-ref.ts` have the rule off (React Nav / React 19 types incompat).
2. **1 statement per line** (`style/max-statements-per-line`) — `onPress={() => { a(); b() }}` is forbidden. Use a block body across multiple lines. Same for `return () => { cancelled = true }` and one-liner `useEffect(() => { load() }, [])`.
3. **No unused vars** (`unused-imports/no-unused-vars`, `/^_/` whitelist) — prefix with `_` or delete. Destructure skip: `const [, setX] = useState()`.
4. **Non-capturing regex groups** (`regexp/no-unused-capturing-group`) — use `(?:...)` when not captured.
5. **No bare `console.log`** (`no-console`) — only `warn` / `error` allowed. Dev placeholders → `(_id) => { /* pending */ }`.
6. **`require()` allowed ONLY in `apps/mobile/**`** (`ts/no-require-imports`) — for RN image assets. Everywhere else: ES imports.
7. **Explicit Buffer import** (`node/prefer-global/buffer`) — `import { Buffer } from 'node:buffer'` at top of API files using Buffer.
8. **No nested component definitions** (`react/no-nested-component-definitions`) — hoist sub-components to top-level and pass as reference.

React Compiler rules (`react-hooks/refs`, `react-hooks/set-state-in-effect`, `react-hooks-extra/no-direct-set-state-in-use-effect`, etc.) are **intentionally disabled** — they produce false positives on legitimate patterns (RN Animated API, initial-data-fetch effects). Don't try to refactor around them.

## Recent Changes
- 007-product-reviews: Added TypeScript strict, Node.js 24.13.0 (API) ; React Native 0.81.5 / Expo SDK 54, React 19.1 (mobile) + NestJS, MikroORM 6, Zod + nzoth (`@TypedBody`), Better Auth, CASL (API) ; React Navigation 7 (mobile) ; React 19 + SDK OpenAPI généré (back-office)
- 006-unified-cart: panier unifié multi-boutiques — un passage en caisse crée N commandes ; regroupement par `checkouts` et `delivery_runs`, sans toucher aux entités par commande.
- 005-split-three-apps: Added TypeScript strict, Node.js 24.13.0 (API/web) ; React Native 0.81.5 / Expo SDK 54, React 19.1 (mobile) + API — NestJS, MikroORM 6 (PostgreSQL + PostGIS), Zod + nzoth (`@TypedBody`), Better Auth, firebase-admin (FCM), `@nestjs/schedule` (cron). Mobile — Expo (npm hors workspace pnpm, `legacy-peer-deps`), React Navigation 7, `expo-location`, `expo-notifications` (token FCM natif), `react-native-mmkv` (file hors-ligne), `@react-native-community/netinfo`, socket.io-client (chat uniquement). Web-spa — React 19 + SDK généré `@boilerstone/openapi-generator`.
