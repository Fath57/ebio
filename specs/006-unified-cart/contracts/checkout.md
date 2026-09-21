# Contrat — Passage en caisse

**Feature**: 006-unified-cart

Les contrats sont décrits par leur forme, pas par leur implémentation. Côté
API ils seront exprimés en Zod puis exposés via `@TypedBody`, conformément au
module `orders` existant.

---

## `POST /api/orders/preview`

**Évolution d'un endpoint existant.** Aujourd'hui il prend un `supplierId` et
des articles ; il accepte désormais un panier multi-boutiques.

### Requête

```
{
  items: [{ productId, variantId?, quantity }],      // toutes boutiques confondues
  pickupMode: 'DELIVERY' | 'ON_SITE',
  deliveryLatitude?, deliveryLongitude?,
  promoCode?
}
```

`supplierId` disparaît de l'entrée : les boutiques se déduisent des produits.

### Réponse

```
{
  suppliers: [                       // un bloc par boutique, pour l'affichage
    { supplierId, shopName, lines: [...], itemsTotal, blocked?: 'OUT_OF_RANGE' }
  ],
  itemsTotal,
  discount,
  deliveryFee,                       // frais UNIQUES de la tournée
  deliveryReason,                    // motifs existants, au niveau tournée
  deliveryDistanceKm,                // distance de la tournée complète
  total,
  cashLimitExceededBy?               // renseigné si le plafond espèces est dépassé
}
```

**Règles**

- `deliveryFee` est calculé sur la distance de la tournée, pas par la somme des
  frais que chaque boutique facturerait isolément (research D4).
- `deliveryReason = 'NO_SHOP_POSITION'` n'est **pas** bloquant : le forfait
  s'applique, comme établi par le commit `db18b82`.
- Une boutique hors zone est signalée dans son bloc, nommément, afin que
  l'acheteur sache laquelle retirer (FR-025).
- `cashLimitExceededBy` alimente le message de FR-012b.

---

## `POST /api/orders`

**Évolution.** Crée un checkout, puis N commandes.

### Requête

```
{
  items: [{ productId, variantId?, quantity }],
  pickupMode, deliveryAddress?, deliveryLatitude?, deliveryLongitude?,
  paymentMethod, promoCode?, deliverySlot?
}
```

### Réponse

```
{
  checkoutId,
  orders: [{ orderId, orderNumber, supplierId, shopName, total }],
  deliveryRunId?,                    // absent en retrait sur place
  payment: { ... }                   // charge utile du prestataire, inchangée
}
```

**Règles**

- Le checkout et les N commandes sont créés dans **une seule transaction** : ou
  tout existe, ou rien.
- Chaque commande conserve son numéro, son suivi, son chat (FR-007).
- Le contrôle du plafond espèces porte sur le total du checkout (FR-012a).
- En `ON_SITE`, aucune tournée n'est créée (hypothèse de la spec).

---

## `POST /api/checkouts/:id/compensate`

**Nouveau, usage interne.** Déclenché quand une commande du checkout est
refusée ou annulée.

```
Requête  : { orderId, reason }
Réponse  : { walletTransactionId, amount }
```

**Règles**

- Crédite le portefeuille eBio de l'acheteur du montant exact de la commande,
  en `WalletTransactionType.REFUND` (research D2).
- Recalcule les frais de la tournée et crédite l'écart s'il y a lieu (US3,
  scénario 2).
- Passe le checkout en `PARTIALLY_REFUNDED`, ou `REFUNDED` si plus aucune
  commande ne survit.
- **Idempotent** : rejouer l'appel pour la même commande ne crédite pas deux
  fois.
