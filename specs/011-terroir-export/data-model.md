# Phase 1 — Modèle de données

Montants en FCFA `numeric(12,2)`, poids en grammes `integer`, dates `timestamptz`.

## 1. Catalogue

### `export_profiles` (1–1 avec `products`)
| Colonne | Type | Règle |
|---|---|---|
| `product_id` | uuid PK, FK → products | `ON DELETE CASCADE` |
| `status` | varchar(10) | `PENDING`, `APPROVED`, `REJECTED` |
| `packed_weight_g` | int | > 0 |
| `length_cm`, `width_cm`, `height_cm` | int null | > 0 |
| `shelf_life_days` | int | > 0 |
| `origin_producer`, `origin_place` | varchar(120) null | |
| `origin_year` | smallint null | |
| `origin_method` | varchar(300) null | |
| `origin_photos` | jsonb default `[]` | 0–3 URLs |
| `label_photo` | text null | URL ; obligatoire pour `APPROVED` |
| `checklist` | jsonb default `{}` | clé → booléen (§7) |
| `reviewed_by` | uuid FK → users null | |
| `reviewed_at` | timestamptz null | |
| `rejection_reason` | varchar(500) null | |
| `created_at`, `updated_at` | | |

Badge « Terroir validé eBio » = `APPROVED` et origine renseignée (producteur ou lieu).

### `export_packs`
| Colonne | Type | Règle |
|---|---|---|
| `id` | uuid PK | |
| `supplier_id` | uuid FK null | null = pack eBio |
| `name` | varchar(120) | |
| `description` | text null | |
| `photos` | jsonb default `[]` | |
| `price` | numeric(12,2) | > 0 |
| `status` | varchar(10) | `PENDING`, `APPROVED`, `REJECTED`, `RETIRED` |
| `rejection_reason`, `reviewed_by`, `reviewed_at` | | |

### `export_pack_items`
`pack_id`, `product_id`, `variant_id` null, `quantity` (> 0). Un pack boutique ne
contient que ses produits (contrôle en service). Un pack est commandable si
tous ses produits sont `APPROVED`, actifs, en stock.

## 2. Logistique

### `export_agencies`
`id`, `name`, `contact_name`, `contact_phone`, `contact_email`, `notes`, `active`.

### `export_pickup_points`
`id`, `agency_id`, `country` (`FR`/`BE`), `city`, `address`, `opening_hours`
(texte), `active`.

### `export_departures`
| Colonne | Type | Règle |
|---|---|---|
| `id` | uuid PK | |
| `agency_id` | uuid FK | |
| `departs_on` | date | |
| `deposit_deadline` | timestamptz | ≤ `departs_on` |
| `transit_min_days`, `transit_max_days` | smallint | min ≤ max |
| `capacity_kg` | numeric(8,2) null | null = sans limite |
| `status` | varchar(10) | `OPEN`, `FULL`, `CANCELLED`, `DEPARTED` |
| `fill_alerted_at` | timestamptz null | |

### `export_departure_rates`
`departure_id`, `country`, `price_per_kg` (> 0), `min_billed_kg` (≥ 0),
`max_weight_kg` null, `home_delivery_fee` null (null = pas de domicile). PK
(`departure_id`, `country`).

### `export_departure_alerts`
`id`, `user_id`, `country`, `created_at`, `sent_at` null. Unique partiel
(`user_id`, `country`) `WHERE sent_at IS NULL`.

### `export_checkout_drafts`
`user_id` PK, `departure_id`, `country`, `updated_at`, `reminded_at` null —
dernier aperçu de passage en caisse terroir non payé (rappel des 48 h).

## 3. Commande et colis

### `orders` / `checkouts`
- `PickupMode` += `EXPORT` (CHECK `orders.pickup_mode`, `checkouts.delivery_mode`).
- Commande `EXPORT` : `delivery_fee = 0`, pas d'adresse béninoise.
- `orders.export_pack_id` null : ligne issue d'un pack (pour l'affichage).

