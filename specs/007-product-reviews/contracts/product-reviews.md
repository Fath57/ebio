# Phase 1 — Contrats d'interface

Cinq points d'entrée. Les chemins suivent ceux du module `ratings` existant
(`suppliers/:id/reviews`, `reviews/:id/report`), pour qu'un lecteur n'ait pas
deux conventions à retenir.

## 1. Lire les avis d'un produit

```
GET /api/products/:id/reviews?page=1&limit=20     @Public
```

Public : la fiche produit est consultable sans compte.

```jsonc
{
  "summary": {
    "average": 4.6,          // null tant que count < 3 (FR-010)
    "count": 23,             // toujours renvoyé, même sous le seuil
    "distribution": { "1": 0, "2": 1, "3": 2, "4": 6, "5": 14 }
  },
  "reviews": [
    {
      "id": "uuid",
      "rating": 5,
      "comment": "Des tomates vraiment goûteuses.",  // null si absent
      "authorName": "Awa K.",
      "createdAt": "2026-09-20T10:04:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 23, "hasMore": true }
}
```

- Les avis masqués (`is_hidden`) ne sortent jamais et ne comptent ni dans
  `count` ni dans `distribution`.
- Tri : `createdAt DESC`.
- `authorName` suit exactement la règle d'affichage des avis de boutique ;
  aucune nouvelle politique d'identité n'est introduite.
- La **répartition** est renvoyée par le résumé plutôt que calculée côté mobile :
  elle porte sur tous les avis, pas seulement sur la page demandée.

## 2. Déposer des avis

```
POST /api/orders/:orderId/product-reviews          @Auth
```

Un seul appel pour toute l'étape de notation : l'acheteur note trois produits,
l'application envoie une requête. Sur un réseau mobile, trois allers-retours
séquentiels sont trois occasions d'échouer à moitié.

```jsonc
// requête
{
  "reviews": [
    { "orderItemId": "uuid", "rating": 4, "comment": "Bien mûres." },
    { "orderItemId": "uuid", "rating": 5 }
  ]
}

// réponse 201
{ "created": 2, "skipped": 0 }
```

Refus (`400`) :

- la commande n'appartient pas à l'appelant ;
- la commande n'est pas au statut `DELIVERED` (FR-003) ;
- une `orderItemId` n'appartient pas à cette commande ;
- `rating` hors de 1–5 ;
- un `comment` sans `rating` (FR-004).

Une ligne déjà notée est **ignorée, pas refusée** : elle incrémente `skipped`.
Un renvoi après coupure réseau ne doit pas échouer en bloc sur un doublon — la
contrainte d'unicité garantit le résultat, la réponse dit ce qui s'est passé.

## 3. Savoir quoi proposer à la notation

```
GET /api/orders/:orderId/rateable-products         @Auth
```

Alimente l'étape de notation. Retourne les lignes livrées, avec l'avis déjà
déposé s'il existe (scénario d'acceptation 4 de US1).

```jsonc
{
  "items": [
    {
      "orderItemId": "uuid",
      "productId": "uuid",
      "productName": "Tomates de saison",
      "thumbnail": "https://…",
      "existingReview": { "rating": 4, "comment": "Bien mûres." }  // ou null
    }
  ]
}
```

Renvoie `items: []` si la commande n'est pas livrée : l'étape est alors sautée,
elle n'affiche pas une erreur.

## 4. Signaler un avis produit

```
POST /api/product-reviews/:id/report               @Auth
{ "reason": "Propos injurieux" }                   // max 500 caractères
```

Crée une ligne `content_reports` de type `PRODUCT_REVIEW`, statut `PENDING`.
L'avis **reste visible** en attendant la décision (US4, scénario 1).

> À la différence de `POST /reviews/:id/report`, qui retourne aujourd'hui
> `{ reported: true }` sans rien écrire, celui-ci écrit réellement.

## 5. Modérer (back-office)

```
GET   /api/admin/content-reports?status=PENDING    @Roles(ADMIN, SUPER_ADMIN)
PATCH /api/admin/product-reviews/:id/visibility    @Roles(ADMIN, SUPER_ADMIN)
      { "hidden": true }
```

Masquer ou réhabiliter déclenche le recalcul de l'agrégat du produit (FR-020) et
résout le signalement associé.

## Modifications de contrats existants

### `GET /api/products/:id` et la recherche

La réponse produit gagne deux champs, servis depuis les colonnes dénormalisées —
aucune requête supplémentaire (FR-013) :

```jsonc
{ "ratingAvg": 4.6, "ratingCount": 23 }
```

Ajoutés à `ProductResponse` (`products/contracts/product.contract.ts`), à
`ProductMapper.toResponse` **et** à `toSummary`, ainsi qu'au
`searchResultSchema` : les cartes de résultat doivent pouvoir afficher la note.

### `GET /api/search/products?sortBy=rating`

`buildOrderClause('rating')` passe de :

```sql
ORDER BY s.global_rating DESC NULLS LAST, distance ASC
```

à :

```sql
ORDER BY p.rating_avg DESC NULLS LAST, distance ASC
```

Change aussi ce que met en avant la section « Validé eBio » de l'accueil, qui
appelle ce tri — des produits bien notés au lieu de boutiques bien notées.
Cohérent, mais c'est un changement de comportement visible.

### Ce qui ne bouge pas

`POST /api/reviews`, `GET /api/suppliers/:id/reviews`, `GET
/api/suppliers/:id/badges` : inchangés (FR-022). La fiche fournisseur continue
d'afficher ses propres avis.
