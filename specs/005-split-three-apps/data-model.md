# Data Model: Séparation en 3 applications mobiles + livraison

**Feature**: `005-split-three-apps` | **Date**: 2026-08-24

Aucune entité existante n'est supprimée. Modifications : 1 enum étendu, 3 nouvelles entités, 1 relation ajoutée sur `Order`, nouvelles valeurs de `NotificationType`, seed RBAC.

## Modifications d'entités existantes

### `User` (`apps/api/src/modules/auth/auth.entity.ts`)

- `UserRole` : ajout de `COURIER` → `'BUYER' | 'SUPPLIER' | 'COURIER' | 'ADMIN'` (+ `MODERATOR` côté Role DB inchangé).
- Un utilisateur passe `COURIER` à l'approbation de sa candidature (même pattern que la promotion SUPPLIER dans `SuppliersService.register`).

### `Order` (`apps/api/src/modules/orders/entities/order.entity.ts`)

- Ajout : `delivery?: Rel<Delivery>` (OneToOne inverse, nullable — seules les commandes `pickupMode = DELIVERY` en ont une).
- **Aucun nouveau statut** : `OrderStatus` et `VALID_TRANSITIONS` inchangés. Les transitions `READY → IN_DELIVERY → DELIVERED` sont désormais déclenchées par le module deliveries (au lieu du fournisseur seul) via la mécanique `applyStatus` existante.

### `Notification` (`apps/api/src/modules/notifications/notification.entity.ts`)

- `NotificationType` : ajout de `DELIVERY_OFFER`, `DELIVERY_ASSIGNED`, `DELIVERY_PICKED_UP`, `DELIVERY_FAILED`, `DELIVERY_REASSIGNED`, `COURIER_VALIDATED`, `COURIER_REJECTED`, `COURIER_SUSPENDED`.
- (`ORDER_READY`, `ORDER_DELIVERED` existants réutilisés pour le client.)

### RBAC (seed `apps/api/src/seeders/rbac.seeder.ts` + `casl-ability.factory.ts`)

- Nouveaux subjects CASL : `Delivery`, `CourierProfile`.
- Nouveau rôle seedé `COURIER` : `read:Order` (courses assignées, condition sur courier), `read:Delivery` / `update:Delivery` (les siennes), `read:CourierProfile` / `update:CourierProfile` (le sien), `read:Supplier`, `create/read:Conversation`, `create/read:Message`, `read:Notification`.
- `ADMIN` : `manage:all` couvre déjà les nouveaux subjects.
- Fallback enum dans `CaslAbilityFactory.createForUser` : nouveau case `COURIER`.

## Nouvelles entités (module `apps/api/src/modules/deliveries/`)

### `CourierProfile` — table `courier_profiles`

Profil et candidature livreur (flotte mutualisée eBio). Pattern calqué sur `Supplier`.

