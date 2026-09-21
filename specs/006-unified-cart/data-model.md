# Phase 1 — Modèle de données

**Feature**: 006-unified-cart · **Date**: 2026-09-21

Deux tables nouvelles, deux colonnes de rattachement, trois colonnes de mesure.
**Aucune colonne supprimée, aucun lien existant modifié** — c'est la condition
pour que l'app fournisseur et l'escrow ne bougent pas.

---

## Entités nouvelles

### Checkout (`checkouts`)

Un passage en caisse : la transaction unique chez le prestataire, et les
paiements des commandes qu'elle couvre.

| Champ | Type | Règle |
|---|---|---|
| `id` | uuid | clé primaire |
| `buyer_id` | uuid → `user` | l'acheteur, obligatoire |
| `total_amount` | numeric(12,2) | montant réellement encaissé, frais compris |
| `items_total` | numeric(12,2) | total des articles, avant frais et réductions |
| `delivery_fee` | numeric(12,2) | frais uniques de la tournée (0 en retrait) |
| `discount` | numeric(12,2) | réduction du code promo, réparti au prorata |
| `payment_method` | text | même vocabulaire que `Payment.paymentMethod` |
| `provider_transaction_id` | text, nullable | identifiant chez le prestataire |
| `status` | enum | voir transitions ci-dessous |
| `delivery_mode` | enum `DELIVERY` \| `ON_SITE` | unique pour tout le panier |
| `delivery_address` | text, nullable | saisie une fois |
| `delivery_latitude` / `delivery_longitude` | double, nullable | le point choisi sur la carte |
| `createdAt` / `updatedAt` | timestamptz | |

**Relations** : `Checkout` 1 → N `Payment` · `Checkout` 1 → 0..1 `DeliveryRun`

**Transitions** :

```
PENDING ──paiement accepté──> PAID ──commandes créées──> DISPATCHED
   │                            │
   │                            └──toutes refusées──> REFUNDED
   └──paiement échoué──> FAILED
```

`PARTIALLY_REFUNDED` s'applique dès qu'au moins une commande a été dédommagée
sans que toutes le soient.

**Règles de validation** :

- `total_amount` = `items_total` − `discount` + `delivery_fee`.
- Un checkout `PAID` MUST avoir au moins un `Payment` rattaché.
- `delivery_address` et les coordonnées sont obligatoires quand
  `delivery_mode = DELIVERY`.
- En espèces, `total_amount` MUST respecter le plafond plateforme (FR-012a) —
  contrôle au niveau du checkout, plus au niveau de la commande.

---

### DeliveryRun (`delivery_runs`)

Une tournée : les livraisons confiées à un même livreur, leurs points de
collecte ordonnés, un point de remise.

| Champ | Type | Règle |
|---|---|---|
| `id` | uuid | clé primaire |
| `checkout_id` | uuid → `checkouts`, unique | la tournée naît d'un passage en caisse |
| `courier_id` | uuid → `courier_profiles`, nullable | assigné à l'acceptation |
| `status` | enum | voir transitions |
| `pickup_order` | jsonb | identifiants de livraison, dans l'ordre de passage |
| `total_distance_km` | double, nullable | distance de la tournée complète |
| `courier_earning` | numeric(12,2) | rémunération de la tournée (FR-019) |
| `dispatch_phase` | enum | repris de `Delivery` : `TARGETED`, `BROADCAST`, `SCHEDULED` |
| `offer_expires_at` | timestamptz, nullable | même mécanique d'offre que l'existant |
| `escalated_at` | timestamptz, nullable | alerte back-office à 15 min (FR-022) |
| `buyer_prompted_at` | timestamptz, nullable | main rendue à l'acheteur à 30 min (FR-022a) |
| `shop_count` | integer | mesure, voir FR-020a |
| `offers_sent` | integer | nombre de propositions avant acceptation |
| `outcome` | enum, nullable | `ACCEPTED`, `REFUSED_ALL`, `UNSERVED`, `CANCELLED` |
| `createdAt` / `updatedAt` | timestamptz | |

