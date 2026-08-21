# 003 — Portefeuille (wallet)

## Objectif

Un solde interne en FCFA tenu par eBio pour chaque acteur. L'argent réel reste sur le
compte FedaPay de la plateforme ; les portefeuilles sont la comptabilité interne qui dit
à qui appartient quoi. Remplace le transfert automatique fantôme (`transferToSupplier`,
jamais implémenté) par un modèle **pull** : le fournisseur est crédité à la libération du
séquestre et demande son reversement quand il veut.

## Décisions tranchées

| # | Question | Décision | Pourquoi |
|---|----------|----------|----------|
| 1 | Traitement des reversements | **API FedaPay Payout intégrée directement** : l'admin approuve la demande dans le BO → le système crée le payout FedaPay et le déclenche. Suivi asynchrone par webhook + polling de secours. Référence : implémentation éprouvée dans `pos-proxy-backend` (ntech). | Décision utilisateur. L'implémentation de référence donne le payload exact, le cycle de vie et les pièges. |
| 2 | Wallet acheteur | **Optionnel.** FedaPay direct et cash à la livraison restent. Le wallet est un moyen de paiement de plus au checkout. | Ne force personne, adoption progressive. |
| 3 | Seuil / frais de reversement | **Minimum 1 000 FCFA, frais 0** au lancement. **Une seule demande en attente à la fois** par fournisseur. Les deux valeurs seront configurables plus tard (onglet réglages). | Simple, honnête ; le frein anti-micro-demandes est le seuil, pas les frais. |
| 4 | Validation du numéro | Le fournisseur enregistre numéro + opérateur + nom du titulaire. **Toute addition passe par une validation admin** dans le BO (aucune auto-validation, même si le numéro égale le `mobileMoneyNumber` d'inscription). Plusieurs numéros possibles ; seul un numéro `VALIDATED` est utilisable dans une demande. | Point de contrôle anti-fraude unique et lisible. |
| 5 | Commission sur le cash | **Débitée du wallet fournisseur à la livraison** d'une commande cash. Le solde **peut devenir négatif** (dette), absorbée par les crédits suivants. Pas de blocage automatique en v1 : les soldes négatifs sont visibles dans le BO, décision humaine. Une demande de reversement exige un solde positif ≥ seuil. | Résout enfin la collecte de commission sur le cash, sans mécanisme punitif prématuré. |
| 6 | Un utilisateur-fournisseur | **Deux portefeuilles distincts** : le portefeuille perso (acheteur) et le portefeuille boutique. Comptablement clair, pas de mélange. | Le CA de la boutique n'est pas l'argent de poche du compte. |
| 7 | Création des wallets | **Lazy** : créé au premier accès/mouvement. Pas de backfill. | Zéro migration de données, zéro wallet mort. |
| 8 | Remboursement acheteur | Si la commande a été payée au wallet → **re-crédit wallet**. Si payée FedaPay → remboursement FedaPay comme aujourd'hui. | Le remboursement suit le chemin de l'argent. |

## Modèle de données (SQL, `numeric(12,2)`, jamais de float)

```
wallets
  id uuid PK
  user_id uuid NULL UNIQUE      -- portefeuille perso
  supplier_id uuid NULL UNIQUE  -- portefeuille boutique
  balance numeric(12,2) NOT NULL DEFAULT 0
  createdAt / updatedAt
  CHECK (num_nonnulls(user_id, supplier_id) = 1)

wallet_transactions            -- grand livre, append-only
  id uuid PK
  wallet_id uuid FK
  type text                    -- TOPUP | ORDER_PAYMENT | SALE_CREDIT |
                               -- COMMISSION_DEBIT | WITHDRAWAL | WITHDRAWAL_REFUND |
                               -- REFUND | ADJUSTMENT
  amount numeric(12,2)         -- signé : crédit > 0, débit < 0
  balance_after numeric(12,2)  -- audit : solde reconstructible et vérifiable
  order_id uuid NULL
  payment_id uuid NULL
  withdrawal_id uuid NULL
  description varchar
  createdAt

payout_numbers
  id uuid PK
  supplier_id uuid FK
  phone_number varchar(20)
  operator varchar(20)         -- MTN | MOOV | CELTIIS
  holder_name varchar(100)
  status text                  -- PENDING | VALIDATED | REJECTED
  rejection_reason varchar NULL
  validated_by uuid NULL / validated_at NULL
  createdAt

withdrawal_requests
  id uuid PK
  supplier_id / wallet_id / payout_number_id FK
  amount numeric(12,2)
  status text                  -- PENDING | PROCESSING | PAID | FAILED | REJECTED | CANCELLED
  fedapay_payout_id varchar NULL
  provider_reference varchar NULL   -- référence FedaPay du transfert
  rejection_reason varchar NULL
  processed_by uuid NULL / processed_at NULL
  createdAt
```

**Intégrité** : tout mouvement de solde s'exécute dans une transaction SQL avec
`SELECT … FOR UPDATE` sur le wallet (pas de double dépense), écrit la ligne de ledger
avec `balance_after`, puis met à jour `balance`. Un seul service (`WalletService`) a le
droit d'écrire — aucun autre module ne touche `balance` directement.

**Réservation des fonds** : la demande de reversement débite le wallet immédiatement
(ledger `WITHDRAWAL`). Rejet ou annulation → re-crédit (`WITHDRAWAL_REFUND`).

## Flux

1. **Recharge (acheteur)** — `POST /wallet/topup { amount }` → Payment FedaPay via le
   gateway existant → le webhook confirme → crédit wallet (`TOPUP`). Idempotent sur le
   statut du Payment.
2. **Achat au wallet** — nouveau `paymentMethod: 'WALLET'` au checkout. À la création de
   la commande : solde ≥ total sinon 400, débit (`ORDER_PAYMENT`), Payment interne créé
   directement en `ESCROW` (l'argent est déjà chez eBio). Le circuit séquestre existant
   (48 h double confirmation / 7 j auto) reste inchangé.
3. **Libération du séquestre (refonte `releaseEscrow`)** — remplace le stub
   `transferToSupplier` : crédit du wallet boutique de `montant − commission`
   (`SALE_CREDIT`). Notification honnête : « X FCFA crédités sur votre portefeuille ».
4. **Commande cash livrée** — au passage à `DELIVERED` d'une commande
   `CASH_ON_DELIVERY` : débit `COMMISSION_DEBIT` du wallet boutique (solde négatif
   autorisé).
5. **Reversement** — le fournisseur choisit un numéro `VALIDATED` + un montant
   (≥ 1 000, ≤ solde, une seule demande active à la fois) → débit + demande `PENDING`.
   BO : l'admin **approuve** → le système appelle FedaPay Payout (voir ci-dessous) →
   `PROCESSING` → webhook/polling → `PAID` ou `FAILED` (re-crédit automatique).
   `REJECTED` par l'admin (motif obligatoire) → re-crédit. Le fournisseur peut annuler
   tant que `PENDING`. Notifications aux deux bouts à chaque transition.

## Intégration FedaPay Payout (d'après `pos-proxy-backend`)

**Appel** (API REST, dans `fedapay.gateway.ts` existant) — deux étapes :
1. `POST /v1/payouts` :
   ```json
   {
     "amount": 5000,
     "currency": { "iso": "XOF" },
     "mode": "<code gsm>",
     "customer": {
       "firstname": "...", "lastname": "...",
       "email": "<email ou fallback {phone}@email.com>",
       "phone_number": { "number": "229<numéro>", "country": "bj" }
     },
     "custom_metadata": { "withdrawal_id": "<uuid>" }
   }
   ```
2. `PUT /v1/payouts/start` avec l'id → déclenche l'envoi (équivalent `sendNow()`).

**`mode` = code opérateur**, détecté par préfixe du numéro (plan béninois à 10 chiffres) :
- `mtn_open` : 0142, 0146, 0150–0154, 0156, 0157, 0159, 0161, 0162, 0166, 0167, 0169, 0190–0193, 0196, 0197
- `moov` : 0145, 0155, 0158, 0160, 0163–0165, 0168, 0194, 0195, 0198, 0199
- `sbin` (Celtiis) : 0140, 0141, 0143, 0144, 0147–0149

À l'ajout d'un numéro de reversement, l'opérateur est **déduit du préfixe** et montré ;
un numéro dont le préfixe ne correspond à aucun opérateur est refusé à la saisie.

**Suivi asynchrone** : le payout est accepté puis traité par FedaPay (pending →
started/processing → sent/failed). Deux canaux de mise à jour :
- Le **webhook existant** (`payments-webhook.controller`) étendu aux événements
  `payout.*` : retrouver le payout (`GET /v1/payouts/:id`), mettre à jour la demande
  (`PAID` si sent, `FAILED` sinon).
- Un **polling de secours** (cron, même service que l'escrow scheduler) : toute demande
  `PROCESSING` depuis plus de 10 min est re-vérifiée via l'API ; bloquée depuis plus
  d'une heure → alerte log + notification admin.

**Échec après débit** : `FAILED` → re-crédit automatique (`WITHDRAWAL_REFUND`) +
notification fournisseur (« le versement a échoué, votre solde est rétabli ») + trace
pour l'admin.

**Leçon de concurrence reprise du POS** : l'approbation est une **réservation atomique**
— `UPDATE withdrawal_requests SET status='PROCESSING' WHERE id=? AND status='PENDING'`
qui doit toucher exactement 1 ligne. Deux admins (ou un admin + un retry) qui approuvent
la même demande au même instant : le premier gagne, le second ne débite ni ne verse.
Le débit wallet ayant déjà eu lieu à la création de la demande, l'approbation ne touche
pas au solde — elle ne fait que déclencher le payout.

## API

**Commun / acheteur**
- `GET /wallet/me` — solde + transactions paginées
- `POST /wallet/topup` — initie la recharge FedaPay

**Fournisseur** (`ActiveSupplierGuard`, routes `me` avant `:param`)
- `GET /suppliers/me/wallet` — solde + transactions
- `GET | POST | DELETE /suppliers/me/payout-numbers`
- `GET | POST /suppliers/me/withdrawals` + `PATCH …/:id/cancel`

**Admin**
- `GET /admin/payout-numbers?status=` + `PATCH /admin/payout-numbers/:id` (validate/reject)
- `GET /admin/withdrawals?status=` + `PATCH /admin/withdrawals/:id` (approve → payout FedaPay / reject)
- `GET /admin/wallets` — soldes, dettes (négatifs), total dû aux fournisseurs

CASL : subjects `Wallet`, `Withdrawal`, `PayoutNumber` (+ seeder RBAC + SQL permissions).

## UI

**Mobile acheteur** — écran Portefeuille (solde, bouton Recharger → WebView FedaPay,
historique) accessible depuis le profil ; au checkout, option « Mon portefeuille » avec
solde affiché, désactivée si insuffisant.

**Mobile fournisseur** — carte solde sur le dashboard (sous le détail net actuel) →
écran Portefeuille boutique : solde, mouvements, mes numéros (ajout + statut de
validation), demander un reversement, suivi des demandes.

**Web-spa fournisseur** — page Portefeuille équivalente (menu principal).

**BO** — groupe Ventes → page **Reversements** : file des numéros à valider, file des
demandes (PENDING/PAID/REJECTED), soldes par boutique avec dettes en évidence, total dû.
Textes explicatifs en tête de chaque bloc (même pattern que la page de configuration).

## Ce qui change dans l'existant

- `payments.service.ts` : `releaseEscrow` → crédit wallet ; suppression du stub et de la
  notification mensongère.
- `orders.service.ts` : paiement WALLET au checkout ; débit commission au passage cash
  → DELIVERED (via `applyStatus`, y compris le chemin admin).
- Moyen de paiement `WALLET` ajouté à l'enum + contrats + SDK.
- Réglages : seuil/frais de reversement configurables (plus tard ; constantes en v1).

## Ordre de construction

1. **Fondations** : entités + SQL + `WalletService` transactionnel (crédit/débit/ledger) — testé seul
2. **Refonte escrow + commission cash** (le cœur qui corrige le mensonge actuel)
3. **Recharge + paiement wallet** acheteur (API)
4. **Numéros + demandes de reversement** fournisseur (API)
5. **Payout FedaPay** : gateway (create + start + retrieve), webhook `payout.*`,
   polling de secours, gestion d'échec avec re-crédit
6. **BO admin** (validations, file, soldes)
7. **SDK regen + web-spa + mobile**
8. Lint, tests e2e locaux (scénario complet : recharge → achat wallet → livraison →
   confirmation → crédit boutique → demande → versement BO)

SQL : un script `2026-08-21-wallets.sql` (4 tables + permissions RBAC), appliqué en
local, **prod en attente d'autorisation** comme les autres.
