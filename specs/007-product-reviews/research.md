# Phase 0 — Recherche : avis et notes par produit

Tout ce qui suit a été lu dans le code, pas supposé. Les chemins sont donnés
pour que le plan et les tâches n'aient pas à re-chercher.

## 1. Le système d'avis existant

**Décision** : calquer le produit sur la boutique plutôt qu'inventer un second
mécanisme.
**Rationale** : les règles de la boutique sont déjà éprouvées en production et
l'acheteur les comprend. Deux systèmes de notation divergents sur un même écran
seraient incompréhensibles.

Ce qui existe (`apps/api/src/modules/ratings/`) :

| Élément | État |
|---|---|
| `reviews` | `buyer_id`, `supplier_id`, `order_id` (nullable), 4 notes `smallint`, `comment`, `createdAt` |
| Unicité | `@Unique({ properties: ['buyer', 'order'] })` — un avis par commande |
| Éligibilité | commande au statut `DELIVERED` obligatoire, **aucun délai limite** |
| Moyenne | pondérée, les 90 derniers jours comptent ×2 |
| Seuil | `globalRating` reste `null` tant que `total < 3` |
| Recalcul | `recalculateRating()`, en SQL brut, après chaque écriture |
| Badges | `TOP_SELLER` accordé à partir d'une note et d'un volume sur 90 jours |

La requête de moyenne à transposer, telle quelle dans le code actuel :

```sql
SUM(note * CASE WHEN "createdAt" >= NOW() - INTERVAL '90 days' THEN 2 ELSE 1 END)
  / NULLIF(SUM(CASE WHEN "createdAt" >= NOW() - INTERVAL '90 days' THEN 2 ELSE 1 END), 0)
```

**Alternatives écartées** : moyenne arithmétique simple (un produit saisonnier
resterait marqué par des avis d'il y a deux ans) ; note bayésienne lissée (plus
juste statistiquement, mais inexplicable à un acheteur et incohérente avec la
note de boutique affichée à côté sur la fiche fournisseur).

## 2. La preuve d'achat

**Décision** : `order_items.id` en clé unique de l'avis produit.
**Rationale** : `order_items` porte déjà `order_id`, `product_id`, `variant_id`,
`quantity`, `unit_price`. La ligne est le seul objet qui prouve à la fois *qui*,
*quoi* et *quelle livraison*. L'unicité devient une contrainte de base, pas un
contrôle applicatif contournable.

Conséquence assumée et conforme à la spec : le même produit commandé deux fois
donne deux lignes, donc deux avis. C'est voulu pour du frais.

**Alternative écartée** : unicité sur `(buyer_id, product_id)`. Elle empêche de
noter une seconde livraison du même produit, ce que la spec demande
explicitement, et elle oblige à vérifier l'achat par une jointure au lieu d'une
clé.

## 3. L'agrégat sur le produit

**Décision** : deux colonnes dénormalisées sur `products`, recalculées à
l'écriture.
**Rationale** : FR-013 exige que la note parte avec la fiche sans attente
propre, et FR-017 que le tri de recherche s'appuie dessus. Le tri se fait dans
une requête SQL brute (`search.service.ts`, `buildOrderClause`) : une moyenne
calculée à la lecture imposerait une jointure agrégée sur chaque recherche.

`suppliers` fait déjà exactement cela avec `global_rating` / `total_reviews`.

**Alternative écartée** : vue matérialisée rafraîchie périodiquement. Un avis
qui met dix minutes à apparaître sur sa propre fiche est un bug du point de vue
de celui qui vient de l'écrire.

## 4. Le tri par note de la recherche

