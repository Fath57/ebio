# Phase 1 — Contrats d'interface

Préfixe `/api`. Zod + `@TypedBody`. Erreurs `{ statusCode, code, message }`.
Montants en FCFA ; un bloc `display` (devise du demandeur) accompagne les
montants affichés. Routes client derrière la garde `terroir_export_enabled`
(403 `TERROIR_DISABLED`) ; routes back-office et boutique toujours ouvertes.

## 1. Client — catalogue et départs

```
GET /terroir/catalog?country=FR&category&search&page    auth facultative
GET /terroir/products/:id                               fiche + origine + badge
GET /terroir/packs/:id
GET /terroir/departures?country=FR&weightG=3200         départs proposables
POST /terroir/departure-alerts        { country }       « Me prévenir »
DELETE /terroir/departure-alerts/:country
```

```jsonc
// GET /terroir/departures
{
  "next": { "departureId": "uuid", "city": "Paris", "departsOn": "2026-11-22", "orderBefore": "2026-11-18T23:59:00Z" },
  "items": [
    { "departureId": "uuid", "agency": "Bénin Express", "departsOn": "2026-11-22",
      "arrival": { "from": "2026-11-29", "to": "2026-12-03" },
      "pricePerKg": 8500, "minBilledKg": 5, "homeDeliveryFee": 3900,
      "shippingPrice": 42500, "display": { "currency": "EUR", "shippingPrice": 67.07 },
      "orderBefore": "2026-11-18T23:59:00Z", "full": false }
  ]
}
```

## 2. Client — passage en caisse

```
POST /terroir/checkout/preview
POST /terroir/checkout
```

```jsonc
{
  "country": "FR",
  "lines": [ { "productId": "uuid", "variantId": null, "quantity": 2 }, { "packId": "uuid", "quantity": 1 } ],
  "departureId": "uuid",
  "reception": "PICKUP",                 // PICKUP | HOME
  "pickupPointId": "uuid",               // si PICKUP (sinon le premier de la ville)
  "homeAddress": null,                   // si HOME
  "insured": true,
  "gift": { "name": "Mireille", "email": "m@…", "phone": "+32…", "message": "Joyeux anniversaire" },  // facultatif
  "paymentMethod": "FEDAPAY",            // FEDAPAY (carte, page hébergée) | WALLET
  "displayCurrency": "EUR"
}
```

```jsonc
// réponse preview
{
  "estimatedWeightG": 3200,
  "billedKg": 5, "marginKg": 1.8,
  "suggestions": [ { "productId": "uuid", "name": "Moringa 100 g", "weightG": 120, "price": 2500, "imageUrl": "…" } ],
  "itemsTotal": 18500, "shippingPrice": 42500, "homeDeliveryFee": 0, "insurancePrice": 1800,
  "total": 62800,
  "display": { "currency": "EUR", "total": 99.11, "itemsTotal": 29.19, "shippingPrice": 67.07, "insurancePrice": 2.85 },
  "departures": [ /* comme §1 */ ],
  "unavailable": [ { "productId": "uuid", "reason": "NOT_EXPORTABLE" } ]
}
```

Erreurs de `create` : `DEPARTURE_UNAVAILABLE` (plein, échu, trop lourd),
`TERROIR_LINE_UNAVAILABLE`, `PICKUP_POINT_REQUIRED`, `HOME_DELIVERY_UNAVAILABLE`,
`TERROIR_COUNTRY` (pays hors FR/BE). Réponse :
`{ checkoutId, shipmentId, paymentUrl? }` — paiement comme un passage en caisse
existant (`/payments/cart/initiate` et `/verify`, ou débit immédiat du portefeuille).

## 3. Client — colis

```
GET  /terroir/shipments                     mes colis
GET  /terroir/shipments/:id                 détail + événements
POST /terroir/shipments/:id/supplement      { choice: "PAY" | "REMOVE_ITEM", lineId? } → { paymentUrl? }
GET  /terroir/tracking/:token               @Public — destinataire d'un colis offert, sans prix
```

```jsonc
// GET /terroir/shipments/:id
{
  "id": "uuid", "status": "READY_FOR_PICKUP", "country": "FR",
  "departure": { "agency": "Bénin Express", "departsOn": "2026-11-22", "arrival": { "from": "…", "to": "…" } },
  "reception": "PICKUP",
  "pickupPoint": { "city": "Paris", "address": "12 rue …", "openingHours": "mar.–sam. 10 h–19 h" },
  "lines": [ { "name": "Beurre de karité", "quantity": 2, "imageUrl": "…", "shopName": "Karité Fatou" } ],
  "events": [ { "step": "DEPARTED", "message": null, "at": "…" }, { "step": null, "message": "Retrait possible samedi matin", "at": "…" } ],
  "supplement": null,                      // ou { amount, display, deadline }
  "total": 62800, "display": { "currency": "EUR", "total": 99.11 },
  "insured": true, "gift": { "name": "Mireille" }
}
```

