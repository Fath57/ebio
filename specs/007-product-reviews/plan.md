# Implementation Plan: Avis et notes par produit

**Branch**: `007-product-reviews` | **Date**: 2026-09-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-product-reviews/spec.md`

## Summary

Un avis par **ligne de commande livrée** : une note de 1 à 5, un commentaire
facultatif, et l'unicité garantie par la base plutôt que par du code. La moyenne
pondérée et le nombre d'avis sont dénormalisés sur `products`, comme
`suppliers.global_rating` l'est déjà, pour que la fiche les emporte sans attente
propre et que le tri de recherche s'y appuie sans jointure.

Côté mobile, rien de neuf dans la navigation : une étape s'ajoute à la machine à
états de `rate-order-flow.tsx`, et `ReviewsList` est paramétré par cible au lieu
d'être dupliqué. La note de la boutique quitte la fiche produit.

Le module `ratings` existant accueille le tout — même domaine, même service de
fraude, même modération.

## Technical Context

**Language/Version**: TypeScript strict, Node.js 24.13.0 (API) ; React Native 0.81.5 / Expo SDK 54, React 19.1 (mobile)
**Primary Dependencies**: NestJS, MikroORM 6, Zod + nzoth (`@TypedBody`), Better Auth, CASL (API) ; React Navigation 7 (mobile) ; React 19 + SDK OpenAPI généré (back-office)
**Storage**: PostgreSQL — une table `product_reviews`, deux colonnes sur `products`
**Testing**: Vitest ; e2e sur PostGIS réel via testcontainers (`postgis/postgis:16-3.4`)
**Target Platform**: Android (client), API Linux sous dokku
**Project Type**: mobile + API + back-office
**Performance Goals**: l'ouverture d'une fiche produit ne coûte aucune requête de plus qu'aujourd'hui ; les textes d'avis n'arrivent qu'à l'entrée de leur section
**Constraints**: réseau mobile béninois — c'est la contrainte dimensionnante, elle justifie la dénormalisation et le dépôt groupé en un appel
**Scale/Scope**: au plus un avis par ligne de commande livrée ; 3 écrans mobiles touchés, 1 écran back-office créé

## Constitution Check

*GATE : à passer avant la phase 0, revérifié après la phase 1.*

| Principe | Verdict | Comment il est tenu |
|---|---|---|
| **I. Design System** | ✅ | Étoiles en `colors.earth[400]`, déjà le jeton des notes ailleurs dans l'app. Barres de répartition, bandes et pastilles reprennent les jetons `spacing`, `radius`, `typography`. Aucune couleur nouvelle. |
| **II. Brand Consistency** | ✅ | Vocabulaire : **Acheteur**, **Fournisseur**, **Fiche boutique**. Dates en relatif (« il y a 2 h », « hier »), jamais d'ISO à l'écran. Note écrite « 4,6 », virgule décimale française. Vouvoiement. |
| **III. Monorepo** | ⚠️ | Voir Complexity Tracking : le mobile n'utilise pas le SDK OpenAPI. |
| **IV. Accessibility** | ✅ | Étoiles tactiles à 44×44 px minimum. Chaque étoile porte un `accessibilityLabel` (« Noter 3 sur 5 »), et la note n'est jamais portée par la seule couleur — le chiffre accompagne toujours les étoiles. Champ commentaire avec label visible, pas un simple placeholder. |
| **V. TypeScript Strict** | ✅ | Aucun `any`. Contrats Zod validés à l'exécution via `@TypedBody`. Entité MikroORM typée de bout en bout. |
| **VI. Token-Based Styling** | ✅ | Tout depuis `theme.ts`. Aucune valeur en dur — un point de vigilance réel, la répartition en barres invitant à écrire des largeurs en pixels. |

**Vérification après conception (phase 1)** : les contrats, le modèle de données
et le quickstart n'introduisent aucune technologie hors de la pile déclarée, ni
aucun écart supplémentaire. Le seul écart reste celui consigné ci-dessous.

## Project Structure

### Documentation (this feature)

```text
specs/007-product-reviews/
├── plan.md              # Ce fichier
├── spec.md
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── product-reviews.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 — produit par /speckit.tasks
```

### Source Code (repository root)

```text
apps/api/src/modules/
├── ratings/
│   ├── entities/product-review.entity.ts        # créé
│   ├── contracts/product-review.contract.ts     # créé — schémas Zod
│   ├── product-reviews.service.ts               # créé — dépôt, lecture, agrégat
│   ├── product-reviews.controller.ts            # créé
│   ├── ratings.module.ts                        # modifié — déclarations
│   └── fraud-detection.service.ts               # inchangé, appelé
├── products/
│   ├── entities/product.entity.ts               # modifié — ratingAvg, ratingCount
│   ├── contracts/product.contract.ts            # modifié — deux champs
│   └── products.mapper.ts                       # modifié — toResponse + toSummary
├── search/
│   ├── search.service.ts                        # modifié — buildOrderClause
│   └── contracts/search.contract.ts             # modifié — searchResultSchema
├── admin/
│   └── entities/content-report.entity.ts        # modifié — PRODUCT_REVIEW
└── db/migrations/Migration<horodatage>.ts       # créé

