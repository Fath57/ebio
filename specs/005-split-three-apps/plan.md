# Implementation Plan: Séparation en 3 applications mobiles (Client, Fournisseur, Livreur)

**Branch**: `005-split-three-apps` | **Date**: 2026-08-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-split-three-apps/spec.md`

## Summary

L'app mobile unique (acheteur + fournisseur via ModeSwitch) devient **trois applications Android** distribuées séparément sur le Play Store, produites depuis **un seul codebase Expo** par variantes de build (`APP_VARIANT` + `app.config.ts` dynamique) : eBio (client, mise à jour de l'app publiée `com.ebio.mobile`), eBio Fournisseur (`com.ebio.supplier`), eBio Livreur (`com.ebio.courier`, nouveau profil). Côté backend unique : nouveau rôle `COURIER` (pattern RBAC existant), nouveau module `deliveries` (entités `CourierProfile`, `Delivery`, `DeliveryEvent`), diffusion des courses par proximité PostGIS + FCM avec acceptation first-write-wins, sans aucun nouveau statut de commande (`READY → IN_DELIVERY → DELIVERED` réutilisés). Détail des décisions : [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript strict, Node.js 24.13.0 (API/web) ; React Native 0.81.5 / Expo SDK 54, React 19.1 (mobile)
**Primary Dependencies**: API — NestJS, MikroORM 6 (PostgreSQL + PostGIS), Zod + nzoth (`@TypedBody`), Better Auth, firebase-admin (FCM), `@nestjs/schedule` (cron). Mobile — Expo (npm hors workspace pnpm, `legacy-peer-deps`), React Navigation 7, `expo-location`, `expo-notifications` (token FCM natif), `react-native-mmkv` (file hors-ligne), `@react-native-community/netinfo`, socket.io-client (chat uniquement). Web-spa — React 19 + SDK généré `@boilerstone/openapi-generator`.
**Storage**: PostgreSQL + PostGIS (`geography(Point,4326)` en SQL brut, pattern `suppliers.service.ts`) ; Redis (cache) ; media via module `media` existant (R2/MinIO)
**Testing**: Vitest/Jest côté API (pattern `delivery-fee.spec.ts`, `test-db.helper.ts` avec PostGIS) ; `pnpm lint && pnpm typecheck && pnpm test` (hook pre-push)
**Target Platform**: Android (3 apps Play Store) ; API Linux (Dokku)
**Project Type**: monorepo — mobile app (3 variantes de build) + API NestJS + web-spa admin
**Performance Goals**: notification de changement d'étape < 1 min (SC-004) ; diffusion d'offre aux livreurs ≤ 30 s après passage `READY`
**Constraints**: aucun breaking change d'API pour les versions mobiles publiées (transition FR-020) ; position livreur foreground uniquement (pas de background location Play Store) ; mises à jour de statut hors-ligne rejouables (FR-018)
**Scale/Scope**: ~15 écrans nouveaux/remaniés côté mobile (courier ~8, ajustements client/fournisseur), 1 module API nouveau (~20 endpoints), 3 entités, 1 migration, 2 crons, 2 nouvelles fiches Play Store

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principe | Statut | Justification |
|---|---|---|
| I. Design System Compliance | ✅ PASS | Les 3 variantes consomment le même `src/theme/theme.ts` (palette, DM Serif Display / Plus Jakarta Sans / JetBrains Mono, dark mode). Les nouveaux écrans livreur suivent les composants existants (ScreenHeader, Badge, PriceTag). |
| II. Brand Consistency | ✅ PASS | Vocabulaire : « Fournisseur », « Acheteur », « Itinéraire » (bouton navigation livreur), « Commander ». Nouveau terme « Livreur »/« Course » à ajouter au vocabulaire officiel. FR (Bénin), vouvoiement, formats « 1 200 FCFA ». |
| III. Monorepo Architecture | ⚠️ PASS avec écart préexistant | Backend/web-spa : contrats Zod + SDK généré respectés. **Mobile n'a jamais consommé le SDK généré** (fetch maison `apiFetch`, app hors workspace pnpm) — écart antérieur à cette feature, non aggravé ici. Voir Complexity Tracking. |
| IV. Accessibility First | ✅ PASS | Touch targets 44px, `accessibilityLabel` sur les actions livreur (accepter, itinéraire, statuts), statuts toujours icône + texte (jamais couleur seule). |
| V. TypeScript Strict | ✅ PASS | Contrats Zod + `z.infer`, DTO typés `@TypedBody`, pas de `any`. |
| VI. Token-Based Styling | ✅ PASS | `theme.ts` central importé partout ; aucun hex hors fichiers de tokens. |

**Post-Phase 1 re-check**: ✅ inchangé — le design (data-model, contrats) n'introduit aucune violation nouvelle.

## Project Structure

### Documentation (this feature)

```text
specs/005-split-three-apps/
├── plan.md              # Ce fichier
├── research.md          # Décisions R1–R10 (variantes de build, RBAC, dispatch…)
├── data-model.md        # CourierProfile, Delivery, DeliveryEvent, enums
├── quickstart.md        # Lancer/build les 3 variantes, prérequis externes
├── contracts/
│   └── deliveries-api.md  # Endpoints module deliveries + admin couriers
└── tasks.md             # (/speckit.tasks — pas encore créé)
```

### Source Code (repository root)

```text
apps/api/src/
├── modules/deliveries/                  # NOUVEAU module
│   ├── deliveries.module.ts
│   ├── couriers.controller.ts           # /api/couriers/* (candidature, profil, dispo, position)
│   ├── deliveries.controller.ts         # /api/deliveries/* (offres, accept, transitions, preuve)
│   ├── admin-couriers.controller.ts     # /api/admin/couriers/* + /api/admin/deliveries
│   ├── deliveries.service.ts            # cycle de vie, claim atomique, couplage Order.applyStatus
│   ├── dispatch.service.ts              # diffusion PostGIS + FCM, crons rediffusion/réattribution
│   ├── deliveries.mapper.ts
│   ├── entities/
│   │   ├── courier-profile.entity.ts
│   │   ├── delivery.entity.ts
│   │   └── delivery-event.entity.ts
│   └── contracts/delivery.contract.ts   # Zod
├── modules/orders/orders.service.ts     # MODIFIÉ : hook READY → création Delivery ; transitions IN_DELIVERY/DELIVERED déclenchables par deliveries
├── modules/auth/auth.entity.ts          # MODIFIÉ : UserRole + COURIER
├── modules/auth/casl/casl-ability.factory.ts  # MODIFIÉ : subjects Delivery/CourierProfile + case COURIER
├── modules/notifications/notification.entity.ts  # MODIFIÉ : nouveaux NotificationType
├── seeders/rbac.seeder.ts               # MODIFIÉ : rôle COURIER + permissions
└── modules/db/migrations/MigrationXXXX.ts  # NOUVELLE migration