| Champ | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `user` | ManyToOne → User, `user_id`, unique | 1 profil livreur max par compte |
| `fullName` | string | identité déclarée |
| `phone` | string | contact livraison |
| `vehicleType` | enum `VehicleType` | `MOTO \| BICYCLE \| CAR \| ON_FOOT` |
| `zone` | string | zone d'activité déclarée (texte libre v1) |
| `identityDocument` | string nullable | media id (pièce d'identité), pattern `Supplier.identityDocument` |
| `validationStatus` | enum `ValidationStatus` | `PENDING \| VALIDATED \| REJECTED \| SUSPENDED` (réutilise l'enum suppliers) |
| `rejectionReason` | string nullable | motif visible du candidat |
| `isAvailable` | boolean, default false | disponibilité déclarée (en ligne / hors ligne) |
| `lastKnownLocation` | `geography(Point,4326)` nullable, index GiST | mise à jour foreground uniquement ; lecture/écriture en SQL brut (pattern `Supplier.location`) |
| `lastLocationAt` | Date nullable | fraîcheur de la position — le dispatch ignore les positions de plus de 12 h (livreur traité comme sans position) |
| `validatedAt` / `validatedBy` | Date / uuid nullable | audit validation (pattern Supplier) |
| `createdAt` / `updatedAt` | Date | |

**Règles** : seuls `validationStatus = VALIDATED` et `isAvailable = true` reçoivent des offres ; `SUSPENDED` force `isAvailable = false`.

### `Delivery` — table `deliveries`

La course, unité de travail du livreur.

| Champ | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `order` | OneToOne → Order, `order_id`, unique | une course par commande |
| `courier` | ManyToOne → CourierProfile, `courier_id`, **nullable** | null tant que personne n'a accepté ; claim atomique `WHERE courier_id IS NULL` |
| `status` | enum `DeliveryStatus` | `AWAITING_COURIER \| ACCEPTED \| PICKED_UP \| IN_TRANSIT \| DELIVERED \| FAILED \| CANCELLED` (terminal : annulation commande ou auto-livraison fournisseur) |
| `pickupAddress` | string | copie de l'adresse fournisseur au moment de la création |
| `pickupLocation` | `geography(Point,4326)` nullable | position du point de retrait (diffusion par proximité). **Fallback** : si le fournisseur n'a pas de position, la diffusion cible tous les livreurs disponibles (sans filtre distance) et le fournisseur est invité à renseigner sa position |
| `dropoffAddress` | string | copie de `Order.deliveryAddress` |
| `confirmationCode` | string(4) nullable | généré à `PICKED_UP`, montré au client |
| `proofType` | enum nullable | `CODE \| PHOTO` |
| `proofMediaId` | string nullable | media id si preuve photo |
| `failReason` | enum `DeliveryFailReason` nullable | `CUSTOMER_ABSENT \| ADDRESS_NOT_FOUND \| CUSTOMER_REFUSED \| OTHER` |
| `failComment` | string nullable | détail libre |
| `offeredAt` | Date | création / dernière rediffusion |
| `acceptedAt` / `pickedUpAt` / `inTransitAt` / `deliveredAt` / `failedAt` | Date nullable | horodatages par étape (SC-002) |
| `reassignmentCount` | int, default 0 | nb de réattributions |
| `broadcastRadiusKm` | float, default 5 | rayon courant de diffusion (élargi par le cron) |
| `createdAt` / `updatedAt` | Date | |

**Machine à états `Delivery` et couplage `Order`** :

```
AWAITING_COURIER ──accept (claim atomique)──▶ ACCEPTED ──pickup──▶ PICKED_UP ──▶ IN_TRANSIT ──▶ DELIVERED
      ▲                                          │                                    │
      └───── timeout 15 min (cron) ──────────────┘                                    └──▶ FAILED
      └───── rediffusion rayon élargi (cron, si AWAITING_COURIER > 10 min)
```

| Événement Delivery | Effet sur Order |
|---|---|
| création (fournisseur passe la commande `READY`, `pickupMode = DELIVERY`) | Order déjà `READY` |
| `PICKED_UP` | Order → `IN_DELIVERY` (via `applyStatus`) |
| `DELIVERED` | Order → `DELIVERED` (via `applyStatus` : notifications, `deliveredAt`, commission cash) |
| `FAILED` | Order reste `IN_DELIVERY` ; fournisseur notifié (`DELIVERY_FAILED`), résolution manuelle (relivraison = nouvelle diffusion, ou annulation via flux existants) |
| annulation de la commande | Delivery → `CANCELLED`, event `ORDER_CANCELLED`, offre retirée, livreur assigné notifié |
| **auto-livraison** : le fournisseur avance manuellement `READY → IN_DELIVERY` alors que la Delivery est `AWAITING_COURIER` | Delivery → `CANCELLED`, event `SELF_DELIVERED`, diffusion stoppée, offre retirée des listes livreurs (la commande suit alors le flux manuel existant) |

### `DeliveryEvent` — table `delivery_events`

Journal append-only des transitions (traçabilité SC-002, historique livreur FR-019, audit réattributions).

| Champ | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `delivery` | ManyToOne → Delivery, `delivery_id`, index | |
| `type` | enum `DeliveryEventType` | `CREATED \| BROADCAST \| ACCEPTED \| PICKED_UP \| IN_TRANSIT \| DELIVERED \| FAILED \| REASSIGNED \| ORDER_CANCELLED \| SELF_DELIVERED` |
| `actorUserId` | uuid nullable | livreur/fournisseur/admin/système (null = cron) |
| `payload` | jsonb nullable | rayon de diffusion, motif d'échec, etc. |
| `occurredAt` | Date | horodatage réel (peut venir du client hors-ligne, borné : ≤ now, ≥ event précédent) |
| `createdAt` | Date | horodatage serveur |

## Migration

Une migration MikroORM (`src/modules/db/migrations/`) : enum `UserRole` + tables `courier_profiles`, `deliveries`, `delivery_events` (colonnes geography en SQL brut comme `Migration20260323200000`), nouvelles valeurs `NotificationType`, + upsert RBAC (rôle `COURIER`, permissions `Delivery`/`CourierProfile`) dans `RbacSeeder`.
