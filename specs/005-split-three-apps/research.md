# Research: Séparation en 3 applications mobiles (Client, Fournisseur, Livreur)

**Feature**: `005-split-three-apps` | **Date**: 2026-08-24

## R1 — Architecture mobile : 1 codebase, 3 variantes d'app (app.config.ts + APP_VARIANT)

**Decision**: Conserver un seul projet Expo (`apps/mobile`) et produire les 3 applications comme des **variantes de build** : conversion de `app.json` (statique) en `app.config.ts` (dynamique) qui lit `process.env.APP_VARIANT` (`client` | `supplier` | `courier`) et retourne par variante : `name`, `slug`-compatible identity, `android.package`, icône, `googleServicesFile`, deep links. Chaque variante a son **point d'entrée de navigation dédié** (`src/app/navigation.client.tsx`, `navigation.supplier.tsx`, `navigation.courier.tsx`) sélectionné au build ; Metro ne bundle que ce qui est importé par l'entrée choisie.

**Rationale**:
- `apps/mobile` est **hors workspace pnpm** (`pnpm-workspace.yaml` exclut `!apps/mobile` ; npm + `legacy-peer-deps`, `package-lock.json` propre, Metro sans `watchFolders`). Trois apps séparées exigeraient soit un workspace npm mobile + `watchFolders` Metro, soit un package publié — coût et fragilité élevés pour zéro gain fonctionnel.
- Le partage de code demandé par la spec (client API, thème, auth, composants) devient trivial : tout reste dans `src/`, aucune extraction de package nécessaire. `features/supplier-dashboard` est simplement importé uniquement par l'entrée `supplier`.
- Pattern officiellement documenté par Expo (« app variants ») : `eas.json` définit des profils de build par variante avec `env.APP_VARIANT`, EAS gère des credentials distincts par identifiant d'application Android au sein d'un même projet EAS.
- Une seule chaîne de dépendances, un seul `npm install`, un seul upgrade Expo SDK.

**Alternatives considered**:
- *3 projets Expo séparés + package partagé* : rejeté — triple `node_modules`, triple maintenance des deps natives, contrainte hors-workspace non résolue, migration lourde.
- *Garder 1 app avec ModeSwitch et ajouter le mode livreur* : rejeté — c'est précisément la complexité que la feature élimine.
- *Monorepo npm dédié mobile (workspaces npm + metro watchFolders)* : viable mais n'apporte que de l'isolation de deps dont on n'a pas besoin ; garde la porte ouverte pour plus tard.

