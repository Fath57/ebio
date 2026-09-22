---

description: "Découpage exécutable — avis et notes par produit"
---

# Tasks: Avis et notes par produit

**Input**: `/specs/007-product-reviews/` — plan.md, spec.md, research.md, data-model.md, contracts/
**Branch**: `007-product-reviews`

## Format: `[ID] [P?] [Story] Description`

- **[P]** : parallélisable — fichier distinct, aucune dépendance en attente.
- **[Story]** : l'histoire utilisateur servie (US1 à US4).

**Tests** : la spec ne réclame pas de TDD, mais ce dépôt tient 208 tests et
trois règles de cette fonctionnalité ne se vérifient pas à l'œil — l'éligibilité,
le seuil de trois avis et la pondération sur 90 jours. Elles ont leurs tâches de
test ; le reste se vérifie par le quickstart.

---

## Phase 1 — Mise en place

- [ ] T001 Ajouter la valeur `PRODUCT_REVIEW` à l'énumération `ReportTargetType` dans `apps/api/src/modules/admin/entities/content-report.entity.ts`
- [ ] T002 Créer la migration MikroORM (`cd apps/api && ../../node_modules/.bin/mikro-orm migration:create`) : table `product_reviews`, colonnes `rating_avg` et `rating_count` sur `products`, index selon `data-model.md` — chaque `ADD CONSTRAINT` précédé de son `DROP CONSTRAINT IF EXISTS`
- [ ] T003 Écrire `apps/api/scripts/2026-XX-XX-product-reviews.sql`, équivalent de T002 pour la production, et le rejouer **deux fois** sur une base jetable pour prouver son idempotence
- [ ] T004 Appliquer la migration en local et vérifier le schéma obtenu (colonnes, index, contrainte d'unicité sur `order_item_id`, CHECK `rating BETWEEN 1 AND 5`)

---

## Phase 2 — Socle (bloquant pour toutes les histoires)

- [ ] T005 Créer l'entité `ProductReview` dans `apps/api/src/modules/ratings/entities/product-review.entity.ts` — `orderItem` en `@OneToOne` unique, `product`, `buyer`, `rating`, `comment`, `isHidden`, `createdAt`
- [ ] T006 [P] Ajouter `ratingAvg?: number` et `ratingCount: number` à `apps/api/src/modules/products/entities/product.entity.ts`
- [ ] T007 [P] Créer les schémas Zod dans `apps/api/src/modules/ratings/contracts/product-review.contract.ts` — dépôt groupé, réponse paginée, résumé avec répartition, signalement
- [ ] T008 Créer `apps/api/src/modules/ratings/product-reviews.service.ts` avec `recalculateProductRating(productId)` : moyenne pondérée ×2 sur 90 jours, `rating_avg` laissé à NULL sous trois avis visibles, en SQL brut sur le modèle de `recalculateRating()` de `ratings.service.ts`
- [ ] T009 Déclarer entité, service et contrôleur dans `apps/api/src/modules/ratings/ratings.module.ts`

---

## Phase 3 — US1 : déposer un avis (P1) 🎯 MVP

**Objectif** : l'acheteur note les produits reçus depuis le parcours existant.
**Test indépendant** : commander, faire livrer, noter un produit sur deux,
vérifier en base que seul le produit noté a un avis, rattaché à la bonne ligne.

### API

- [ ] T010 [US1] Implémenter `listRateableItems(orderId, buyerId)` dans `product-reviews.service.ts` — lignes de la commande livrée, avec l'avis déjà déposé s'il existe ; liste vide si la commande n'est pas `DELIVERED`
- [ ] T011 [US1] Implémenter `createMany(orderId, buyerId, reviews)` — vérifier l'appartenance de la commande à l'acheteur, le statut `DELIVERED`, l'appartenance de chaque `orderItemId` à cette commande ; ignorer (sans échouer) une ligne déjà notée et la compter dans `skipped`
- [ ] T012 [US1] Appeler `FraudDetectionService.detectMultipleAccounts(buyerId)` au dépôt, comme le fait `ratings.service.ts` — le résultat est journalisé, il ne bloque rien
- [ ] T013 [US1] Déclencher `recalculateProductRating()` pour chaque produit touché à la fin d'un dépôt
- [ ] T014 [US1] Créer `apps/api/src/modules/ratings/product-reviews.controller.ts` avec `GET /api/orders/:orderId/rateable-products` et `POST /api/orders/:orderId/product-reviews`, tous deux sous `AuthGuard`, corps validé par `@TypedBody`

### Tests API

- [ ] T015 [P] [US1] Test : un dépôt sur une commande non livrée est refusé, et un dépôt sur la commande d'un autre acheteur aussi — `apps/api/src/modules/ratings/product-reviews.service.spec.ts`
- [ ] T016 [P] [US1] Test : deux dépôts successifs sur la même ligne donnent `created: 1, skipped: 1` et une seule ligne en base
- [ ] T017 [P] [US1] Test : un commentaire sans note est refusé ; une note sans commentaire est acceptée

### Mobile

- [ ] T018 [US1] Créer `apps/mobile/src/features/ratings/components/product-rating-step.tsx` — une ligne par produit, cinq étoiles de 44×44 px minimum, `accessibilityLabel` par étoile (« Noter 3 sur 5 »), champ commentaire n'apparaissant **que** sur la ligne dont une étoile a été touchée
- [ ] T019 [US1] Afficher en lecture seule les notes déjà déposées dans `product-rating-step.tsx` (scénario 4 de US1)
- [ ] T020 [US1] Ajouter l'étape `'products'` au `type Step` de `apps/mobile/src/features/ratings/components/rate-order-flow.tsx`, placée après `'tip'`, sautée si `rateable-products` renvoie une liste vide
- [ ] T021 [US1] Envoyer tous les avis de l'étape en **un seul** appel, et permettre de valider sans avoir noté quoi que ce soit (FR-006)

---

## Phase 4 — US2 : lire la note sur la fiche (P1)

**Objectif** : la fiche produit montre la note du produit, et plus celle de la boutique.
**Test indépendant** : ouvrir une fiche ayant reçu des avis, vérifier que la note
affichée est celle du produit et qu'aucune note de fournisseur n'y figure.

### API

- [ ] T022 [US2] Ajouter `ratingAvg` et `ratingCount` à `ProductResponse` dans `apps/api/src/modules/products/contracts/product.contract.ts`
- [ ] T023 [US2] Les renseigner dans `ProductMapper.toResponse` **et** `toSummary` (`apps/api/src/modules/products/products.mapper.ts`) — les cartes de résultat doivent pouvoir afficher la note
- [ ] T024 [US2] Ajouter les deux champs à `searchResultSchema` (`apps/api/src/modules/search/contracts/search.contract.ts`) et les sélectionner dans la requête SQL de `search.service.ts`
- [ ] T025 [US2] Implémenter `getProductReviews(productId, page, limit)` dans `product-reviews.service.ts` — résumé (moyenne, nombre, répartition sur cinq niveaux) et page d'avis triés `createdAt DESC`, les avis masqués exclus du tout
- [ ] T026 [US2] Exposer `GET /api/products/:id/reviews` en `@Public` dans `product-reviews.controller.ts`

### Tests API

- [ ] T027 [P] [US2] Test : deux avis laissent `average` à `null` et `count` à 2 ; le troisième fait apparaître la moyenne (FR-010)
- [ ] T028 [P] [US2] Test : un avis de plus de 90 jours pèse moitié moins qu'un avis récent dans la moyenne (FR-016)

### Mobile

- [ ] T029 [US2] Créer `apps/mobile/src/features/catalog/components/product-reviews-section.tsx` — moyenne, répartition en cinq barres, deux ou trois avis les plus récents, et l'état vide « Soyez le premier à donner votre avis »
- [ ] T030 [US2] Ne demander les textes d'avis qu'à l'entrée de la section dans l'écran (FR-014), jamais au chargement de la fiche
- [ ] T031 [US2] Afficher la ligne compacte « ★ 4,6 (23 avis) » près du prix dans `apps/mobile/src/features/catalog/components/product-detail-screen.tsx`, masquée tant que `ratingAvg` est nul
- [ ] T032 [US2] **Retirer** l'affichage de `supplier.rating` et `supplier.reviewCount` de `product-detail-screen.tsx` (FR-009) — les champs restent dans `ProductDetailSupplier` pour la section « D'autres produits du fournisseur »
- [ ] T033 [P] [US2] Formater la note à la française — « 4,6 », virgule décimale — et les dates en relatif (« il y a 2 h », « hier »), jamais d'ISO à l'écran

---

## Phase 5 — US3 : consulter tous les avis (P2)

**Objectif** : un écran paginé listant tous les avis d'un produit.
**Test indépendant** : sur un produit dépassant une page, descendre et vérifier
qu'aucun avis n'est dupliqué ni omis.

- [ ] T034 [US3] Paramétrer `apps/mobile/src/features/ratings/components/reviews-list.tsx` par cible — `{ target: 'product' | 'supplier', id }` au lieu de `supplierId` — sans dupliquer le composant
- [ ] T035 [US3] Mettre à jour l'appelant existant de `ReviewsList` sur la fiche fournisseur pour la nouvelle signature
- [ ] T036 [US3] Enregistrer l'écran des avis produit dans la pile `Accueil` de `apps/mobile/src/app/navigation.tsx` et le relier au « Voir les N avis » de `product-reviews-section.tsx`
- [ ] T037 [US3] Vérifier que le retour depuis cet écran ramène bien à la fiche produit — piège déjà rencontré sur la pile Chat, où une navigation imbriquée sans `initial: false` rendait l'écran précédent inatteignable

---

## Phase 6 — US4 : signaler et modérer (P3)

**Objectif** : un avis abusif peut être signalé, puis masqué.
**Test indépendant** : signaler depuis l'app, masquer depuis le back-office,
vérifier que l'avis a quitté la liste et que la moyenne a été recalculée.

> `POST /reviews/:id/report` retourne aujourd'hui `{ reported: true }` sans rien
> écrire (research §7). Cette phase construit le signalement, elle ne l'étend pas.

- [ ] T038 [US4] Implémenter `reportReview(reviewId, reporterId, reason)` dans `product-reviews.service.ts` — crée une ligne `content_reports` de type `PRODUCT_REVIEW`, statut `PENDING`, l'avis restant visible
- [ ] T039 [US4] Exposer `POST /api/product-reviews/:id/report` sous `AuthGuard` + `CaslGuard` dans `product-reviews.controller.ts`
- [ ] T040 [US4] Implémenter `setVisibility(reviewId, hidden)` — bascule `is_hidden`, recalcule l'agrégat du produit, résout le signalement associé
- [ ] T041 [US4] Exposer `GET /api/admin/content-reports?status=PENDING` et `PATCH /api/admin/product-reviews/:id/visibility`, réservés à `ADMIN` et `SUPER_ADMIN`
- [ ] T042 [P] [US4] Test : masquer un avis le retire de la liste publique **et** de la moyenne (FR-020)
- [ ] T043 [US4] Créer l'écran de modération dans `apps/web-spa/app/features/moderation/` — file des signalements, lecture de l'avis, masquer ou rejeter, via le SDK OpenAPI généré
- [ ] T044 [US4] Ajouter l'action « Signaler » sur un avis dans `reviews-list.tsx`

---

## Phase 7 — Finitions et non-régression

- [ ] T045 Basculer `buildOrderClause('rating')` de `s.global_rating` vers `p.rating_avg DESC NULLS LAST, distance ASC` dans `apps/api/src/modules/search/search.service.ts`
- [ ] T046 Vérifier ce que devient la section « Validé eBio » de l'accueil après T045 : elle appelle `sortBy=rating` et mettra en avant des produits bien notés au lieu de boutiques bien notées — constater le changement et le signaler avant mise en production
- [ ] T047 [P] Vérifier SC-007 : relever `suppliers.global_rating` avant et après, aucune moyenne de fournisseur ne doit avoir bougé
- [ ] T048 [P] Vérifier que `POST /api/reviews` et `GET /api/suppliers/:id/reviews` sont intacts, et que la fiche fournisseur affiche toujours ses avis (FR-022)
- [ ] T049 [P] Vérifier que l'application fournisseur n'est pas affectée (FR-023)
- [ ] T050 Générer le SDK OpenAPI (`pnpm generate`) pour que le back-office dispose des nouveaux types
- [ ] T051 Passer le quickstart en entier sur un téléphone : parcours de notation, fiche produit, écran des avis
- [ ] T052 `cd apps/api && npx vitest run` — les 208 tests existants doivent passer, plus les nouveaux
- [ ] T053 `./node_modules/.bin/eslint apps/api apps/mobile/src apps/web-spa/app` — zéro erreur, les avertissements sont tolérés
- [ ] T054 Relire les commentaires de code ajoutés : **en anglais**, y compris entités, migrations et tests ; les chaînes affichées restent en français, accents compris

---

## Dépendances

```
Phase 1 (T001-T004)
   └─► Phase 2 (T005-T009)          socle, bloque tout
          ├─► US1 (T010-T021)       MVP livrable seul
          ├─► US2 (T022-T033)       lecture — n'a besoin que du socle
          ├─► US3 (T034-T037)       s'appuie sur l'endpoint de T025/T026
          └─► US4 (T038-T044)       indépendante des trois autres
                 └─► Phase 7 (T045-T054)
```

- **US1 et US2 sont indépendantes** malgré leur priorité commune : les avis
  peuvent s'accumuler avant d'être affichés, et l'affichage se teste sur des
  avis insérés à la main.
- **US3 dépend de T025/T026** (l'endpoint de lecture), pas du reste d'US2.
- **T045 est volontairement en phase 7** : il change un comportement visible
  au-delà de cette fonctionnalité, et ne doit pas partir avec le MVP.

## Exécution en parallèle

Après la phase 2, trois chantiers avancent de front :

- **API** : T010 → T014, puis T022 → T026
- **Mobile** : T018 → T021, puis T029 → T033
- **Tests** : T015, T016, T017, T027, T028 — fichiers distincts, tous `[P]`

Dans la phase 7, T047, T048 et T049 sont trois vérifications indépendantes.

## Stratégie de livraison

1. **MVP** = phases 1, 2 et 3. Les avis se déposent et s'accumulent. Rien ne les
   affiche encore, et c'est un état déployable : aucune régression visible.
2. **Première valeur pour l'acheteur** = phase 4. La note apparaît sur la fiche.
   C'est là que FR-009 retire la note de boutique — le changement le plus visible
   de toute la fonctionnalité.
3. **Confort** = phase 5.
4. **Exploitation** = phase 6, qui peut suivre à distance : aucun avis abusif ne
   peut exister avant que des avis existent.