apps/mobile/
├── app.config.ts                        # NOUVEAU (remplace app.json) : variantes via APP_VARIANT
├── eas.json                             # MODIFIÉ : profils par variante
├── google-services.json / .supplier.json / .courier.json
├── index.js                             # entrée : sélection de la navigation par variante
└── src/
    ├── app/
    │   ├── navigation.client.tsx        # tabs actuels SANS écrans Supplier* ni ModeSwitch
    │   ├── navigation.supplier.tsx      # racine = dashboard fournisseur (écrans Supplier* existants)
    │   ├── navigation.courier.tsx       # NOUVEAU : Courses | Historique | Profil
    │   └── navigation-ref.ts            # inchangé
    ├── features/courier/                # NOUVEAU
    │   ├── components/ (onboarding-screen, pending-screen, offers-screen,
    │   │   active-delivery-screen, delivery-detail, proof-screen, history-screen,
    │   │   availability-toggle, courier-profile-screen)
    │   └── hooks/ (use-offers, use-active-delivery, use-offline-queue)
    ├── features/orders/                 # MODIFIÉ : timeline client enrichie (livreur, code de confirmation)
    ├── features/supplier-dashboard/     # DÉPLACÉ tel quel sous l'entrée supplier ; order-detail : état « en attente de livreur » + relance
    ├── features/profile/                # MODIFIÉ : retrait ModeSwitch (variante client), bannière « installez eBio Fournisseur »
    └── features/common/components/mode-switch.tsx  # SUPPRIMÉ à terme

apps/web-spa/app/features/couriers/      # NOUVEAU : pages/forms/components/utils (pattern features web-spa)
```

**Structure Decision**: monorepo existant conservé ; le mobile reste un projet npm unique hors workspace pnpm produisant 3 variantes de build (décision R1) ; nouveau module NestJS `deliveries` auto-contenu selon le pattern module standard du projet ; admin livreurs dans web-spa selon le pattern `features/` (source dans `app/`, pas `src/`).

## Phasage de livraison (aligné sur les priorités de la spec)

1. **Backend livraison** (US1 socle) : migration + entités + RBAC + module deliveries + hook orders + crons + notifications. Testable via API seule.
2. **Infra variantes** : `app.config.ts`, `eas.json`, entrées de navigation par variante, `navigation.supplier.tsx` (US2) et `navigation.client.tsx` (US3) par découpage du navigateur actuel.
3. **App Livreur** (US1 UI) : onboarding/candidature, attente, offres, course active (itinéraire via intent maps), preuve, historique, file hors-ligne.
4. **Admin livreurs** (US4) : web-spa + endpoints admin.
5. **Transition & stores** : bannière migration fournisseur côté client, création manuelle des 2 fiches Play, Firebase + SHA-1, builds/submits par profil.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Mobile n'utilise pas le SDK OpenAPI généré (Constitution III/V) | Écart préexistant : l'app mobile a été construite sur `apiFetch` maison, hors workspace pnpm (contrainte EAS/npm), sans dépendance au package `@boilerstone/openapi-generator` | Migrer le mobile vers le SDK dans cette feature doublerait le périmètre (tous les écrans existants) pour un gain orthogonal à la séparation des apps ; proposé comme feature dédiée ultérieure. **Justification acceptée explicitement (analyse C1, 2026-08-24)** — la migration SDK mobile fera l'objet d'une feature séparée |
| 3 fichiers `google-services*.json` + credentials par variante | Firebase/FCM et Google Sign-In exigent une config par package Android | Un seul package Android est impossible : 3 fiches Play Store distinctes sont l'objectif produit |