**Relations** : `DeliveryRun` 1 → N `Delivery` · `DeliveryRun` N → 0..1 `CourierProfile`

**Transitions** :

```
AWAITING_COURIER ──acceptée──> ACCEPTED ──1re collecte──> COLLECTING
        │                                                     │
        │                                              toutes collectées
        │                                                     ▼
        ├──15 min──> ESCALATED (alerte back-office)       DELIVERING
        │                                                     │
        └──30 min──> BUYER_DECISION ──annulée──> CANCELLED    ▼
                                                          DELIVERED
```

`ESCALATED` et `BUYER_DECISION` n'interrompent pas la diffusion : un livreur
peut encore accepter pendant ces deux états.

**Règles de validation** :

- `pickup_order` MUST contenir exactement les identifiants des `Delivery`
  rattachées, sans doublon.
- Une tournée `DELIVERED` MUST avoir toutes ses livraisons en `DELIVERED`.
- `shop_count` MUST respecter la limite de regroupement (deux par défaut,
  réglable), et l'écart entre points de collecte MUST rester sous le seuil de
  groupement (3 km par défaut, FR-020c). Les deux sont vérifiés à la
  constitution de la tournée, jamais après.
- `total_distance_km` reste une mesure, pas un contrôle : c'est le trajet
  complet, y compris le dernier tronçon vers l'acheteur, que le seuil ne borne
  pas.
- Une tournée dégroupée (FR-020b) libère ses livraisons, qui repartent en
  diffusion individuelle : la tournée passe en `CANCELLED` avec l'issue
  `UNSERVED`, elle n'est pas supprimée — son échec est une donnée.

---

## Entités modifiées

### Payment

| Champ ajouté | Type | Règle |
|---|---|---|
| `checkout_id` | uuid → `checkouts`, nullable | nul pour tout l'historique antérieur |

`Payment.order` **reste** un `@OneToOne` propriétaire. L'escrow, les reçus et la
commission sont inchangés.

### Delivery

| Champ ajouté | Type | Règle |
|---|---|---|
| `delivery_run_id` | uuid → `delivery_runs`, nullable | nul pour l'historique |

`Delivery.order` **reste** un `@OneToOne(unique)`. Le statut, les événements et
la preuve de remise sont inchangés.

### Order

**Aucun changement.** C'est l'exigence FR-023, et la raison d'être de toute
cette architecture.

---

## Migration

Additive, réversible, applicable sans interruption de service.

1. `CREATE TABLE checkouts` et `delivery_runs`.
2. `ALTER TABLE payments ADD COLUMN checkout_id uuid NULL` + index.
3. `ALTER TABLE deliveries ADD COLUMN delivery_run_id uuid NULL` + index.
4. Aucune reprise de données : les commandes existantes gardent
   `checkout_id` et `delivery_run_id` à `NULL`, ce que le code lit comme
   « commande d'avant le panier unifié ». Les écrans de suivi retombent alors
   sur le comportement par commande.

**Piège connu du projet** : le registre `mikro_orm_migrations` de production ne
contient que les migrations récentes ; `migration:up` sans `--only` échoue sur
les anciennes. Appliquer avec `migration:up --only <noms>`, et générer le SQL
en amont pour l'appliquer avant le basculement du conteneur.

---

## Côté mobile

`CartState` perd ses groupes :

```
Avant : { groups: [{ supplierId, supplierName, deliveryMode, items: [...] }] }
Après : { items: [{ ..., supplierId, supplierName }], deliveryMode }
```

`MAX_ITEM_QUANTITY` et le plafonnement par ligne (commit `bac3eeb`) restent
valables tels quels. L'hydratation depuis la clé `ebio_cart` détecte l'ancien
format, aplatit les groupes et retient `DELIVERY` si les modes divergent.
