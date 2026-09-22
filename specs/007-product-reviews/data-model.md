# Phase 1 — Modèle de données

## Nouvelle table : `product_reviews`

Un avis porte sur **une ligne de commande**, ce qui prouve l'achat et le borne à
une livraison.

| Colonne | Type | Contrainte | Rôle |
|---|---|---|---|
| `id` | `uuid` | PK, `gen_random_uuid()` | |
| `order_item_id` | `uuid` | **NOT NULL, UNIQUE**, FK → `order_items` | la preuve d'achat, et l'unicité |
| `product_id` | `uuid` | NOT NULL, FK → `products` | dénormalisé : sert le filtre de lecture sans jointure |
| `buyer_id` | `uuid` | NOT NULL, FK → `users` | l'auteur |
| `rating` | `smallint` | NOT NULL, CHECK `BETWEEN 1 AND 5` | la note |
| `comment` | `text` | NULL | facultatif (FR-004) |
| `is_hidden` | `boolean` | NOT NULL DEFAULT false | masqué par la modération (FR-020) |
| `createdAt` | `timestamptz` | NOT NULL DEFAULT now() | |

**`product_id` est volontairement redondant** avec ce que `order_item_id`
permettrait de retrouver. Sans lui, lister les avis d'un produit imposerait une
jointure sur `order_items` à chaque page, sur le chemin le plus chaud de la
fonctionnalité.

**Index** :

- `product_reviews_product_idx` sur `(product_id, is_hidden, "createdAt" DESC)`
  — la lecture paginée de la fiche, exactement dans son ordre de tri.
- `product_reviews_buyer_idx` sur `(buyer_id)` — la détection de fraude et les
  besoins de modération.
- L'unicité sur `order_item_id` est un index à elle seule.

**Clés étrangères, pas de cascade explicite** : un produit supprimé
définitivement emporte ses avis (cas limite de la spec). La suppression de
produit étant aujourd'hui un `softDelete`, le cas ne se présente pas en
pratique ; la contrainte reste le filet.

## Colonnes ajoutées à `products`

| Colonne | Type | Défaut | Rôle |
|---|---|---|---|
| `rating_avg` | `real` | NULL | moyenne pondérée, **NULL tant que moins de 3 avis** (FR-010) |
| `rating_count` | `integer` | 0 | nombre d'avis visibles, affiché même sous le seuil |

Même forme que `suppliers.global_rating` / `suppliers.total_reviews`, pour que
la règle du seuil se lise pareil des deux côtés.

`rating_avg` reste NULL sous le seuil, ce qui fait tomber ces produits en fin de
tri via le `NULLS LAST` déjà en place — sans code supplémentaire.

## Ce qui ne change pas

- **`reviews`** (avis de boutique) : aucune modification. FR-022.
- **`order_items`** : aucune colonne ajoutée. L'avis pointe vers elle, pas
  l'inverse.
- **`content_reports`** : la table et son `ReportTargetType` existent déjà. Un
  signalement d'avis produit s'y range sous un type à ajouter,
  `PRODUCT_REVIEW`, pour ne pas confondre avec les avis de boutique lors de la
  modération.

## Transitions d'état d'un avis

```
                 dépôt
   (aucun avis) ───────► visible ──────────────► masqué
                            │   modération          │
                            │                       │
                            └───────────────────────┘
                                 réhabilitation
```

- **visible → masqué** : décision de modération. L'avis quitte les listes et la
  moyenne est recalculée sans lui (FR-020).
- **masqué → visible** : le signalement est rejeté. La moyenne le reprend.
- Aucune transition vers « supprimé » : la modération masque, elle n'efface pas.
  L'auteur ne peut ni modifier ni supprimer (Assumptions de la spec).

## Règle de calcul de l'agrégat

Recalculé après tout dépôt, masquage ou réhabilitation (FR-015), sur les seuls
avis visibles :

```
moyenne_pondérée = Σ(rating × poids) / Σ(poids)
    où poids = 2 si createdAt ≥ NOW() - 90 jours, sinon 1

rating_count = nombre d'avis visibles
rating_avg   = rating_count ≥ 3 ? arrondi(moyenne_pondérée, 1 décimale) : NULL
```

Identique à `recalculateRating()` des boutiques, à ceci près que la note est
déjà unique au lieu d'être la moyenne de quatre critères.

## Entités MikroORM

- **`ProductReview`** — `apps/api/src/modules/ratings/entities/product-review.entity.ts`.
  Rejoint le module `ratings` existant plutôt que d'en créer un : c'est le même
  domaine, le même service de fraude, la même modération.
- **`Product`** — deux propriétés ajoutées, `ratingAvg?: number` et
  `ratingCount: number`.

## Volumétrie

Une ligne de commande livrée au plus donne un avis. À l'échelle actuelle la
table reste très petite ; l'index composite sur `(product_id, is_hidden,
createdAt DESC)` suffit largement et rien ne justifie de partitionner.
