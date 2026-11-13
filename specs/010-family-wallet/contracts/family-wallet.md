# Phase 1 — Contrats d'interface

Préfixe `/api`. Zod + `@TypedBody`. Erreurs : `{ statusCode, code, message }`.
Montants en FCFA ; `display` (devise du demandeur) ajouté là où il est affiché.

## 1. Payeur — portefeuille

```
GET    /family-wallet                    auth — 404 FAMILY_WALLET_NONE si aucun
POST   /family-wallet                    auth — ouvre (409 FAMILY_WALLET_EXISTS)
PATCH  /family-wallet                    auth — limites par défaut, seuil
POST   /family-wallet/suspend            auth
POST   /family-wallet/resume             auth — 403 si suspendu par le back-office
POST   /family-wallet/close              auth — rend le solde au portefeuille personnel
```

```jsonc
// GET /family-wallet
{
  "id": "uuid",
  "status": "ACTIVE",                     // ACTIVE | SUSPENDED | CLOSED
  "balance": 64000,
  "display": { "currency": "EUR", "balance": 99.57 },
  "lowBalanceThreshold": 5000,
  "defaults": { "monthlyCap": 40000, "orderMax": 15000, "categoryIds": null },
  "members": [
    {
      "id": "uuid", "nickname": "Maman", "phone": "+2290197000001",
      "status": "ACTIVE",                 // PENDING | ACTIVE | SUSPENDED
      "limits": { "monthlyCap": 80000, "orderMax": null, "categoryIds": null },  // propres (null = défaut)
      "effective": { "monthlyCap": 80000, "orderMax": 15000, "categoryIds": null },
      "spentThisMonth": 12500
    }
  ]
}
```

```jsonc
// PATCH /family-wallet
{ "defaults": { "monthlyCap": 40000, "orderMax": null, "categoryIds": ["uuid"] }, "lowBalanceThreshold": 5000 }
```

Règles : montants > 0 ou `null` (pas de limite) ; `categoryIds` vide refusé (`null` = toutes).

## 2. Payeur — membres

```
POST   /family-wallet/members                   auth
PATCH  /family-wallet/members/:id               auth — limites propres
POST   /family-wallet/members/:id/suspend       auth
POST   /family-wallet/members/:id/resume        auth
POST   /family-wallet/members/:id/invite        auth — renvoie le SMS (PENDING seulement, 1 par 24 h)
DELETE /family-wallet/members/:id               auth — retire (204)
```

```jsonc
// POST /family-wallet/members — depuis le carnet
{ "savedRelativeId": "uuid" }
// … ou un nouveau proche (créé aussi dans le carnet, mêmes règles que POST /relatives)
{ "relative": { "nickname": "Tata", "name": "Rose Agbo", "phone": "+2290196000002", "address": null, "latitude": null, "longitude": null } }
```

