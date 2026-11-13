# Phase 1 — Contrats d'interface

Préfixe `/api`. Contrats Zod + `@TypedBody` (nzoth), comme partout. Les chemins
existants sont étendus plutôt que doublés.

## 1. Carnet de proches

```
GET    /relatives                    auth acheteur
POST   /relatives                    auth acheteur
PATCH  /relatives/:id                auth acheteur, propriétaire
DELETE /relatives/:id                auth acheteur, propriétaire
```

```jsonc
// POST body / PATCH body (tous champs optionnels en PATCH)
{
  "nickname": "Maman",                 // 1..40
  "name": "Afiavi Kossou",             // 1..120
  "phone": "+2290197123456",           // ^\+229\d{10}$
  "address": "Cadjèhoun, rue après la pharmacie, portail bleu",  // ≥ 10
  "latitude": 6.3576, "longitude": 2.3912
}
// Réponse : { id, nickname, name, phone, address, latitude, longitude, createdAt }
```

Erreurs : `409 RELATIVE_PHONE_EXISTS`, `422 RELATIVES_LIMIT_REACHED` (20).

## 2. Passage en caisse — extension

```
POST /orders/checkout/preview        (existant)
POST /orders/checkout                (existant)
```

Champs ajoutés au corps (`orders/contracts/checkout.contract.ts`) :

```jsonc
{
  // ... champs existants (items, pickupMode, deliveryAddress, deliveryLatitude/Longitude,
  //     paymentMethod, promoCode, deliverySlot, deliveryWindowStart/End)
  "recipient": {                       // absent = « Me livrer »
    "name": "Afiavi Kossou",
    "phone": "+2290197123456",
    "savedRelativeId": "uuid"          // facultatif
  },
  "displayCurrency": "EUR",            // XOF | EUR | USD | CAD, défaut XOF
  "payerTimeZone": "Europe/Paris"     // facultatif, fuseau IANA de l'appareil
}
```

Quand `recipient` est présent, `deliveryAddress` et `deliveryLatitude/Longitude`
sont ceux du proche et `pickupMode` doit être `DELIVERY`.

Réponse de `preview` — champs ajoutés :

```jsonc
{
  "display": {                         // null si XOF
    "currency": "EUR",
    "rate": 642.837860,                // FCFA par unité, marge incluse
    "total": 31.12,
    "itemsTotal": 28.01, "deliveryFee": 3.11, "discount": 0
  },
  "cardMinimumNotMet": false           // true si proche + total < 1 000 FCFA
}
```

Réponse de `create` — ajouts : `isGift`, `display` (mêmes champs, **gelés**).

Erreurs nouvelles (`400`, `code` dans le corps) :

| Code | Cas |
|---|---|
| `GIFT_CASH_NOT_ALLOWED` | proche + `CASH_ON_DELIVERY` |
| `GIFT_REQUIRES_DELIVERY` | proche + retrait sur place |
| `GIFT_RECIPIENT_IS_PAYER` | (pas une erreur : traité comme commande ordinaire, `recipient` ignoré) |
| `GIFT_AMOUNT_TOO_LOW` | proche + total < 1 000 FCFA (minimum carte INTRAM) |
| `ACCOUNT_NOT_VERIFIED` | ni e-mail ni téléphone vérifié (toute commande) |

## 3. Commandes du payeur

```
GET  /orders/:id                     (existant) — ajoute recipient, display, proof
POST /checkouts/:id/recipient-sms    auth payeur — renvoie le dernier SMS au proche
```

Bloc ajouté à la réponse d'une commande :

```jsonc
{
  "gift": {
    "recipient": { "name": "Afiavi Kossou", "phone": "+2290197123456" },
    "confirmationCode": "4821",        // dès la collecte, comme aujourd'hui
    "smsResendsLeft": 2
  },
  "display": { "currency": "EUR", "rate": 642.837860, "total": 31.12 },
  "proof": {                           // après la remise
    "photoUrl": "https://…signed…",    // URL signée 1 h
    "takenAt": "2026-11-20T09:42:00Z",
    "far": false
  }
}
```

`recipient-sms` : `204`, ou `429 RECIPIENT_SMS_LIMIT` après 3 renvois.

## 4. Paniers reçus (compte du proche)

```
GET /orders/received?page=1&limit=20     auth, téléphone vérifié
```

```jsonc
{
  "items": [
    {
      "orderId": "uuid",
      "payerFirstName": "Awa",
      "shopName": "Ferme Bio Tori",
      "status": "DELIVERED",
      "deliveredAt": "2026-11-20T09:42:00Z",
      "lines": [{ "productId": "uuid", "name": "Tomates", "quantity": 2, "imageUrl": "…" }],
      "canReview": true
    }
  ],
  "total": 1
}
```

Aucun montant (FR-031). L'avis passe par les routes existantes du module
`ratings`, dont l'éligibilité accepte le proche rattaché.

## 5. Suivi public

```
GET /gift-tracking/:token            @Public, RateLimit 60/min
```

