# Phase 1 — Mise en route et vérification

Comment travailler sur cette fonctionnalité, et comment prouver qu'elle marche.

## Le décor local

```bash
# API — tourne depuis dist/, pas en watch fiable
cd apps/api && pnpm build && node --enable-source-maps dist/main

# Mobile — hors du workspace pnpm, commandes lancées depuis apps/mobile
cd apps/mobile && ./node_modules/.bin/expo start --dev-client
adb reverse tcp:8081 tcp:8081 && adb reverse tcp:3010 tcp:3010
```

Le port de l'API locale est celui d'`API_PORT` dans `apps/api/.env` (3010
aujourd'hui, pas 3000).

## Migration

```bash
cd apps/api
../../node_modules/.bin/mikro-orm migration:create
npx dotenvx run --quiet -- ../../node_modules/.bin/mikro-orm migration:up --only Migration<horodatage>
```

`--only` attend une liste **séparée par des virgules**, pas par des espaces.

Écrire en parallèle `apps/api/scripts/<date>-product-reviews.sql`, équivalent de
la migration, et le rejouer **deux fois** sur une base jetable avant de le
considérer bon. Toute contrainte ajoutée doit être précédée d'un `DROP
CONSTRAINT IF EXISTS`, sans quoi le `migration:up` qui suit le script en
production échoue sur « constraint already exists ».

## Fabriquer un jeu d'essai

Un avis exige une commande livrée. Le chemin le plus court :

```sql
-- une ligne de commande livrée appartenant à un acheteur connu
SELECT oi.id AS order_item_id, oi.product_id, o.buyer_id, p.name
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
JOIN products p ON p.id = oi.product_id
WHERE o.status = 'DELIVERED'
LIMIT 5;
```

S'il n'y en a aucune, passer une commande dans l'application et forcer son
statut plutôt que d'insérer une commande à la main : les entités liées
(paiement, livraison, tournée) sont nombreuses et une commande incomplète fait
échouer la lecture.

Pour vérifier le seuil, il faut **trois** avis sur un même produit, issus de
trois lignes de commande distinctes. En dessous, `rating_avg` doit rester `NULL`
— c'est le test, pas un bug.

## Ce qu'il faut prouver

Par ordre d'importance, chacun vérifiable indépendamment :

| # | Vérification | Comment |
|---|---|---|
| 1 | Un avis exige une commande livrée | déposer sur une commande `PENDING` → refus |
| 2 | Un avis par ligne de commande | déposer deux fois → `created: 1, skipped: 1`, une seule ligne en base |
| 3 | Le seuil de 3 | 2 avis → `average: null` ; le 3ᵉ → moyenne affichée |
| 4 | La pondération 90 jours | un avis daté d'il y a 100 jours pèse moitié moins qu'un récent |
| 5 | Masquer recalcule | masquer un avis → il quitte la liste **et** la moyenne bouge |
| 6 | La boutique a disparu de la fiche | ouvrir une fiche produit → aucune note de fournisseur |
| 7 | La note part avec la fiche | `GET /api/products/:id` contient `ratingAvg` sans appel supplémentaire |
| 8 | Les textes n'arrivent qu'à la section | observer le réseau : aucun appel `/reviews` avant d'atteindre la bande |
| 9 | Le tri par note | `sortBy=rating` classe sur le produit, les non notés en dernier |
| 10 | Les notes de boutique n'ont pas bougé | relever `suppliers.global_rating` avant et après (SC-007) |

## Tests automatisés

```bash
cd apps/api && npx vitest run          # 208 tests aujourd'hui, aucun ne doit tomber
cd apps/mobile && npx eslint src       # 0 erreur ; les warnings sont tolérés
```

Les e2e tournent sur un vrai PostGIS via testcontainers (`postgis/postgis:16-3.4`).
Un flux qui ouvre sa propre transaction a besoin de `poolMax` > 1 dans
`initializeTestApp`, sans quoi il attend 60 s et échoue.

## Sur le téléphone

Le parcours complet demande une commande livrée sur le compte connecté. Pour
l'étape de notation :

1. Commandes → une commande livrée → « Noter »
2. Boutique, puis livreur, puis **la nouvelle étape produits**
3. Toucher une étoile → le champ de commentaire doit apparaître **sur cette
   ligne seulement**
4. Valider, rouvrir : les notes déjà déposées s'affichent et ne sont pas
   modifiables

Puis ouvrir la fiche du produit noté et vérifier les points 6, 7 et 8 ci-dessus.

## Pièges connus de ce dépôt

- Éditer un fichier en plusieurs passes fait compiler à Metro des états JSX
  invalides et **fait crasher l'application**. Vérifier la fin de la sortie Metro
  avant de conclure à un vrai bug.
- Lancer ESLint via `./node_modules/.bin/eslint` depuis la racine ; depuis
  `apps/mobile`, `npx` attrape un eslint global qui ne trouve pas la config flat.
- Les commentaires de code sont **en anglais**, y compris sur les entités, les
  migrations et les tests. Les chaînes affichées restent en français, accents
  compris.
