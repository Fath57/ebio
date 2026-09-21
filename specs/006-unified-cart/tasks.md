# Tasks: Panier unifié multi-boutiques avec dispatch serveur

**Feature**: 006-unified-cart · **Branch**: `006-unified-cart` · **Date**: 2026-09-21
**Input**: [spec.md](./spec.md) · [plan.md](./plan.md) · [research.md](./research.md) · [data-model.md](./data-model.md) · [contracts/](./contracts/)

## Format: `[ID] [P?] [Story] Description`

- **[P]** : parallélisable — fichiers distincts, aucune dépendance sur une tâche inachevée
- **[US1] / [US2] / [US3]** : rattachement au parcours de la spec
- Chaque tâche nomme son fichier. Les chemins sont relatifs à la racine du dépôt.

## Path Conventions

Monorepo existant. API dans `apps/api/src`, app mobile dans `apps/mobile/src`.
Aucun nouveau paquet.

## À propos des tests

La spec ne demande pas de TDD. Les tâches de test listées ici ne sont donc pas
une démarche nouvelle : ce sont les suites **déjà présentes** que ce chantier
casse mécaniquement (`delivery-fee.spec.ts`, `dispatch.service.spec.ts`), plus
des tests sur les deux fonctions pures où une erreur coûte de l'argent — le
calcul de la tournée et la répartition. Le reste est vérifié par le quickstart.

---

## Phase 1 : Setup (infrastructure partagée)

- [ ] T001 Créer la migration `apps/api/src/modules/db/migrations/` pour les tables `checkouts` et `delivery_runs`, avec les colonnes décrites dans data-model.md
- [ ] T002 Ajouter dans la même migration les colonnes de rattachement `payments.checkout_id` et `deliveries.delivery_run_id`, toutes deux nullables, avec leurs index
- [ ] T003 Générer le SQL équivalent dans `apps/api/scripts/2026-XX-XX-unified-cart.sql` pour application en production avant bascule du conteneur, le registre `mikro_orm_migrations` de prod ne supportant pas `migration:up` sans `--only`

**Checkpoint** : la base accepte les deux tables et les deux colonnes ; l'application existante tourne sans les voir.

---

## Phase 2 : Foundational (bloquant pour tous les parcours)

**⚠️ À terminer avant toute tâche de parcours.**

- [ ] T004 [P] Créer l'entité `apps/api/src/modules/payments/entities/checkout.entity.ts` avec ses champs, son enum de statut et sa relation 1→N vers `Payment`
- [ ] T005 [P] Créer l'entité `apps/api/src/modules/deliveries/entities/delivery-run.entity.ts` avec ses champs, son enum de statut, `pickup_order` en jsonb et sa relation 1→N vers `Delivery`
- [ ] T006 Ajouter `checkout` (ManyToOne nullable) à `apps/api/src/modules/payments/payment.entity.ts` sans toucher au `@OneToOne(Order, { owner: true })` existant
- [ ] T007 Ajouter `deliveryRun` (ManyToOne nullable) à `apps/api/src/modules/deliveries/entities/delivery.entity.ts` sans toucher au `@OneToOne(Order, { unique: true })` existant
- [ ] T008 [P] Écrire les contrats Zod du checkout dans `apps/api/src/modules/orders/contracts/` : entrée de l'aperçu multi-boutiques, entrée de création, réponses, conformément à `contracts/checkout.md`
- [ ] T009 [P] Écrire les contrats Zod de la tournée dans `apps/api/src/modules/deliveries/contracts/`, conformément à `contracts/delivery-run.md`
- [ ] T010 Écrire `computeRunDistance` dans `apps/api/src/common/delivery-fee.ts` : somme des tronçons collecte → collecte, puis dernière collecte → adresse de livraison
- [ ] T011 Adapter `computeDeliveryFee` pour être alimentée par la distance de tournée, en conservant les motifs existants et le caractère **non bloquant** de `NO_SHOP_POSITION`
- [ ] T012 Mettre à jour `apps/api/src/common/delivery-fee.spec.ts` : la distance passée est désormais celle d'une tournée, et `NO_SHOP_POSITION` doit rester tarifé au forfait

**Checkpoint** : les entités existent, les contrats compilent, le tarif sait raisonner en tournée. Aucun comportement visible n'a changé.

---

## Phase 3 : User Story 1 — Un panier, un paiement (P1) 🎯 MVP