## 4. Boutique — export et packs

```
PUT    /suppliers/:supplierId/products/:id/export        demande / mise à jour du profil d'export
DELETE /suppliers/:supplierId/products/:id/export        retire de l'export
GET    /suppliers/:supplierId/export-packs
POST   /suppliers/:supplierId/export-packs               { name, description, photos, price, items:[{productId, variantId?, quantity}] }
PATCH  /suppliers/:supplierId/export-packs/:id
DELETE /suppliers/:supplierId/export-packs/:id           → RETIRED
```

Profil : `{ packedWeightG, lengthCm?, widthCm?, heightCm?, shelfLifeDays, origin: { producer?, place?, year?, method?, photos[] }, labelPhoto }`.
Erreurs : `EXPORT_CATEGORY_BANNED`, `EXPORT_PACK_FOREIGN_PRODUCT`.
La commande terroir apparaît à la boutique comme une commande ordinaire
`pickupMode: EXPORT`, avec `collectBefore` ; l'action finale de la boutique est
« Prête pour la collecte » (`READY`).

## 5. Back-office

```
# Validation
GET  /admin/export/reviews?status=PENDING              produits et packs à valider
POST /admin/export/products/:id/review   { decision: "APPROVE"|"REJECT", checklist, reason? }
POST /admin/export/packs/:id/review      { decision, reason? }
# Packs eBio
GET/POST/PATCH /admin/export/packs                     packs eBio (supplier null)
# Agences et départs
GET/POST/PATCH /admin/export/agencies
GET/POST/PATCH /admin/export/agencies/:id/pickup-points
GET/POST/PATCH /admin/export/departures                { agencyId, departsOn, depositDeadline, transitMinDays, transitMaxDays, capacityKg?, rates:[{country, pricePerKg, minBilledKg, maxWeightKg?, homeDeliveryFee?}] }
POST /admin/export/departures/:id/cancel  { reassignTo? }
GET  /admin/export/departures/:id                      remplissage, colis, liste de collecte par boutique
GET  /admin/export/departures/:id/manifest             liste imprimable (HTML)
# Colis
POST /admin/export/shipments/:id/collect   { supplierId }            collecte d'une boutique → commande DELIVERED, séquestre libéré
POST /admin/export/shipments/:id/missing   { orderItemId }           produit manquant → retrait + remboursement
POST /admin/export/shipments/:id/weigh     { actualWeightG }         → complément éventuel
POST /admin/export/shipments/:id/events    { step?, message?, pickupPoint? }
POST /admin/export/departures/:id/events   { step, message? }        tous les colis du départ
POST /admin/export/shipments/:id/handed-over
POST /admin/export/shipments/:id/lost      { damaged: boolean }      remboursement sans retour
```

```jsonc
// GET /admin/export/departures/:id
{
  "id": "uuid", "agency": { "id": "uuid", "name": "Bénin Express" }, "status": "OPEN",
  "fill": { "reservedKg": 82.4, "capacityKg": 100, "ratio": 0.82 },
  "shipments": [ { "id": "uuid", "buyer": "Awa D.", "country": "FR", "status": "COLLECTING", "estimatedWeightG": 3200, "actualWeightG": null, "insured": true } ],
  "collection": [ { "supplierId": "uuid", "shopName": "Karité Fatou", "lines": [ { "shipmentId": "uuid", "name": "Beurre de karité", "quantity": 2 } ], "collected": false } ]
}
```

## 6. Notifications

| Type | Destinataire | Canal | Exemple |
|---|---|---|---|
| `EXPORT_SHIPMENT_UPDATE` | client (+ destinataire offert par e-mail/SMS, sans prix) | push + e-mail | « Votre colis est disponible au retrait : Bénin Express, 12 rue … » |
| `EXPORT_DEPARTURE_OPEN` | inscrits à l'alerte | push | « Prochain envoi vers Paris le 22 novembre — commandez avant le 18. » |
| `EXPORT_DEADLINE_REMINDER` | client avec aperçu non payé | push | « Plus que 48 h pour le départ du 22 novembre. » |
| `EXPORT_WEIGHT_SUPPLEMENT` | client | push + e-mail | « Votre colis pèse 6,2 kg au lieu de 5 kg : … » |
| `EXPORT_PRODUCT_REVIEWED` | boutique | push | « Votre beurre de karité est validé pour l'export. » |
| `EXPORT_DEPARTURE_FILL` | équipe | e-mail | « Le départ du 22 novembre est rempli à 80 %. » |