### `export_shipments`
| Colonne | Type | Règle |
|---|---|---|
| `id` | uuid PK | |
| `checkout_id` | uuid FK unique | |
| `buyer_id` | uuid FK | |
| `departure_id` | uuid FK | |
| `country` | varchar(2) | `FR`, `BE` |
| `reception` | varchar(8) | `PICKUP`, `HOME` |
| `pickup_point_id` | uuid FK null | si `PICKUP` |
| `home_address` | text null | si `HOME` |
| `estimated_weight_g`, `actual_weight_g` | int, int null | |
| `price_per_kg`, `min_billed_kg` | figés au paiement | |
| `shipping_price` | numeric(12,2) | figé |
| `home_delivery_fee` | numeric(12,2) default 0 | |
| `insured` | boolean | |
| `insurance_price` | numeric(12,2) default 0 | |
| `declared_value` | numeric(12,2) | valeur des produits |
| `gift_recipient_name`, `gift_recipient_email`, `gift_recipient_phone` | null | colis offert |
| `gift_message` | varchar(300) null | |
| `status` | varchar(20) | étape courante (research §4) |
| `supplement_status` | varchar(12) | `NONE`, `REQUESTED`, `PAID`, `WAIVED`, `ITEM_REMOVED` |
| `supplement_amount` | numeric(12,2) null | |
| `supplement_requested_at` | timestamptz null | |
| `tracking_token` | varchar(32) unique | suivi public du destinataire offert |
| `created_at`, `updated_at` | | |

CHECK : `reception = 'PICKUP'` ⇒ `pickup_point_id NOT NULL` ; `reception = 'HOME'` ⇒ `home_address NOT NULL`.

### `export_shipment_events`
`id`, `shipment_id`, `step` null (étape standard), `message` text null (≥ un
des deux), `pickup_point_snapshot` text null (adresse et horaires affichés),
`author_id`, `created_at`. Index (`shipment_id`, `created_at`).

## 4. Argent

- `wallets.platform_account` += `EXPORT` (CHECK) : transport, domicile,
  assurance, marge des packs eBio ; débité des pertes (colis perdu, écart de
  poids absorbé, surcoût de réaffectation, compensation de pack).
- `wallet_transactions` : types `EXPORT_SHIPPING_INCOME`, `EXPORT_INSURANCE_INCOME`,
  `EXPORT_LOSS`, `EXPORT_PACK_COMPENSATION` (CHECK).
- Assurance : prix = `max(valeur × taux, minimum)` — réglages
  `export_insurance_rate_bps` (300 = 3 %) et `export_insurance_min` (1 000 FCFA).

## 5. Réglages plateforme

| Clé | Défaut |
|---|---|
| `terroir_export_enabled` | `false` |
| `export_packaging_weight_g` | 300 |
| `export_collection_days` | 3 |
| `export_weight_tolerance_pct` | 10 |
| `export_insurance_rate_bps` | 300 |
| `export_insurance_min` | 1000 |
| `export_banned_category_ids` | `[]` |
| `export_pickup_reminder_days` | 14 |

## 6. Énumérations

| Enum | Ajout |
|---|---|
| `PickupMode` | `EXPORT` |
| `PlatformAccount` | `EXPORT` |
| `WalletTransactionType` | 4 valeurs (§4) |
| `NotificationType` | 6 valeurs (research §13) |

## 7. Liste de contrôle d'export

Clés : `label_french`, `allergens_declared`, `dates_present`,
`shelf_life_sufficient` (≥ délai max des départs + 30 jours), `ingredients_allowed`,
`label_photo`. `APPROVED` exige toutes les clés à `true`.

## 8. Calculs (fonctions pures, testées)

- `estimateWeight(lines, packagingG)`.
- `shippingPrice(weightG, rate)` = `ceil(max(weightKg, minBilledKg) × pricePerKg)`.
- `marginKg(weightG, rate)` = `max(0, minBilledKg − weightKg)` (optimisation, US8).
- `insurancePrice(value, rateBps, min)`.
- `availableDepartures(departures, country, weightG, now, collectionDays)` (exclut plein, échu, trop lourd).
- `fillRatio(reservedG, capacityKg)`.
- `supplementFor(estimatedG, actualG, rate, tolerancePct)` → `null` ou montant.
- `packSplit(pack, lines)` → lignes par boutique + compensation / marge.