apps/api/scripts/<date>-product-reviews.sql      # créé — équivalent production

apps/mobile/src/features/
├── ratings/components/
│   ├── rate-order-flow.tsx                      # modifié — étape 'products'
│   ├── product-rating-step.tsx                  # créé
│   └── reviews-list.tsx                         # modifié — paramétré par cible
└── catalog/components/
    ├── product-detail-screen.tsx                # modifié — note produit, boutique retirée
    └── product-reviews-section.tsx              # créé — moyenne, répartition, derniers avis

apps/web-spa/app/features/moderation/            # créé — file des signalements
```

**Structure Decision** : mobile + API + back-office, la répartition déjà en
vigueur dans ce dépôt. Les avis produits rejoignent le module `ratings` plutôt
que d'ouvrir un module : c'est le même domaine métier, le même service de
fraude et la même modération. Un module séparé aurait dupliqué la règle de
pondération, qui est le cœur de la cohérence entre note de boutique et note de
produit.

## Ordre de livraison

Chaque tranche est déployable et vérifiable seule.

1. **US1 — déposer** (P1) : migration, entité, contrats, service, dépôt groupé,
   éligibilité, agrégat, étape mobile. Les avis s'accumulent même si rien ne les
   affiche encore.
2. **US2 — lire sur la fiche** (P1) : champs sur le produit et la recherche,
   endpoint de lecture, bande « Avis », retrait de la note de boutique.
3. **US3 — tout consulter** (P2) : `ReviewsList` paramétré, écran dédié.
4. **US4 — modérer** (P3) : type `PRODUCT_REVIEW`, signalement **réellement**
   écrit, endpoints admin, écran back-office.

US4 est la plus chère par rapport à ce que la spec laisse croire : le
signalement d'avis n'existe pas aujourd'hui, il retourne `{ reported: true }`
sans rien écrire (research §7). Elle construit, elle n'étend pas.

## Complexity Tracking

| Violation | Pourquoi nécessaire | Alternative plus simple, et pourquoi écartée |
|---|---|---|
| **Principe III** — l'app mobile appelle l'API par `apiFetch`, pas par le SDK OpenAPI généré | `apps/mobile` est **exclu du workspace pnpm** (`'!apps/mobile'` dans `pnpm-workspace.yaml`) et géré à part avec npm. Il ne peut pas dépendre de `packages/openapi-generator`. C'est un écart préexistant à toute l'application, pas introduit ici. | Faire entrer le mobile dans le workspace : cela casserait la chaîne de build EAS, qui lance `npm ci` dans `apps/mobile`. Hors de portée d'une fonctionnalité d'avis. |
| **`product_id` dupliqué** sur `product_reviews` alors que `order_item_id` permettrait de le retrouver | Lister les avis d'un produit est le chemin le plus chaud ; sans cette colonne, chaque page impose une jointure sur `order_items`. | Jointure à la lecture : contredit la contrainte réseau qui justifie toute la conception. |
| **Agrégat dénormalisé** sur `products` | FR-013 (aucune attente propre) et FR-017 (tri SQL par note) l'exigent tous deux. `suppliers` fait déjà ainsi. | Calcul à la lecture : imposerait une jointure agrégée à chaque recherche, et ferait tomber SC-003. |

## Risques

- **Le tri « Validé eBio » change de sens.** La section de l'accueil appelle
  `sortBy=rating` ; elle mettra en avant des produits bien notés au lieu de
  boutiques bien notées. Cohérent, mais visible — à annoncer.
- **Un produit sans avis n'affiche plus rien** là où il montrait la note de sa
  boutique (FR-009). Perte de signal assumée, déjà consignée dans la checklist
  de la spec.
- **La détection de fraude ne bloque rien.** `detectMultipleAccounts()`
  journalise un avertissement, c'est tout. FR-021 est satisfait en l'appelant ;
  écrire que la fonctionnalité est « protégée contre les faux avis » serait
  faux.
- **Migration en production** : script SQL joué avant la bascule du conteneur,
  puis `migration:up --only`. Toute contrainte ajoutée doit être précédée d'un
  `DROP CONSTRAINT IF EXISTS`, sans quoi l'enregistrement échoue — piège déjà
  rencontré sur `Migration20260921120000`.
