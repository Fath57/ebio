# Phase 1 — Modèle de données

Deux tables créées (`family_wallets`, `family_wallet_members`), des colonnes
sur `wallets`, `wallet_transactions` et `checkouts`, des valeurs d'enum
ajoutées. Montants en FCFA, `numeric(12,2)`.

## 1. `family_wallets` (créée)

| Colonne | Type | Règle |
|---|---|---|
| `id` | uuid PK | |
| `payer_id` | uuid FK → `users` | **unique** : un portefeuille par payeur (FR-001) |
| `status` | varchar(10) | `ACTIVE`, `SUSPENDED`, `CLOSED` |
| `suspended_by_admin` | boolean default false | une suspension du back-office ne se lève que par le back-office |
| `low_balance_threshold` | numeric(12,2) default 5000 | ≥ 0 (FR-026) |
| `low_balance_alerted` | boolean default false | remis à false quand le solde repasse au-dessus |
| `default_monthly_cap` | numeric(12,2) null | > 0 |
| `default_order_max` | numeric(12,2) null | > 0 |
| `default_category_ids` | uuid[] null | null = toutes catégories |
| `created_at` / `updated_at` / `closed_at` | timestamptz | |

Le solde vit dans `wallets` (ligne dont `family_wallet_id` = cet id).

## 2. `family_wallet_members` (créée)

| Colonne | Type | Règle |
|---|---|---|
| `id` | uuid PK | |
| `family_wallet_id` | uuid FK → `family_wallets` | `ON DELETE CASCADE` |
| `saved_relative_id` | uuid FK → `saved_relatives` null | `ON DELETE SET NULL` |
| `nickname` | varchar(40) | copie au moment de l'ajout |
| `phone` | varchar(16) | `^\+229\d{10}$`, copie |
| `user_id` | uuid FK → `users` null | rattaché au compte vérifié ; null = en attente |
| `status` | varchar(10) | `PENDING`, `ACTIVE`, `SUSPENDED`, `REMOVED` |
| `monthly_cap` | numeric(12,2) null | null = limite par défaut |
| `order_max` | numeric(12,2) null | null = limite par défaut |
| `category_ids` | uuid[] null | null = catégories par défaut |
| `invited_at` | timestamptz null | dernier SMS d'invitation |
| `pending_reminded_at` | timestamptz null | rappel des 30 jours envoyé |
| `created_at` / `updated_at` | timestamptz | |

**Contraintes**
- Index unique partiel `(family_wallet_id, phone) WHERE status <> 'REMOVED'` (FR-003).
- CHECK `status = 'PENDING'` ⇔ `user_id IS NULL`… sauf `REMOVED` (un retiré garde son `user_id` s'il en avait un) :
  `(status = 'PENDING' AND user_id IS NULL) OR (status IN ('ACTIVE','SUSPENDED') AND user_id IS NOT NULL) OR status = 'REMOVED'`.
- Le payeur ne peut pas être membre : contrôle en service (`user_id <> payer_id`, et numéro du payeur refusé).

**Transitions**

```
PENDING ──numéro vérifié──▶ ACTIVE ◀──réactiver── SUSPENDED
   │                          │  └──suspendre──▶ ┘
   └──retirer──▶ REMOVED ◀────┴──retirer
```

## 3. `wallets`

| Colonne | Type | Règle |
|---|---|---|
| `family_wallet_id` | uuid FK → `family_wallets` null, **unique** | nouveau propriétaire |

`wallet_single_owner` devient
`num_nonnulls(user_id, supplier_id, courier_profile_id, platform_account, family_wallet_id) = 1`.

## 4. `wallet_transactions`

| Colonne | Type | Règle |
|---|---|---|
| `family_member_id` | uuid FK → `family_wallet_members` null | posé sur les achats et remboursements d'un membre |

Index `(family_member_id, "createdAt")` pour la dépense du mois.

Types ajoutés (enum + zod + CHECK) : `FAMILY_TRANSFER_OUT`, `FAMILY_TRANSFER_IN`,
`FAMILY_CLOSURE_OUT`, `FAMILY_CLOSURE_IN`. Les achats réutilisent
`ORDER_PAYMENT`, les remboursements `REFUND`, les recharges `TOPUP`.

## 5. `checkouts`

| Colonne | Type | Règle |
|---|---|---|
| `family_member_id` | uuid FK → `family_wallet_members` null | posé quand `payment_method = 'FAMILY_WALLET'` |

CHECK : `(payment_method = 'FAMILY_WALLET') = (family_member_id IS NOT NULL)`.

## 5 bis. `saved_relatives` (module 009)

`address`, `latitude`, `longitude` deviennent nullables : un proche ajouté au
portefeuille famille n'a pas forcément d'adresse connue. La contrainte
`saved_relatives_address_check` ne s'applique qu'à une adresse renseignée. Le
passage en caisse « Livrer à un proche » continue d'exiger adresse et point,
complétés au moment de la commande s'ils manquent.

## 6. Enums

| Enum | Ajout | Où |
|---|---|---|
| `PaymentMethod` (commandes, checkouts) | `FAMILY_WALLET` | entité, zod, CHECK `orders.payment_method` et `checkouts.payment_method` s'ils existent |
| `WalletTransactionType` | 4 valeurs ci-dessus | entité, zod, CHECK |
| `NotificationType` | 6 valeurs (research §9) | entité, audience, CHECK |
| `WalletOwnerType` (admin) | `FAMILY` | `admin-wallets.service.ts` |

## 7. Calculs (fonctions pures)

- **Limites effectives** d'un membre : pour chaque limite, `member.x ?? wallet.default_x`.
- **Dépense du mois** : `−SUM(amount)` des `ORDER_PAYMENT` et `REFUND` du membre
  depuis le 1er du mois civil, heure du Bénin.
- **Montant dépensable** : `min(solde, monthly_cap − dépense)` (sans plafond : solde).
- **Refus** (dans cet ordre) : portefeuille ou membre non actif → `INACTIVE` ;
  catégorie hors liste → `CATEGORY` ; total > `order_max` → `ORDER_MAX` ;
  total > plafond restant → `MONTHLY_CAP` ; total > solde → `INSUFFICIENT`.

## 8. Invariants (tests)

- Solde ≥ 0 toujours (verrou existant).
- Solde = Σ lignes du portefeuille (déjà vrai pour tout `wallets`).
- Dépense du mois d'un membre ≤ son plafond effectif au moment de chaque paiement.
- Un checkout payé par portefeuille famille a un `family_member_id` ; son
  remboursement va sur le portefeuille famille non fermé, sinon sur le
  portefeuille personnel du payeur.