**Objectif** : l'acheteur compose un panier chez plusieurs boutiques, paie une fois, et N commandes sont créées puis payées.

**Test d'indépendance** : commander chez deux boutiques en une opération ; vérifier deux commandes distinctes côté vendeurs et chaque portefeuille boutique crédité de sa part, commission déduite. Les livraisons restent séparées à ce stade — c'est un MVP valide.

### Tests

- [ ] T013 [P] [US1] Tester la répartition d'un checkout entre N commandes dans `apps/api/src/modules/payments/checkout-split.spec.ts` : somme des parts égale au total, réduction répartie au prorata, arrondis sans perte de centime

### API

- [ ] T014 [US1] Élargir `POST /api/orders/preview` dans `apps/api/src/modules/orders/orders.controller.ts` pour accepter un panier multi-boutiques, sans `supplierId`
- [ ] T015 [US1] Adapter `priceBasket` dans `apps/api/src/modules/orders/orders.service.ts` pour chiffrer plusieurs boutiques en un appel et renvoyer un bloc par boutique
- [ ] T016 [US1] Appliquer le code promo au panier entier et répartir sa charge au prorata entre boutiques, dans `apps/api/src/modules/orders/orders.service.ts`
- [ ] T017 [US1] Évaluer le seuil de livraison gratuite sur le total du panier, et non boutique par boutique, dans `apps/api/src/common/delivery-fee.ts`
- [ ] T018 [US1] Écrire `createCheckout` dans `apps/api/src/modules/orders/orders.service.ts` : création du checkout et des N commandes dans **une seule transaction**
- [ ] T019 [US1] Déplacer le contrôle du plafond espèces du niveau commande au niveau checkout, et renvoyer le dépassement chiffré (`cashLimitExceededBy`)
- [ ] T020 [US1] Rattacher chaque `Payment` créé à son checkout dans `apps/api/src/modules/payments/payments.service.ts`, en laissant l'escrow intact
- [ ] T021 [US1] Adapter `apps/api/src/modules/payments/payments-webhook.controller.ts` pour retrouver les N commandes depuis la transaction unique du prestataire
- [ ] T022 [US1] Vérifier que `escrow-scheduler.service.ts` libère toujours commande par commande, et le documenter par un commentaire — c'est le comportement voulu, pas un oubli

### Mobile

- [ ] T023 [US1] Aplatir `CartState` dans `apps/mobile/src/features/cart/cart-context.tsx` : liste d'articles portant `supplierId` et `supplierName`, `deliveryMode` remonté au panier
- [ ] T024 [US1] Écrire l'hydratation de compatibilité depuis la clé `ebio_cart` dans le même fichier : ancien format aplati, `DELIVERY` retenu si les modes divergent
- [ ] T025 [US1] Refondre `apps/mobile/src/features/cart/components/cart-screen.tsx` : une seule liste, la boutique indiquée sur chaque ligne, un seul total, un seul bouton
- [ ] T026 [US1] Rendre `apps/mobile/src/features/cart/components/checkout-flow.tsx` multi-boutiques : une adresse, un paiement, un récapitulatif par boutique à l'affichage
- [ ] T027 [US1] Afficher le message de dépassement du plafond espèces (montant en cause, deux issues) dans `checkout-flow.tsx`
- [ ] T028 [US1] Nommer la boutique bloquante quand une seule empêche la validation, dans `checkout-flow.tsx`

**Checkpoint** : un panier à trois boutiques part en un paiement. Livrable et démontrable seul.

---

## Phase 4 : User Story 2 — Une seule livraison pour plusieurs boutiques (P2)

**Objectif** : un frais unique, une tournée, un livreur, une remise.

**Test d'indépendance** : panier chez deux boutiques proches ; un seul frais annoncé avant paiement, une seule proposition diffusée, un livreur qui voit ses points de collecte ordonnés puis le point de remise.

### Tests

- [ ] T029 [P] [US2] Mettre à jour `apps/api/src/modules/deliveries/dispatch.service.spec.ts` : l'unité de diffusion devient la tournée, l'éligibilité s'évalue depuis le premier point de collecte

### API — tournée et diffusion