```jsonc
{
  "payerFirstName": "Awa",
  "recipientFirstName": "Afiavi",
  "status": "IN_TRANSIT",             // PAID | PREPARING | IN_TRANSIT | DELIVERED | FAILED | CANCELLED
  "window": { "start": "…", "end": "…" },
  "shops": [{ "name": "Ferme Bio Tori" }],
  "lines": [{ "name": "Tomates", "quantity": 2, "imageUrl": "…" }],
  "courierPosition": { "latitude": 6.36, "longitude": 2.39, "at": "…" },   // seulement pendant la course
  "destination": { "latitude": 6.3576, "longitude": 2.3912 },
  "expired": false
}
```

Sept jours après la fin : `{ "status": "DELIVERED", "expired": true }` et rien
d'autre. Jeton inconnu : `404`. Jamais de prix, code, téléphone ni adresse texte.

Page publique : `apps/landing` route `suivi/:token` →
`${PUBLIC_SITE_URL}/suivi/<token>`.

## 6. Preuve de remise — extension

```
POST /deliveries/:id/complete        (existant)
POST /runs/:id/deliver               (existant)
```

Nouvelle branche de l'union discriminée :

```jsonc
{
  "proofType": "CODE_AND_PHOTO",
  "code": "4821",
  "mediaId": "uuid",                   // contexte DELIVERY_PROOF, envoyé par ce livreur
  "latitude": 6.35771, "longitude": 2.39108,
  "occurredAt": "2026-11-20T09:42:00Z"
}
```

Erreurs : `400 GIFT_PROOF_REQUIRED` (livraison pour un proche avec `CODE` ou
`PHOTO` seul), `400 INVALID_PROOF_MEDIA`.

La réponse de `GET /deliveries/:id` côté livreur ajoute `requiresGiftProof:
true` et remplace `buyerContact` par le proche :
`{ name, phone, role: "RECIPIENT", payerFirstName }`.

`POST /deliveries/:id/fail` : contrat inchangé ; l'effet change pour une
livraison pour un proche (research §5).

## 7. Devise

```
GET /settings/public                 (existant) — ajoute currencies
PUT /users/me                        (existant) — ajoute displayCurrency
```

```jsonc
// GET /settings/public, champ ajouté
"currencies": {
  "EUR": { "rate": 642.837860 },      // marge incluse
  "USD": { "rate": 588.120987 },
  "CAD": { "rate": 422.367901 }
}
```

`PUT /users/me` : `{ "displayCurrency": "USD" }`, et `phone` validé E.164.
Changer `phone` remet `phone_verified_at` à null.

## 8. Back-office

```
GET  /admin/exchange-rates           @Roles ADMIN, @CanManage Settings
PUT  /admin/exchange-rates           { "EUR": 655.957, "USD": 600.12, "CAD": 431.0 }  (chaque clé facultative) → source MANUAL
PUT  /admin/fx-margin                { "bps": 200 }                    (0..1000)
POST /admin/exchange-rates/refresh   relance le téléchargement
GET  /admin/orders?gift=true         (existant) — filtre ajouté
GET  /admin/orders/:id               (existant) — ajoute gift, display, proof (photo signée, far, distance)
GET  /admin/deliveries/far-proofs    liste des preuves signalées (FR-036)
```

`GET /admin/exchange-rates` :

```jsonc
{
  "marginBps": 200,
  "rates": {
    "EUR": { "xofPerUnit": 655.957, "source": "MANUAL", "updatedAt": "…", "stale": false },
    "USD": { "xofPerUnit": 600.123456, "source": "AUTO", "updatedAt": "…", "stale": false },
    "CAD": { "xofPerUnit": 430.987654, "source": "MANUAL", "updatedAt": "…", "stale": true }
  }
}
```

`stale` = `updatedAt` vieux de plus de 72 h (FR-021b) — jamais vrai pour EUR,
qui ne dépend d'aucune mise à jour automatique.

## 9. Authentification

```
POST /otp-auth/request               (existant)
```

Un numéro hors `+229` renvoie `400` avec `code: "PHONE_NOT_SUPPORTED"`
(aujourd'hui : erreur Zod générique). L'app le traduit en proposition
Google / Apple / e-mail (FR-034).

## 10. Notifications et SMS

| Événement | Destinataire | Canal | Contenu |
|---|---|---|---|
| Paiement confirmé | proche | SMS | « Awa vous envoie un panier eBio, livré demain entre 10 h et 12 h. Suivi : <lien> » |
| Livreur parti | proche | SMS | « Votre panier eBio arrive. Code à donner au livreur : 4821 » |
| Annulation | proche | SMS | « Le panier envoyé par Awa est annulé. » |
| Remise | payeur | push (image) + e-mail (photo inline) | `GIFT_DELIVERED` |
| Échec | payeur | push + e-mail | `GIFT_DELIVERY_FAILED`, motif et montant recrédité |

SMS au proche : `SmsService.send()` direct. Au payeur : jamais de SMS si son
numéro n'est pas `+229` (garde dans `NotificationsService.sendSms`).
