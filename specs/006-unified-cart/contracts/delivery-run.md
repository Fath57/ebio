# Contrat — Tournée de livraison

**Feature**: 006-unified-cart

---

## `GET /api/couriers/me/runs/offered`

La tournée actuellement proposée au livreur connecté.

```
{
  runId, checkoutId,
  shopCount, totalDistanceKm, earning,
  pickups: [                          // dans l'ordre de passage
    { deliveryId, orderNumber, shopName, address, latitude, longitude }
  ],
  dropoff: { address, latitude, longitude },
  offerExpiresAt
}
```

---

## `POST /api/couriers/me/runs/:id/respond`

```
Requête : { response: 'ACCEPT' | 'REFUSE' }
Réponse : { status }
```

**Règles**

- La décision porte sur **toute** la tournée : aucune acceptation partielle
  (FR-015).
- Une acceptation assigne les N livraisons au même livreur et incrémente
  `offers_sent` pour la mesure (FR-020a).
- Un refus relance la diffusion selon la mécanique existante — proposition
  ciblée puis diffusion large.

---

## `POST /api/deliveries/:id/collect`

Collecte chez **une** boutique de la tournée.

```
Réponse : { deliveryStatus, runStatus, remainingPickups }
```

**Règles**

- Ne fait passer que la commande de cette boutique en « récupérée » (FR-017).
- La tournée passe en `DELIVERING` quand la dernière collecte est faite.

---

## `POST /api/runs/:id/deliver`

Remise finale, unique.

```
Requête : { code }                    // le code à 4 chiffres existant
Réponse : { runStatus, orders: [{ orderId, status }] }
```

**Règles**

- Un seul geste fait passer **toutes** les commandes de la tournée en
  « livrée » (FR-017).
- Le code de remise reste celui de l'acheteur, pas un par boutique.
- En espèces, l'encaissement porte sur le total de la tournée.

---

## `POST /api/runs/:id/buyer-decision`

Ce que l'acheteur répond quand aucune tournée n'a trouvé preneur (FR-022a).

```
Requête : { decision: 'WAIT' | 'CANCEL' }
Réponse : { runStatus }
```

**Règles**

- `CANCEL` crédite l'intégralité du montant, frais compris, et prévient les
  boutiques (FR-022b).
- `WAIT` relance la diffusion ; l'option d'annuler reste ouverte tant que rien
  n'a été collecté.