- [ ] T030 [US2] Créer la tournée à la création du checkout en mode `DELIVERY`, dans `apps/api/src/modules/orders/orders.service.ts`, en n'en créant aucune en `ON_SITE`
- [ ] T031 [US2] Calculer l'ordre de passage et le stocker dans `pickup_order`, dans `apps/api/src/modules/deliveries/deliveries.service.ts`
- [ ] T032 [US2] Porter `findEligibleCouriers` et `rankCandidates` de `dispatch.service.ts` au niveau tournée, en prenant le premier point de collecte comme origine
- [ ] T033 [US2] Porter `startDispatch`, `offerNext`, `respondToOffer` et `cancelPendingOffer` au niveau tournée, en conservant la bascule ciblé → diffusion large
- [ ] T034 [US2] Adapter le cron `@Cron('*/30 * * * * *')` et `expireOffers` pour traiter des tournées
- [ ] T035 [US2] Écrire `GET /api/couriers/me/runs/offered` et `POST /api/couriers/me/runs/:id/respond` dans `apps/api/src/modules/deliveries/couriers.controller.ts`, l'acceptation portant sur toute la tournée
- [ ] T036 [US2] Écrire `POST /api/deliveries/:id/collect` : seule la commande de cette boutique passe en « récupérée » ; la tournée passe en `DELIVERING` à la dernière collecte
- [ ] T037 [US2] Écrire `POST /api/runs/:id/deliver` : un seul code, toutes les commandes de la tournée passent en « livrée », encaissement espèces sur le total
- [ ] T038 [US2] Définir et implémenter la rémunération d'une tournée dans `apps/api/src/modules/deliveries/deliveries.service.ts` — **la formule n'est définie ni par la spec ni par l'existant, elle doit être arbitrée avant cette tâche**
- [ ] T039 [US2] Renseigner `shop_count`, `total_distance_km` et `offers_sent` à chaque étape, et `outcome` à l'issue (FR-020a)

### Mobile — acheteur et livreur

- [ ] T040 [P] [US2] Afficher le frais de livraison unique avant paiement dans `apps/mobile/src/features/cart/components/checkout-flow.tsx`
- [ ] T041 [P] [US2] Afficher la progression d'une tournée comme une progression unique dans `apps/mobile/src/features/orders/`
- [ ] T042 [US2] Présenter la tournée au livreur dans `apps/mobile/src/features/courier/` : points de collecte ordonnés, point de remise, une seule décision
- [ ] T043 [US2] Gérer la collecte boutique par boutique puis la remise unique dans `apps/mobile/src/features/courier/`

**Checkpoint** : un frais, une tournée, une remise.

---

## Phase 5 : User Story 3 — Une boutique défaille, l'acheteuse n'est pas lésée (P3)

**Objectif** : refus, annulation ou absence de livreur ne laissent jamais l'acheteur sans recours ni sans son argent.

**Test d'indépendance** : faire refuser une commande sur trois ; le portefeuille est crédité du montant de cette commande seule, les autres suivent leur cours, et rejouer le dédommagement ne crédite pas deux fois.

### Tests

- [ ] T044 [P] [US3] Tester l'idempotence du dédommagement dans `apps/api/src/modules/payments/compensation.spec.ts` : deux appels pour la même commande ne produisent qu'un crédit

### API

- [ ] T045 [US3] Écrire `POST /api/checkouts/:id/compensate` dans `apps/api/src/modules/payments/payments.controller.ts`
- [ ] T046 [US3] Créditer le portefeuille acheteur en `WalletTransactionType.REFUND` du montant exact de la commande, dans `apps/api/src/modules/payments/payments.service.ts`
- [ ] T047 [US3] Rendre le dédommagement idempotent par commande, de sorte qu'un rejeu ne crédite pas deux fois
- [ ] T048 [US3] Recalculer le frais de tournée après retrait d'une boutique et créditer l'écart s'il y a lieu
- [ ] T049 [US3] Faire évoluer le statut du checkout vers `PARTIALLY_REFUNDED`, puis `REFUNDED` quand plus aucune commande ne survit
- [ ] T050 [US3] Déclencher l'alerte back-office à 15 minutes sans preneur (`escalated_at`) et la rendre visible dans l'écran d'attribution manuelle existant
- [ ] T051 [US3] Rendre la décision à l'acheteur à 30 minutes (`buyer_prompted_at`) et écrire `POST /api/runs/:id/buyer-decision`
- [ ] T052 [US3] Sur `CANCEL`, créditer l'intégralité du montant frais compris et prévenir les boutiques concernées
- [ ] T053 [US3] Poursuivre la tournée quand une boutique annule alors que la collecte a commencé ailleurs, en ne créditant que la part annulée

