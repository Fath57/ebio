# Contrats API — module `deliveries`

**Feature**: `005-split-three-apps` | Pattern : contrats Zod (`contracts/delivery.contract.ts`) + `@TypedBody` (nzoth), mapper statique `toResponse`, préfixe global `/api`. Auth : `AuthGuard` (Bearer mobile) + `CaslGuard`.

## Candidature & profil livreur (app Livreur)

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| POST | `/api/couriers/register` | tout utilisateur authentifié | Soumet la candidature (`fullName`, `phone`, `vehicleType`, `zone`, `identityDocument?`). 409 si profil existant. Statut initial `PENDING`. |
| GET | `/api/couriers/me` | authentifié | Profil + `validationStatus` (+ `rejectionReason` si refusé). 404 si pas de candidature — l'app affiche l'onboarding. |
| PATCH | `/api/couriers/me` | COURIER | Met à jour les infos du profil (hors statut). |
| PATCH | `/api/couriers/me/availability` | COURIER validé | `{ isAvailable: boolean }`. 403 si `SUSPENDED` ou non validé. |
| PATCH | `/api/couriers/me/location` | COURIER validé | `{ latitude, longitude }` → `lastKnownLocation` (SQL brut `ST_MakePoint`). Appelé au passage en ligne et aux étapes de course. |

## Courses (app Livreur)

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| GET | `/api/deliveries/offers` | COURIER validé + disponible | Courses `AWAITING_COURIER` dans `broadcastRadiusKm` de la position du livreur (`ST_DWithin`), triées par distance. Résumé : retrait, dépôt, distance, montant commande, nb articles. |
| POST | `/api/deliveries/:id/accept` | COURIER validé + disponible | Claim atomique (`UPDATE … WHERE courier_id IS NULL`). 200 avec la course complète ; **409** si déjà prise ; 410 si commande annulée entre-temps. |
| GET | `/api/deliveries/mine` | COURIER | Courses du livreur ; filtre `?status=active\|done` (active = ACCEPTED/PICKED_UP/IN_TRANSIT ; done = DELIVERED/FAILED). Historique FR-019. |
| GET | `/api/deliveries/:id` | COURIER assigné, fournisseur de la commande, acheteur, ADMIN | Détail complet : adresses, contacts utiles (téléphone acheteur pour le livreur assigné uniquement), résumé commande, timeline `DeliveryEvent`. |
| POST | `/api/deliveries/:id/pickup` | COURIER assigné | `ACCEPTED → PICKED_UP`. Génère `confirmationCode`, notifie le client (code inclus dans le suivi), Order → `IN_DELIVERY`. Body optionnel `{ occurredAt? }` (sync hors-ligne, borné serveur). |
| POST | `/api/deliveries/:id/start` | COURIER assigné | `PICKED_UP → IN_TRANSIT`. Body `{ occurredAt? }`. |
| POST | `/api/deliveries/:id/complete` | COURIER assigné | `IN_TRANSIT → DELIVERED`. Body : `{ proofType: 'CODE', code }` (vérifié contre `confirmationCode`, 422 si faux) **ou** `{ proofType: 'PHOTO', mediaId }`. Order → `DELIVERED` via `applyStatus`. |
| POST | `/api/deliveries/:id/fail` | COURIER assigné | `{ reason: DeliveryFailReason, comment?, occurredAt? }` → `FAILED`, fournisseur notifié `DELIVERY_FAILED`. |

## Côté fournisseur (app Fournisseur)

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| — | (existant) `PATCH /api/orders/:id/status` → `READY` | SUPPLIER | **Hook modifié** : si `pickupMode = DELIVERY`, crée la `Delivery` (`AWAITING_COURIER`), snapshot adresses, diffusion initiale (push `DELIVERY_OFFER` aux livreurs proches). |
| GET | `/api/deliveries/by-order/:orderId` | fournisseur de la commande, acheteur, ADMIN | État de la course pour affichage (statut, livreur assigné — nom + téléphone, timeline). « En attente de livreur » si `AWAITING_COURIER`. |
| POST | `/api/deliveries/:id/rebroadcast` | fournisseur de la commande | Relance manuelle de la diffusion (rayon élargi). 409 si déjà assignée. |

## Côté client (app Client)

Le suivi client reste porté par `Order.status` (aucun changement de contrat commandes). Complément :

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| GET | `/api/deliveries/by-order/:orderId` | acheteur de la commande | Timeline de livraison + `confirmationCode` (visible de l'acheteur uniquement) + nom/téléphone du livreur. |

## Admin (web-spa)

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| GET | `/api/admin/couriers` | ADMIN | Liste paginée, filtre `?status=PENDING\|VALIDATED\|REJECTED\|SUSPENDED`. |
| GET | `/api/admin/couriers/:id` | ADMIN | Détail candidature (pièces via media) + stats livraisons. |
| POST | `/api/admin/couriers/:id/approve` | ADMIN | `PENDING\|REJECTED → VALIDATED` ; promeut `user.role = COURIER` ; notification `COURIER_VALIDATED`. |
| POST | `/api/admin/couriers/:id/reject` | ADMIN | `{ reason }` → `REJECTED` ; notification `COURIER_REJECTED`. |
| POST | `/api/admin/couriers/:id/suspend` | ADMIN | → `SUSPENDED`, `isAvailable = false` ; courses actives réattribuées ; notification `COURIER_SUSPENDED`. |
| POST | `/api/admin/couriers/:id/reactivate` | ADMIN | `SUSPENDED → VALIDATED`. |
| GET | `/api/admin/deliveries` | ADMIN | Supervision : liste paginée, filtres statut/livreur/période. |

## Tâches planifiées (internes)

| Cron | Comportement |
|---|---|
| toutes les 2 min | `AWAITING_COURIER` avec `offeredAt` > 10 min : rayon += 5 km (plafond 25 km), rediffusion push, `reassignmentCount`++ ; event `BROADCAST`. |
| toutes les 2 min | `ACCEPTED` avec `acceptedAt` > 15 min sans `PICKED_UP` : retour `AWAITING_COURIER`, `courier_id = NULL`, event `REASSIGNED`, livreur notifié `DELIVERY_REASSIGNED`, rediffusion. |

## Notifications (types ajoutés)

`DELIVERY_OFFER` (livreurs proches), `DELIVERY_ASSIGNED` (fournisseur + acheteur), `DELIVERY_PICKED_UP` (acheteur — réutilise data.type routing mobile), `DELIVERY_FAILED` (fournisseur), `DELIVERY_REASSIGNED` (livreur), `COURIER_VALIDATED` / `COURIER_REJECTED` / `COURIER_SUSPENDED` (livreur). Les notifications client `ORDER_READY` / `ORDER_DELIVERED` existantes sont inchangées.
