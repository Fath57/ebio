# Phase 1 — Modèle de données

Une table créée (`saved_relatives`), des colonnes ajoutées sur `checkouts`,
`deliveries` et `users`, deux clés dans `platform_settings`. `orders` et
`payments` ne changent pas.

Montants en FCFA : `numeric(12,2)` comme le reste de `checkouts`. Taux : `numeric(14,6)`.

## 1. `saved_relatives` — carnet de proches (créée)

| Colonne | Type | Règle |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `owner_id` | uuid FK → `user.id` | `ON DELETE CASCADE` |
| `nickname` | varchar(40) | obligatoire (« Maman ») |
| `name` | varchar(120) | obligatoire |
| `phone` | varchar(16) | `^\+229\d{10}$` (FR-003) |
| `address` | text | min 10 caractères (même règle que `deliveryAddressSchema`) |
| `latitude` / `longitude` | double precision | obligatoires |
| `created_at` / `updated_at` | timestamptz | |

- Index `(owner_id)`. Unicité `(owner_id, phone)` : un même proche n'est
  enregistré qu'une fois.
- Au plus **20** lignes par `owner_id` (FR-028) — contrôle dans le service,
  pas en base.
- Supprimer ou modifier un proche ne touche aucun passage en caisse (FR-007,
  scénario US4-3) : `checkouts.saved_relative_id` est `ON DELETE SET NULL`.

## 2. `checkouts` — colonnes ajoutées

| Colonne | Type | Règle |
|---|---|---|
| `recipient_name` | varchar(120) null | renseignée ⇔ commande pour un proche |
| `recipient_phone` | varchar(16) null | `+229…` |
| `saved_relative_id` | uuid null FK → `saved_relatives` | `ON DELETE SET NULL` |
| `tracking_token` | varchar(32) null, **unique** | 24 caractères base64url, créé avec le passage en caisse |
| `recipient_sms_resend_count` | smallint not null default 0 | ≤ 3 (FR-010) |
| `payer_time_zone` | varchar(64) null | fuseau IANA de l'appareil du payeur, pour l'heure de remise (FR-016) |
| `display_currency` | varchar(3) not null default `'XOF'` | `XOF`, `EUR`, `USD`, `CAD` |
| `fx_rate` | numeric(14,6) null | FCFA pour 1 unité, **marge incluse** ; null si `XOF` |
| `fx_margin_bps` | smallint null | marge en vigueur au gel |
| `display_total` | numeric(12,2) null | `total_amount ÷ fx_rate`, arrondi au centime supérieur |

**Contraintes CHECK**
- `recipient_name IS NULL = recipient_phone IS NULL = tracking_token IS NULL`
  (les trois ensemble ou aucun).
- `display_currency = 'XOF'` ⇔ `fx_rate IS NULL AND display_total IS NULL`.
- `recipient_sms_resend_count BETWEEN 0 AND 3`.
- `recipient_phone IS NULL OR payment_method <> 'CASH_ON_DELIVERY'` (FR-006,
  doublé en service pour un message clair).

**Dérivé** : `isGift = recipient_phone IS NOT NULL`. Le compte du proche n'est
pas stocké : il se retrouve par `user.phone = recipient_phone AND
user.phone_verified_at IS NOT NULL` (voir research §9). Index sur
`recipient_phone` pour « Paniers reçus ».

Les colonnes d'adresse existantes (`delivery_address`, `delivery_latitude`,
`delivery_longitude`) portent le point du proche — aucune nouvelle colonne.

## 3. `deliveries` — preuve de remise

| Colonne | Type | Règle |
|---|---|---|
| `proof_type` | enum existant + `CODE_AND_PHOTO` | CHECK régénéré |
| `proof_latitude` / `proof_longitude` | double precision null | position du livreur à la prise de vue |
| `proof_taken_at` | timestamptz null | heure de la photo (= `occurredAt` rejoué hors ligne) |
| `proof_distance_m` | integer null | distance au point de livraison |
| `proof_far` | boolean not null default false | `proof_distance_m > 300` (FR-015) |