### Mobile

- [ ] T054 [P] [US3] Informer l'acheteur du crédit porté à son portefeuille, avec le motif, dans `apps/mobile/src/features/orders/`
- [ ] T055 [US3] Proposer « attendre ou annuler » à l'acheteur quand aucun livreur n'a pris la tournée, l'annulation restant ouverte tant que rien n'est collecté

**Checkpoint** : aucun chemin ne laisse l'acheteur sans argent ni sans réponse.

---

## Phase 6 : Polish & transverse

- [ ] T056 [P] Vérifier la non-régression du panier mono-boutique : même nombre d'étapes ou moins qu'avant (FR-024), c'est le cas le plus fréquent
- [ ] T057 [P] Vérifier que l'app fournisseur n'a besoin d'aucune modification (FR-023) — même écran de commandes, mêmes statuts
- [ ] T058 [P] Contrôler la conformité au design system sur les écrans panier et caisse : cibles 44×44, contrastes AA, montants en JetBrains Mono, vocabulaire de marque
- [ ] T059 Dérouler intégralement `quickstart.md` sur appareil, y compris les quatre cas limites
- [ ] T060 `pnpm lint` à 0 erreur, typecheck API propre, `pnpm --filter=@boilerstone/api test` au vert
- [ ] T061 Documenter la procédure de déploiement dans `specs/006-unified-cart/quickstart.md` : SQL appliqué avant la bascule, puis `migration:up --only`

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup) ──> Phase 2 (Foundational) ──┬──> Phase 3 (US1) ──> Phase 4 (US2) ──> Phase 5 (US3)
                                             │
                                             └── rien ne démarre avant la fin de la phase 2
```

### User Story Dependencies

- **US1** ne dépend d'aucun autre parcours. C'est le MVP.
- **US2** dépend de US1 : la tournée naît du checkout.
- **US3** dépend de US1 (le dédommagement suppose un paiement unique) et, pour
  ses tâches T050 à T053, de US2 (elles portent sur la tournée).

### Within Each User Story

Contrats → entités → service → endpoint → mobile. Les tâches mobiles d'un
parcours peuvent démarrer dès que ses endpoints répondent.

### Parallel Opportunities

- T004 et T005 : deux entités, deux fichiers.
- T008 et T009 : deux jeux de contrats.
- T040 et T041 : deux écrans mobiles distincts.
- T056, T057, T058 : trois vérifications indépendantes.

---

## Parallel Example: Phase 2

```
# Les deux entités et les deux jeux de contrats, ensemble :
T004  entities/checkout.entity.ts
T005  entities/delivery-run.entity.ts
T008  orders/contracts/
T009  deliveries/contracts/
```

---

## Implementation Strategy

### MVP d'abord (US1 seul)

Phases 1, 2 et 3. À l'arrivée : un panier, un paiement, N commandes, livraisons
séparées comme aujourd'hui. **C'est déjà l'essentiel du gain** — la friction
décrite était le passage en caisse répété, pas le nombre de livraisons. Cette
étape est déployable et mesurable seule (SC-001 à SC-004).

### Livraison incrémentale

1. US1 → mise en service, mesure de SC-003 et SC-004.
2. US2 → le frais unique et la livraison unique, qui demandent la refonte du
   dispatch. C'est le morceau le plus lourd et le plus risqué.
3. US3 → le filet. À faire avant toute exposition large de US1 en production,
   même si sa priorité nominale est P3 : sans lui, le paiement unique transfère
   le risque sur l'acheteur.

### Arbitrages à rendre avant de coder

- **T038, rémunération d'une tournée** : aucune formule n'existe. Bloquant pour
  US2.
- **T050** : l'alerte back-office se branche sur l'attribution manuelle
  existante ; vérifier qu'elle sait traiter une tournée et pas seulement une
  course.

---

## Notes

- Le risque assumé de FR-020 — aucune limite de regroupement — n'a pas de tâche
  de contrôle, par construction. Il a une tâche de **mesure** (T039), qui est le
  seul moyen de poser ces limites plus tard sur des faits.
- Aucune tâche ne touche `Order`, ni les écrans fournisseur. Si une tâche en
  vient à l'exiger, c'est que l'architecture a dérivé et qu'il faut y revenir.
