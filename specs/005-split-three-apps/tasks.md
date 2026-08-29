# Tasks: Séparation en 3 applications mobiles (Client, Fournisseur, Livreur)

**Input**: Design documents from `/specs/005-split-three-apps/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/deliveries-api.md, quickstart.md

**Tests**: le projet impose `pnpm test` au pre-push ; des tests unitaires ciblés sont inclus pour la logique critique du service livraison (claim atomique, transitions, dispatch) selon le pattern existant (`delivery-fee.spec.ts`).

**Organization**: tâches groupées par user story (US1 livreur, US2 fournisseur, US3 client, US4 admin) pour livraison incrémentale indépendante.

## Format: `[ID] [P?] [Story] Description`

- **[P]** : parallélisable (fichiers différents, pas de dépendance sur une tâche incomplète)
- **[Story]** : US1–US4 (mapping spec.md)

## Rappels conventions (obligatoires pour chaque tâche)

- Pas de point-virgule ; commentaires de code en anglais ; UI en français avec accents corrects, vouvoiement, vocabulaire officiel (« Fournisseur », « Acheteur », « Itinéraire », « Course »)
- 8 règles lint (CLAUDE.md) : pas de `any`, 1 statement/ligne, imports inutilisés supprimés, `(?:...)`, pas de `console.log`, `require` seulement dans `apps/mobile`, `import { Buffer } from 'node:buffer'`, pas de composants imbriqués
- API : contrats Zod + `@TypedBody` (nzoth), mapper statique `toResponse`, PostGIS en SQL brut via `em.getConnection().execute`
- Mobile : `theme.ts` central (jamais de hex), `StyleSheet.create`, `apiFetch` (`src/utils/api-client.ts`), touch targets 44px, `accessibilityLabel`
- `pnpm lint && pnpm typecheck` avant de déclarer une phase terminée

---

## Phase 1: Setup — infrastructure des variantes de build

**Purpose**: produire 3 apps depuis le codebase unique (décision R1)

- [X] T001 Convertir `apps/mobile/app.json` en `apps/mobile/app.config.ts` dynamique lisant `process.env.APP_VARIANT` (`client` défaut | `supplier` | `courier`) : par variante `name` (eBio / eBio Fournisseur / eBio Livreur), `android.package` (`com.ebio.mobile` / `com.ebio.supplier` / `com.ebio.courier`), `icon`, `scheme`, `googleServicesFile`, deep links (intentFilter `e-bio.org` uniquement variante client) ; supprimer `app.json`
- [X] T002 [P] Mettre à jour `apps/mobile/eas.json` : profils `development|preview|production` déclinés par variante (`-client`, `-supplier`, `-courier`) avec `env.APP_VARIANT`, et `submit` par variante ; ajouter les scripts npm `dev:client|dev:supplier|dev:courier` dans `apps/mobile/package.json`
- [X] T003 Créer l'aiguillage d'entrée : `apps/mobile/index.js` (remplace `main: node_modules/expo/AppEntry.js` dans package.json) + adapter `apps/mobile/App.tsx` pour charger la navigation de la variante (`navigation.client.tsx` / `navigation.supplier.tsx` / `navigation.courier.tsx`) via `process.env.APP_VARIANT` inliné au build ; icônes placeholder par variante dans `apps/mobile/assets/`

**Checkpoint**: `APP_VARIANT=client npx expo start` lance l'app actuelle à l'identique (navigation.client provisoirement = navigation actuelle)

---

## Phase 2: Foundational — socle backend livraison (bloquant)

**⚠️ CRITICAL**: aucune user story ne démarre avant la fin de cette phase

- [X] T004 Ajouter `COURIER` à l'enum `UserRole` dans `apps/api/src/modules/auth/auth.entity.ts`
- [X] T005 [P] Créer l'entité `CourierProfile` (data-model.md : user unique, fullName, phone, vehicleType, zone, identityDocument, validationStatus, rejectionReason, isAvailable, lastKnownLocation geography+GiST, lastLocationAt, validatedAt/By) dans `apps/api/src/modules/deliveries/entities/courier-profile.entity.ts`
- [X] T006 [P] Créer l'entité `Delivery` (order OneToOne, courier nullable, DeliveryStatus, adresses snapshot, pickupLocation, confirmationCode, proofType/proofMediaId, failReason/failComment, horodatages par étape, reassignmentCount, broadcastRadiusKm) dans `apps/api/src/modules/deliveries/entities/delivery.entity.ts`
- [X] T007 [P] Créer l'entité `DeliveryEvent` (delivery FK indexé, DeliveryEventType, actorUserId, payload jsonb, occurredAt, createdAt) dans `apps/api/src/modules/deliveries/entities/delivery-event.entity.ts`
- [X] T008 [P] Ajouter les `NotificationType` : `DELIVERY_OFFER`, `DELIVERY_ASSIGNED`, `DELIVERY_PICKED_UP`, `DELIVERY_FAILED`, `DELIVERY_REASSIGNED`, `COURIER_VALIDATED`, `COURIER_REJECTED`, `COURIER_SUSPENDED` dans `apps/api/src/modules/notifications/notification.entity.ts`
- [X] T009 Étendre CASL : subjects `Delivery` + `CourierProfile` et case fallback `COURIER` dans `apps/api/src/modules/auth/casl/casl-ability.factory.ts`
- [X] T010 Seed RBAC : rôle `COURIER` + permissions (contracts/deliveries-api.md) + nouvelles permissions dans `apps/api/src/seeders/rbac.seeder.ts`
- [X] T011 Créer la migration MikroORM (enum user role, tables `courier_profiles`/`deliveries`/`delivery_events` avec colonnes geography en SQL brut, pattern `Migration20260323200000`) dans `apps/api/src/modules/db/migrations/`
- [X] T012 Créer les contrats Zod (register courier, profile, availability, location, offer, delivery detail, transitions avec `occurredAt?` optionnel, proof CODE|PHOTO, fail reasons, réponses mappées) dans `apps/api/src/modules/deliveries/contracts/delivery.contract.ts`
- [X] T013 Scaffold `apps/api/src/modules/deliveries/deliveries.module.ts` + enregistrement dans `apps/api/src/app.module.ts`

**Checkpoint**: `pnpm db:migrate:up` + `seeder RbacSeeder` passent ; entités chargées ; user stories déblocables en parallèle

---

## Phase 3: User Story 1 — Le livreur réalise une livraison de bout en bout (P1) 🎯 MVP

**Goal**: cycle complet candidature → disponibilité → offre → acceptation → retrait → livraison avec preuve, statuts commande et notifications client/fournisseur

**Independent Test**: compte livreur validé (via SQL/seed en attendant US4), commande `DELIVERY` passée `READY` → offre visible, cycle complet via l'app Livreur, notifications reçues côté client et fournisseur (spec US1 scénarios 1–4)

### Backend

- [X] T014 [US1] Implémenter la partie profil livreur de `apps/api/src/modules/deliveries/deliveries.service.ts` + `apps/api/src/modules/deliveries/couriers.controller.ts` : `POST /api/couriers/register` (409 si existant), `GET/PATCH /api/couriers/me`, `PATCH /api/couriers/me/availability` (403 si non validé/suspendu), `PATCH /api/couriers/me/location` (SQL brut `ST_MakePoint`, pattern `suppliers.service.ts:241`)
- [X] T015 [US1] Implémenter `apps/api/src/modules/deliveries/dispatch.service.ts` : `findNearbyCouriers` (`ST_DWithin` sur `lastKnownLocation`, validés + disponibles, **position fraîche : `lastLocationAt > now() - 12 h` sinon livreur ignoré**, pattern `suppliers.service.ts:162`), **fallback si `pickupLocation` null : diffusion à tous les livreurs disponibles sans filtre distance + notification au fournisseur de renseigner sa position**, `broadcast` (push FCM `DELIVERY_OFFER` via `NotificationsService`), crons `@Cron` toutes les 2 min : rediffusion (`AWAITING_COURIER` > 10 min → rayon +5 km plafond 25 km, event `BROADCAST`) et réattribution (`ACCEPTED` > 15 min sans pickup → `courier_id = NULL`, event `REASSIGNED`, notification `DELIVERY_REASSIGNED`)
- [X] T016 [US1] Implémenter le cycle de vie dans `deliveries.service.ts` : `createForOrder` (snapshot adresses + `pickupLocation` fournisseur, event `CREATED`, diffusion initiale), `accept` (claim atomique `UPDATE deliveries SET courier_id = ?, status = 'ACCEPTED' WHERE id = ? AND courier_id IS NULL` → 409 sinon, notifications `DELIVERY_ASSIGNED`), `pickup` (génère `confirmationCode` 4 chiffres, Order → `IN_DELIVERY` via `OrdersService`, notification client `DELIVERY_PICKED_UP` avec le code dans `data`), `start`, `complete` (vérif code 422 si faux, ou photo mediaId ; Order → `DELIVERED` via `applyStatus`), `fail` (motif + `DELIVERY_FAILED` fournisseur), `occurredAt` borné (≤ now, ≥ event précédent), chaque transition journalisée dans `DeliveryEvent`
- [X] T017 [US1] Modifier `apps/api/src/modules/orders/orders.service.ts` : hook dans `updateStatus`/`applyStatus` — passage à `READY` avec `pickupMode = DELIVERY` → `deliveriesService.createForOrder` ; transitions `IN_DELIVERY`/`DELIVERED` désormais déclenchables par le module deliveries (bypass du scope fournisseur pour ces appels internes) ; **auto-livraison : transition manuelle fournisseur `READY → IN_DELIVERY` avec Delivery `AWAITING_COURIER` → Delivery `CANCELLED` + event `SELF_DELIVERED`, diffusion stoppée, offre retirée** ; annulation d'une commande avec Delivery active → Delivery `CANCELLED` + event `ORDER_CANCELLED` + notification du livreur assigné
- [X] T018 [US1] Implémenter `apps/api/src/modules/deliveries/deliveries.controller.ts` : `GET /api/deliveries/offers` (tri par distance), `POST /:id/accept|pickup|start|complete|fail`, `GET /api/deliveries/mine?status=active|done`, `GET /api/deliveries/:id` (visibilité livreur assigné/fournisseur/acheteur/admin, téléphone acheteur pour livreur assigné uniquement), `GET /api/deliveries/by-order/:orderId` (code visible acheteur uniquement), `POST /:id/rebroadcast` (fournisseur, 409 si assignée) — guards `AuthGuard` + `CaslGuard` + décorateurs `@CanX`
- [X] T019 [P] [US1] Créer `apps/api/src/modules/deliveries/deliveries.mapper.ts` (toResponse par audience : courier / supplier / buyer / admin)
- [X] T020 [P] [US1] Tests unitaires du cycle dans `apps/api/src/modules/deliveries/deliveries.service.spec.ts` : claim concurrent (2e accept → 409), transitions invalides rejetées, `occurredAt` borné, code de confirmation faux → 422, couplage statuts Order
- [X] T021 [P] [US1] Tests dispatch dans `apps/api/src/modules/deliveries/dispatch.service.spec.ts` : éligibilité (validé + disponible + rayon), élargissement du rayon, réattribution (helper PostGIS `test-db.helper.ts`)

### Mobile (variante courier)

- [X] T022 [US1] Créer `apps/mobile/src/app/navigation.courier.tsx` : gating par `GET /api/couriers/me` (404 → onboarding ; PENDING/REJECTED → écran d'attente ; VALIDATED → tabs Courses | Historique | Profil), réutilise ScreenHeader/theme
- [X] T023 [P] [US1] Écrans onboarding + candidature dans `apps/mobile/src/features/courier/components/onboarding-screen.tsx` et `courier-registration-form.tsx` (identité, téléphone, véhicule, zone, pièce via `use-media-upload` existant)
- [X] T024 [P] [US1] Écran d'attente/refus dans `apps/mobile/src/features/courier/components/pending-screen.tsx` (statut candidature, motif de refus, resoumission)
- [X] T025 [P] [US1] Liste des offres dans `apps/mobile/src/features/courier/components/offers-screen.tsx` + hook `apps/mobile/src/features/courier/hooks/use-offers.ts` (fetch + pull-to-refresh + refresh sur notification `DELIVERY_OFFER`) : distance, retrait, dépôt, montant « X XXX FCFA » en JetBrains Mono, bouton Accepter (gestion 409 « course déjà prise »)
- [X] T026 [US1] Course active dans `apps/mobile/src/features/courier/components/active-delivery-screen.tsx` + `delivery-detail.tsx` : étape courante, bouton « Itinéraire » (intent `geo:`/Google Maps vers retrait puis dépôt), contacts (appel fournisseur/acheteur), boutons de transition (Récupérée → En route → Livrée / Échec avec motifs), **état « course annulée » (Delivery `CANCELLED` détectée au refresh ou via notification : message + retrait de la liste active)**, hook `use-active-delivery.ts`
- [X] T027 [US1] Preuve de livraison dans `apps/mobile/src/features/courier/components/proof-screen.tsx` : saisie code 4 chiffres (nominal) ou photo (`expo-image-picker` + module media), gestion code invalide
- [X] T028 [P] [US1] Historique dans `apps/mobile/src/features/courier/components/history-screen.tsx` (`GET /api/deliveries/mine?status=done`, détail par course)
- [X] T029 [P] [US1] Profil livreur + disponibilité dans `apps/mobile/src/features/courier/components/courier-profile-screen.tsx` et `availability-toggle.tsx` : switch en ligne/hors ligne (envoie la position via `expo-location` au passage en ligne), édition profil
- [X] T030 [US1] File hors-ligne dans `apps/mobile/src/features/courier/hooks/use-offline-queue.ts` : transitions empilées en MMKV avec `occurredAt` local, rejeu séquentiel au retour réseau (`netinfo`), bannière ConnectivityBanner existante
- [X] T031 [US1] Routage des notifications dans `apps/mobile/src/features/notifications/hooks/use-notifications.ts` : variante courier — `DELIVERY_OFFER` → offres, `DELIVERY_REASSIGNED`/annulation → course concernée, `COURIER_*` → profil/candidature ; variante client — `DELIVERY_PICKED_UP` → `OrderTracking` (routage client existant conservé)

**Checkpoint**: cycle complet livreur fonctionnel de bout en bout — MVP démontrable

---

## Phase 4: User Story 2 — App Fournisseur dédiée (P2)

**Goal**: app Fournisseur avec parité fonctionnelle complète, sans ModeSwitch, + visibilité livraison

**Independent Test**: connexion d'un compte fournisseur existant sur la variante supplier → dashboard direct, toutes les fonctions du mode actuel accessibles, passage d'une commande à « Prête » déclenche l'attribution (spec US2 scénarios 1–3)

- [X] T032 [US2] Créer `apps/mobile/src/app/navigation.supplier.tsx` : racine = SupplierDashboard, stacks avec les écrans existants (SupplierProducts/Orders/Settings/ShopProfile/Reviews/OpeningHours/SalesPoints/Wallet/PromoCodes/DeliveryZones/Mode), tabs Chat + Notifications + Profil, auth (login/register/forgot) — réutilisation des composants `features/supplier-dashboard/*` sans modification
- [X] T033 [US2] Parcours non-fournisseur dans la variante supplier : compte sans profil fournisseur → écran d'orientation (créer sa boutique via `SupplierRegistration` existant, ou message « cette app est destinée aux fournisseurs » + lien vers eBio client) dans un nouveau fichier `apps/mobile/src/features/supplier-dashboard/components/supplier-gate-screen.tsx`
- [X] T034 [US2] Enrichir `apps/mobile/src/features/supplier-dashboard/components/order-detail-screen.tsx` : bloc livraison (`GET /api/deliveries/by-order/:orderId`) — « En attente de livreur » avec bouton « Relancer la recherche » (`POST /api/deliveries/:id/rebroadcast`), livreur assigné (nom, téléphone), timeline des étapes, état échec avec motif
- [X] T035 [US2] Retirer le ModeSwitch de `apps/mobile/src/features/supplier-dashboard/components/dashboard-screen.tsx` (prop `onSwitchToBuyer` et rendu associé)
- [X] T036 [US2] Audit de parité : vérifier que chaque écran listé dans navigation.tsx actuel (Supplier*) est joignable dans navigation.supplier.tsx, corriger les écarts (SC-003)

**Checkpoint**: app Fournisseur autonome et complète

---

## Phase 5: User Story 3 — App Client allégée + suivi de livraison (P3)

**Goal**: app actuelle recentrée achat, mode fournisseur retiré, suivi de livraison enrichi

**Independent Test**: variante client → aucun point d'entrée fournisseur, bannière migration pour comptes SUPPLIER, commande suivie étape par étape avec code de confirmation (spec US3 scénarios 1–2)

- [X] T037 [US3] Créer `apps/mobile/src/app/navigation.client.tsx` à partir du navigation.tsx actuel : retirer tous les écrans `Supplier*` (sauf SupplierProfile/SupplierRegistration côté acheteur), conserver les 5 tabs actuels, deep links inchangés
- [X] T038 [US3] Adapter `apps/mobile/src/features/profile/components/profile-screen.tsx` (variante client) : retrait du ModeSwitch, bannière « Votre boutique a déménagé — installez eBio Fournisseur » (lien Play Store `com.ebio.supplier`) pour les comptes avec `supplierStatus.isSupplier`
- [X] T039 [US3] Enrichir `apps/mobile/src/features/orders/components/order-tracking.tsx` : à partir de `IN_DELIVERY`, afficher le livreur (nom, bouton d'appel) et le **code de confirmation** (`GET /api/deliveries/by-order/:orderId`), mention échec de livraison le cas échéant
- [ ] T040 [US3] Passe de non-régression des parcours d'achat variante client (SC-007) : recherche, fiche boutique, panier, checkout, commandes, avis, wallet, notifications — corriger tout écran cassé par le découpage

**Checkpoint**: les 3 variantes buildent et fonctionnent indépendamment

---

## Phase 6: User Story 4 — Validation et supervision des livreurs (P4)

**Goal**: back-office admin pour candidatures et supervision livreurs

**Independent Test**: candidature soumise depuis l'app Livreur → visible et approuvable dans web-spa → le livreur passe de l'écran d'attente à l'accès complet (spec US4 scénarios 1–2)

- [X] T041 [US4] Implémenter `apps/api/src/modules/deliveries/admin-couriers.controller.ts` + méthodes service : `GET /api/admin/couriers` (paginé, filtre statut), `GET /:id` (détail + stats livraisons), `POST /:id/approve|reject|suspend|reactivate`, `GET /api/admin/deliveries` (supervision paginée, filtres) — guard ADMIN (`manage:all`)
- [X] T042 [US4] À l'approbation : `user.role = COURIER` (pattern `SuppliersService.register`) + notifications `COURIER_VALIDATED`/`COURIER_REJECTED`/`COURIER_SUSPENDED` ; suspension → `isAvailable = false` + réattribution des courses actives via `dispatch.service`
- [X] T043 [US4] Régénérer le SDK (`pnpm generate`, API lancée) pour exposer les endpoints admin au web-spa
- [X] T044 [P] [US4] Créer `apps/web-spa/app/features/couriers/` (pattern pages/forms/components/utils, source dans `app/` pas `src/`) : page liste des candidatures (filtres par statut, badge), page détail (infos, pièce d'identité via media, historique livraisons) — via le SDK généré
- [X] T045 [US4] Actions admin dans `apps/web-spa/app/features/couriers/` : approuver / refuser (avec motif) / suspendre / réactiver + entrée de menu dans la navigation admin existante

**Checkpoint**: cycle complet sans intervention SQL

---

## Phase 7: Polish, distribution & transition

- [X] T046 Supprimer `apps/mobile/src/features/common/components/mode-switch.tsx` et le code mort du mode (ancien `navigation.tsx` remplacé par les 3 entrées, imports résiduels)
- [ ] T047 [P] Firebase : ajouter les apps Android `com.ebio.supplier` et `com.ebio.courier` au projet existant, télécharger `apps/mobile/google-services.supplier.json` et `apps/mobile/google-services.courier.json` (référencés par app.config.ts)
- [ ] T048 [P] Google Sign-In : déclarer les SHA-1 (keystore EAS + Play App Signing) des 2 nouvelles apps dans la console Google Cloud (mémoire projet : une empreinte par keystore)
- [ ] T049 Play Console (manuel) : créer les fiches « eBio Fournisseur » et « eBio Livreur », formulaires Data Safety + classification, upload manuel du premier AAB de chaque app, test fermé si exigé par le compte
- [ ] T050 Builds/submits : `eas build --profile production-client|supplier|courier` puis `eas submit` par profil (client = mise à jour de l'app publiée)
- [X] T051 Qualité : `pnpm lint && pnpm typecheck && pnpm test` à la racine + `npm run typecheck` dans `apps/mobile` — zéro erreur ; **vérifier qu'aucun endpoint consommé par l'app publiée n'a été supprimé ou modifié de façon incompatible (FR-020, diff des routes orders/suppliers/auth/notifications)**
- [ ] T052 Dérouler `specs/005-split-three-apps/quickstart.md` de bout en bout (3 variantes en dev + cycle livraison complet) et corriger les écarts

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)** : indépendante — peut démarrer immédiatement
- **Phase 2 (Foundational)** : indépendante de la phase 1 — bloque US1 et US4
- **US1 (Phase 3)** : backend T014–T021 après Phase 2 ; mobile T022–T031 après Phase 1 + T018 (endpoints)
- **US2 (Phase 4)** : après Phase 1 ; T034 dépend de T018 (`by-order`, `rebroadcast`)
- **US3 (Phase 5)** : après Phase 1 ; T039 dépend de T018 (`by-order`)
- **US4 (Phase 6)** : après Phase 2 ; T044–T045 dépendent de T041–T043 ; indépendante de US1 côté UI
- **Phase 7** : T046 après US2+US3 ; T047–T050 après que les variantes buildent ; T049 peut être anticipée (création de fiches = délai externe Play)

### Parallel Opportunities

- Phase 1 ∥ Phase 2 (mobile vs backend, aucun fichier commun)
- Après Phase 2 : backend US1 (T014–T021) ∥ US2 (T032–T036) ∥ US3 (T037–T040) — équipes/fichiers distincts
- T005/T006/T007/T008 en parallèle ; T019/T020/T021 en parallèle ; T023/T024/T025/T028/T029 en parallèle
- T047/T048 en parallèle (consoles externes)

## Implementation Strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (US1)** : la livraison traçable est la valeur nouvelle ; livreurs validés en SQL en attendant US4. Ensuite incréments : US2 (app Fournisseur) → US3 (app Client) → US4 (admin) → distribution. À chaque checkpoint : `pnpm lint && pnpm typecheck && pnpm test` + test manuel du critère d'indépendance de la story.

**Point d'attention transition (FR-020)** : ne rien casser des endpoints consommés par l'app publiée — les tâches backend n'introduisent aucun breaking change (nouveaux endpoints + hook interne uniquement).