**Règles**
- `proof_type = 'CODE_AND_PHOTO'` ⇒ `proof_media_id`, `proof_latitude`,
  `proof_longitude`, `proof_taken_at` non nuls (CHECK).
- Une livraison dont la commande appartient à un passage en caisse avec proche
  n'accepte **que** `CODE_AND_PHOTO` ; une livraison ordinaire garde `CODE` ou
  `PHOTO`.
- Purge à 90 jours (FR-017) : le média est supprimé, `proof_media_id` passe à
  null ; les autres champs restent pour l'historique.

### Transitions concernées (`DeliveryStatus`, inchangé)

```
IN_TRANSIT ──complete(CODE_AND_PHOTO)──▶ DELIVERED ─▶ push + e-mail GIFT_DELIVERED au payeur
ACCEPTED|PICKED_UP|IN_TRANSIT ──fail(reason)──▶ FAILED
    └─ si pour un proche : commande annulée, portefeuille du payeur crédité
       (total − frais de livraison), livreur réglé, GIFT_DELIVERY_FAILED au payeur
```

## 4. `user` — colonnes ajoutées

| Colonne | Type | Règle |
|---|---|---|
| `phone_verified_at` | timestamptz null | posée par l'inscription par code SMS ; remise à null si le numéro change dans le profil |
| `display_currency` | varchar(3) not null default `'XOF'` | `XOF`, `EUR`, `USD`, `CAD` |

**Reprise** : `phone_verified_at = created_at` pour les comptes dont l'e-mail se
termine par `@phone.ebio.app` (créés par code SMS).

Le format de `phone` devient E.164 (`^\+[1-9]\d{6,14}$`) à l'écriture ; les
valeurs existantes ne sont pas réécrites.

## 5. `platform_settings` — deux clés

**`EXCHANGE_RATES`** (JSON, validé Zod)

```jsonc
{
  "EUR": { "xofPerUnit": 655.957, "source": "MANUAL", "updatedAt": "2026-11-13T06:00:00Z" },
  "USD": { "xofPerUnit": 600.123456, "source": "AUTO", "updatedAt": "2026-11-13T06:00:00Z" },
  "CAD": { "xofPerUnit": 430.987654, "source": "MANUAL", "updatedAt": "2026-11-12T09:12:00Z" }
}
```

EUR est toujours `MANUAL` : valeur par défaut `655.957` si la clé est absente,
jamais écrasé par le cron. USD et CAD : `AUTO` après le cron, `MANUAL` après une
saisie, jusqu'au cron suivant. Taux = taux **de référence**, sans marge.

**`FX_MARGIN_BPS`** (entier) — défaut `200` (2 %), borne `0..1000`.

Taux effectif = `xofPerUnit × (1 − FX_MARGIN_BPS / 10 000)`.

## 6. Énumérations étendues

| Enum | Ajout | Migration |
|---|---|---|
| `DeliveryProofType` | `CODE_AND_PHOTO` | CHECK `deliveries.proof_type` |
| `NotificationType` | `GIFT_DELIVERED`, `GIFT_DELIVERY_FAILED` | CHECK `notifications.type` |
| `DeliveryEventType` | — | (le payload `DELIVERED` porte déjà `proofType`) |

## 7. Validation (rappel des exigences)

| Règle | Exigence | Où |
|---|---|---|
| Numéro du proche béninois | FR-003 | Zod + CHECK carnet |
| Espèces interdites | FR-006 | service + CHECK |
| Proche figé | FR-007 | colonnes `checkouts` |
| ≤ 3 renvois de SMS | FR-010 | CHECK + service |
| Code + photo + position | FR-013, FR-014 | Zod + CHECK |
| > 300 m signalé | FR-015 | service |
| Taux figé | FR-022 | colonnes `checkouts` |
| ≤ 20 proches | FR-028 | service |
| Rattachement par numéro vérifié | FR-029 | `phone_verified_at` |
| E-mail ou téléphone vérifié avant commande | FR-034c | service |