Erreurs : `409 FAMILY_MEMBER_EXISTS`, `400 FAMILY_MEMBER_IS_PAYER`,
`422 RELATIVES_LIMIT_REACHED` (création), `404` proche d'un autre payeur.
Réponse : le membre (`status` `ACTIVE` si un compte vérifié porte ce numéro,
sinon `PENDING` et SMS d'invitation envoyé).

Le carnet (`POST /relatives`) accepte désormais `address`, `latitude`,
`longitude` à `null` : un proche du portefeuille n'a pas forcément d'adresse
(une commande pour un proche, elle, l'exige toujours).

```jsonc
// PATCH /family-wallet/members/:id — null = revenir à la valeur par défaut
{ "limits": { "monthlyCap": 80000, "orderMax": null, "categoryIds": null } }
```

## 3. Payeur — argent

```
POST /family-wallet/topups                     auth — { amount } → { topupId, paymentUrl, providerTransactionId }
POST /family-wallet/topups/:id/verify          auth — comme /wallet/me/topups/:id/verify
POST /family-wallet/transfer                   auth — { amount } depuis le portefeuille personnel
GET  /family-wallet/transactions?memberId&page&limit   auth
```

Bornes : 1 000 ≤ `amount` ≤ 500 000 (`400 FAMILY_TOPUP_AMOUNT`) ; virement :
`400 INSUFFICIENT_BALANCE` si le personnel ne suffit pas.

```jsonc
// GET /family-wallet/transactions
{
  "items": [
    { "id": "uuid", "type": "ORDER_PAYMENT", "amount": -6800, "balanceAfter": 57200,
      "createdAt": "…", "member": { "id": "uuid", "nickname": "Maman" },
      "order": { "id": "uuid", "orderNumber": "EB-…", "shopName": "Ferme Bio Tori",
                 "lines": [{ "name": "Tomates", "quantity": 2, "imageUrl": "…" }] } },
    { "id": "uuid", "type": "TOPUP", "amount": 32000, "balanceAfter": 64000, "createdAt": "…" }
  ],
  "total": 12
}
```

Jamais d'adresse ni de message (FR-027).

## 4. Membre

```
GET /family-wallets/mine                          auth — portefeuilles dont je suis membre actif
GET /family-wallets/mine/:memberId/transactions   auth — mes achats seulement
```

```jsonc
// GET /family-wallets/mine
[
  {
    "memberId": "uuid",
    "payerFirstName": "Awa",
    "status": "ACTIVE",                   // statut combiné portefeuille + membre
    "spendable": 15000,
    "limits": { "monthlyCap": 40000, "orderMax": 15000, "categoryNames": null },
    "spentThisMonth": 25000
  }
]
```

Jamais le solde total (FR-025).

## 5. Passage en caisse

Corps de `POST /orders/checkout` et `/orders/checkout/preview` :

```jsonc
{ "paymentMethod": "FAMILY_WALLET", "familyMemberId": "uuid", /* … champs existants */ }
```

Réponse de `preview`, champ ajouté (toujours présent pour un acheteur connecté) :

```jsonc
"familyWallets": [
  {
    "memberId": "uuid", "payerFirstName": "Awa", "spendable": 15000,
    "usable": false,
    "reason": "CATEGORY",                // null | INACTIVE | CATEGORY | ORDER_MAX | MONTHLY_CAP | INSUFFICIENT
    "blockedProductIds": ["uuid"]        // seulement pour CATEGORY
  }
]
```

Erreurs de `create` : `400 FAMILY_WALLET_REFUSED` avec `reason` (mêmes valeurs),
`400 FAMILY_WALLET_WITH_RECIPIENT` (une commande pour un proche n'est pas payable
par un portefeuille famille — c'est le payeur qui achète, pas un membre).

## 6. Suppression de compte

`DELETE /users/me` : `409 FAMILY_WALLET_OPEN` tant que le demandeur est payeur
d'un portefeuille non fermé.

## 7. Back-office

```
GET  /admin/family-wallets?status&search&page&limit    @CanManage('Payment') lecture
GET  /admin/family-wallets/:id                         détail, membres, historique
POST /admin/family-wallets/:id/suspend   { reason }    audit FAMILY_WALLET_SUSPENDED
POST /admin/family-wallets/:id/resume
POST /admin/family-wallets/members/:id/suspend { reason }
GET  /admin/wallets?ownerType=FAMILY                   (existant) — type ajouté
```

## 8. Notifications et SMS

| Événement | Destinataire | Canal | Texte |
|---|---|---|---|
| Membre ajouté (compte vérifié) | membre | push + SMS | « Awa vous a ajouté(e) à son portefeuille famille eBio : vos courses peuvent être payées avec. » |
| Membre ajouté (sans compte) | numéro | SMS | « Awa vous a ajouté(e) à son portefeuille famille eBio. Installez eBio avec ce numéro pour faire vos courses : <lien> » |
| Recharge | membres actifs | push | « Awa a rechargé le portefeuille famille. Vous pouvez dépenser 15 000 FCFA ce mois-ci. » |
| Achat | payeur | push | « Maman a commandé chez Ferme Bio Tori : 6 800 FCFA. » |
| Solde bas | payeur | push + e-mail | « Il reste 4 200 FCFA dans votre portefeuille famille. » |
| Membre rejoint | payeur | push | « Tata a rejoint votre portefeuille famille. » |
| 30 jours en attente | payeur | push | « Tata n'a pas encore installé eBio. Renvoyer l'invitation ? » |
| Suspension / réactivation / retrait / fermeture | membres concernés | push | texte selon le cas |