**Implications**:
- Packages Android : `com.ebio.mobile` (client, inchangé — mise à jour de l'app publiée), `com.ebio.supplier`, `com.ebio.courier`.
- Firebase : ajouter 2 apps Android au projet Firebase existant → 3 fichiers `google-services.<variant>.json` référencés par `app.config.ts`.
- Google Sign-In : une empreinte SHA-1 (keystore EAS + Play App Signing) à déclarer **par app** dans la console Google (piège déjà connu du projet).
- `eas.json` : profils `production-client`, `production-supplier`, `production-courier` (+ équivalents preview/development) avec `APP_VARIANT` et `serviceAccountKeyPath` communs.
- Play Store : 2 nouvelles fiches créées à la main dans la Play Console (l'API ne crée pas d'apps) ; premier AAB uploadé manuellement, ensuite `eas submit` par profil.

## R2 — Rôle COURIER dans le RBAC existant

**Decision**: Ajouter `COURIER` à l'enum `UserRole` (`auth.entity.ts`), une ligne `COURIER` dans `RbacSeeder` avec ses permissions, les nouveaux subjects CASL `Delivery` et `CourierProfile`, et le fallback enum dans `CaslAbilityFactory`. Un utilisateur devient COURIER à l'approbation de sa candidature par l'admin (même mécanique que `SuppliersService.register` qui promeut en SUPPLIER).

**Rationale**: Le système a déjà le double mécanisme (enum `role` + entité `Role` DB) avec fallback enum comme chemin réellement actif. On suit le pattern existant à l'identique — pas de refonte RBAC.

**Alternatives considered**: rôle uniquement en DB (`Role` row) sans enum — rejeté car le fallback enum est le chemin vivant (rien n'assigne `userRole` à l'inscription) et tous les guards lisent `request.user.role`.

**Permissions COURIER (seed)**: `read:Order` (conditionné aux courses assignées), `read/update:Delivery`, `read/update:CourierProfile` (le sien), `read:Supplier`, `create/read:Conversation`, `create/read:Message`, `read:Notification`.

## R3 — Modèle du domaine livraison

**Decision**: Nouveau module `apps/api/src/modules/deliveries/` avec 3 entités :
- **`CourierProfile`** — candidature + profil livreur (user FK, identité, type de véhicule, zone, `validationStatus` réutilisant le pattern `PENDING/VALIDATED/REJECTED/SUSPENDED` des fournisseurs, `isAvailable`, `lastKnownLocation geography(Point,4326)` + index GiST).
- **`Delivery`** — la course : OneToOne vers `Order`, ManyToOne nullable vers `CourierProfile`, statut propre (`AWAITING_COURIER → ACCEPTED → PICKED_UP → IN_TRANSIT → DELIVERED | FAILED`), horodatages par étape, preuve (`proofType PHOTO|CODE`, `proofMediaId`, `confirmationCode`), `failReason`.
- **`DeliveryEvent`** — journal append-only des transitions (delivery FK, statut, horodatage, acteur) pour l'historique traçable exigé par la spec (SC-002).

Le statut de la **commande** reste la source de vérité côté client/fournisseur et est piloté par la livraison : création de `Delivery` quand le fournisseur passe la commande à `READY` (si `pickupMode = DELIVERY`) ; `PICKED_UP` → `Order.IN_DELIVERY` ; `DELIVERED` → `Order.DELIVERED` (via la mécanique `applyStatus` existante qui gère déjà notifications, commission cash et `deliveredAt`).

**Rationale**: Les statuts de commande existants (`READY`, `IN_DELIVERY`, `DELIVERED` + `VALID_TRANSITIONS`) couvrent déjà le cycle vu du client — l'app client actuelle les affiche déjà. On n'ajoute **aucun statut de commande**, zéro migration des apps publiées. La granularité livreur (offres, acceptation, échec) vit dans `Delivery`, invisible des anciens clients.

**Alternatives considered**: étendre l'enum `OrderStatus` avec les états livreur — rejeté (casse les apps publiées et mélange deux machines à états) ; entité `DeliveryOffer` persistée par livreur sollicité — rejeté en v1 (la diffusion est éphémère, Redis + push suffisent ; `DeliveryEvent` garde la trace de l'acceptation).

## R4 — Attribution des courses (diffusion + premier accepte)

**Decision**: À la création de la `Delivery` : requête PostGIS `ST_DWithin(courier.lastKnownLocation, supplier.location, rayon)` sur les `CourierProfile` validés et disponibles → notification push FCM (`NotificationType.DELIVERY_OFFER`) à chaque livreur proche + la course apparaît dans `GET /api/deliveries/offers` (liste des courses `AWAITING_COURIER` à proximité). L'acceptation est **first-write-wins** : `UPDATE deliveries SET courier_id = ?, status = 'ACCEPTED' WHERE id = ? AND courier_id IS NULL` dans une transaction — le second arrivé reçoit un 409. Rayon initial : 5 km, élargi par le cron de réattribution.

**Reassignment**: cron (pattern `@Cron` existant, cf. `autoCancelUnaccepted`) : une `Delivery` `ACCEPTED` non passée `PICKED_UP` sous 15 min retourne en `AWAITING_COURIER` (event journalisé, livreur notifié) ; une `AWAITING_COURIER` sans preneur après 10 min est rediffusée avec rayon élargi et le fournisseur voit « en attente de livreur ».

**Rationale**: Réutilise les patterns PostGIS raw-SQL du projet (`suppliers.service.ts:162`), le service FCM existant, et le pattern cron existant. Pas de WebSocket nécessaire en v1 pour les livreurs (push + pull) — le gateway socket.io actuel est chat-only et sans adapter Redis ; l'étendre est un risque hors périmètre.