**Décision** : `sortBy=rating` trie les produits sur `p.rating_avg DESC NULLS
LAST`, puis sur la distance.
**Rationale** : `buildOrderClause()` trie aujourd'hui sur `s.global_rating DESC
NULLS LAST, distance ASC`. `NULLS LAST` place déjà naturellement les produits
sans moyenne publiée après les autres, ce que demande FR-017 — aucune
construction supplémentaire.

**Point de vigilance** : ce tri sert aussi la section « Validé eBio » de
l'accueil, qui appelle `sortBy=rating&validatedOnly=true`. Le basculer sur la
note produit change ce que cette section met en avant : des produits bien notés
plutôt que des boutiques bien notées. C'est cohérent avec la fonctionnalité,
mais c'est un changement de comportement visible à signaler.

## 5. Le parcours de notation mobile

**Décision** : ajouter une étape `products` à la machine à états existante.
**Rationale** : `rate-order-flow.tsx` est déjà un `type Step = 'loading' |
'shop' | 'courier' | 'tip'` avec saut automatique des étapes déjà faites ou sans
objet. L'étape produit s'y insère sans nouvelle navigation, ce qu'exige FR-005.

L'ordre retenu — boutique, livreur, pourboire, **puis** produits — place la
partie la plus longue en dernier : l'abandon en cours de route coûte alors les
avis produits, pas la note du livreur qui conditionne sa rémunération.

**Alternative écartée** : un écran de notation distinct ouvert depuis la fiche
produit. Il faudrait vérifier l'éligibilité à l'affichage, gérer le cas « vous
n'avez pas acheté ceci », et ajouter une entrée de navigation — tout ce que la
spec exclut.

## 6. La liste d'avis mobile

**Décision** : paramétrer `ReviewsList` par cible plutôt que dupliquer.
**Rationale** : `apps/mobile/src/features/ratings/components/reviews-list.tsx`
fait déjà résumé + pagination + « charger plus ». Seule sa prop `supplierId` et
son URL sont câblées en dur. Le passer à `{ target: 'product' | 'supplier', id }`
est un changement local.

## 7. Le signalement d'un avis est un trompe-l'œil

**Constat, pas une décision** : `POST /reviews/:id/report`
(`ratings.controller.ts`) retourne `{ reported: true }` **sans rien écrire**.
Ses paramètres sont préfixés `_`, et un commentaire annonce ce qui reste à
faire. Signaler un avis de boutique ne produit donc aucun effet aujourd'hui.

En revanche l'infrastructure existe : `content_reports`
(`admin/entities/content-report.entity.ts`) porte déjà
`ReportTargetType.REVIEW` et les statuts `PENDING` / `RESOLVED` / `DISMISSED`.
`fraud-detection.service.ts` sait y insérer une ligne (`reportSuspiciousReview`)
en SQL brut.

**Conséquence sur le plan** : l'histoire US4 ne peut pas « étendre » le
signalement, elle doit le construire. Son coût est plus élevé que la spec ne le
laisse penser, ce qui conforte sa priorité P3. Le back-office n'a par ailleurs
aucun écran de modération : `apps/web-spa/app/features/` ne contient pas de
dossier dédié aux avis ou aux signalements.

## 8. Détection de fraude

**Décision** : appeler `detectMultipleAccounts()` au dépôt d'un avis produit,
comme pour la boutique.
**Rationale** : le service compare le `deviceId` de l'auteur à celui des autres
comptes et journalise un avertissement. Il ne bloque rien — c'est un signal pour
la modération, pas un garde-fou. FR-021 est donc satisfait en appelant le même
service ; prétendre qu'il « protège » serait faux.

## 9. Ce que la fiche produit affiche aujourd'hui

`product-detail-screen.tsx` affiche `supplier.rating` et `supplier.reviewCount`
(ligne ~531, icône `Star` en `colors.earth[400]`). FR-009 impose de les retirer.
`ProductDetailSupplier` garde ces champs pour la ligne « D'autres produits du
fournisseur », qui reste inchangée.

## 10. Migration et déploiement

**Décision** : une migration additive, plus un script SQL équivalent dans
`apps/api/scripts/`.
**Rationale** : le registre `mikro_orm_migrations` de production ne contient que
les migrations récentes ; `migration:up` sans `--only` échoue sur les anciennes.
La procédure établie est : jouer le SQL avant la bascule du conteneur, puis
`migration:up --only <liste séparée par des virgules>` pour enregistrer les noms.

**Piège à ne pas reproduire** : toute contrainte ajoutée doit être précédée d'un
`DROP CONSTRAINT IF EXISTS`, sinon le `migration:up` qui suit le script échoue
sur « constraint already exists ». C'est exactement ce qui a été corrigé sur la
migration `Migration20260921120000`.