**Alternatives considered**: WebSocket temps réel pour les offres — reporté (FCM high-priority + polling à l'ouverture suffit pour v1) ; file Redis avec verrou — inutile, la contrainte SQL atomique suffit.

## R5 — Position du livreur

**Decision**: Le livreur envoie sa position (`PATCH /api/deliveries/couriers/me/location`) quand il passe disponible puis à l'acceptation/récupération d'une course (foreground uniquement, `expo-location` déjà présent). Pas de tracking continu en arrière-plan en v1 (conforme à la spec : suivi par étapes, pas de GPS temps réel côté client).

**Rationale**: Le background location Android impose une déclaration Play Store lourde (formulaire « location in background ») et n'apporte rien tant que le client ne voit pas de carte temps réel.

## R6 — Preuve de livraison

**Decision**: Deux modes au choix du livreur à la clôture : (a) **code de confirmation** à 4 chiffres généré à `PICKED_UP`, affiché au client dans le suivi de commande, saisi par le livreur ; (b) **photo** uploadée via le module `media` existant. Le code est le chemin nominal (fonctionne sans réseau de qualité pour l'upload) ; la photo couvre les remises sans présence du client.

**Rationale**: Réutilise `media` (upload signé) et le canal de notification existant pour communiquer le code au client.

## R7 — Hors-ligne livreur

**Decision**: File d'actions locale en MMKV (`react-native-mmkv` déjà présent) : les transitions de statut faites hors réseau sont empilées avec horodatage local et rejouées séquentiellement au retour du réseau (`@react-native-community/netinfo` déjà présent). L'API accepte un champ `occurredAt` optionnel sur les transitions pour préserver les horodatages réels.

**Alternatives considered**: lib de sync dédiée (WatermelonDB…) — rejeté, disproportionné pour une file de 1-3 actions.

## R8 — Contrats API et client mobile

**Decision**: Contrats Zod (`contracts/delivery.contract.ts`) + `@TypedBody` selon le pattern nzoth du projet ; mapper statique `toResponse`. Côté mobile, on reste sur le wrapper `apiFetch` existant (`src/utils/api-client.ts`) — l'app mobile n'a jamais consommé le SDK généré (`@boilerstone/openapi-generator` n'est utilisé que par web-spa/ui), et l'y migrer est un chantier orthogonal.

**Note constitution**: la règle « frontend consomme le SDK généré » est déjà non appliquée sur mobile (état de fait antérieur à cette feature) — consigné dans Complexity Tracking du plan ; cette feature n'aggrave pas l'écart (mêmes patterns `apiFetch`) et la migration SDK mobile est proposée comme feature ultérieure.

## R9 — Transition des utilisateurs existants

**Decision**:
- La variante **client** (`com.ebio.mobile`) est publiée comme mise à jour de l'app actuelle : mode fournisseur retiré, remplacé par un écran/bannière « Votre boutique a déménagé → installez eBio Fournisseur » (lien Play Store) affiché aux comptes `SUPPLIER`.
- Les anciennes versions installées continuent de fonctionner : aucun endpoint fournisseur n'est supprimé ni modifié de façon incompatible.
- L'app **fournisseur** garde la racine de navigation directe sur le dashboard (plus de ModeSwitch) ; un compte non-fournisseur y voit le parcours `SupplierRegistration` existant.
- L'app **livreur** : onboarding candidature → écran d'attente → app complète après validation.

## R10 — Back-office admin (gestion livreurs)

**Decision**: Étendre le module `admin` existant + web-spa (`app/features/...` pattern) avec la liste des candidatures livreur, détail (pièces via `media`), actions approuver/refuser/suspendre/réactiver (notifications `COURIER_VALIDATED`/`COURIER_REJECTED`/`COURIER_SUSPENDED` ajoutées à `NotificationType`), et consultation de l'historique des livraisons d'un livreur. Même mécanique que la validation fournisseur existante.
