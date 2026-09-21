# Implementation Plan: Panier unifié multi-boutiques avec dispatch serveur

**Branch**: `006-unified-cart` | **Date**: 2026-09-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-unified-cart/spec.md`

## Summary

Supprimer le découpage du panier par boutique côté acheteur, et déplacer la
répartition dans la plateforme : un panier, un passage en caisse, un paiement,
une livraison.

**L'approche tient en une phrase** : deux entités de regroupement, et aucune
modification des entités par commande.

Le code actuel impose deux 1-1 stricts sur `Order` — `Payment` en est le
propriétaire (`@OneToOne(Order, { owner: true })`) et `Delivery` aussi
(`@OneToOne(Order, { unique: true })`). Plutôt que de les casser, ce qui
rejaillirait sur l'escrow, les reçus, les webhooks, le suivi fournisseur et les
écrans livreur, on ajoute au-dessus :

- un **Checkout**, qui porte l'unique transaction du prestataire et regroupe
  les `Payment` des commandes qu'il couvre ;
- une **DeliveryRun** (tournée), qui regroupe les `Delivery` confiées à un même
  livreur.

Les commandes, paiements et livraisons gardent leur forme, leur cycle de vie et
leurs contrats. L'app fournisseur ne bouge pas, ce que la spec exige (FR-023).

## Technical Context

**Language/Version**: TypeScript strict, Node.js 24.13.0 (API) ; React Native
0.81.5 / Expo SDK 54, React 19.1 (mobile)
**Primary Dependencies**: NestJS, MikroORM 6 (PostgreSQL + PostGIS), Zod +
nzoth (`@TypedBody`), `@nestjs/schedule` (crons de diffusion), FedaPay
(passerelle Mobile Money), firebase-admin (FCM)
**Storage**: PostgreSQL. Deux tables nouvelles (`checkouts`, `delivery_runs`),
deux colonnes de rattachement (`payments.checkout_id`,
`deliveries.delivery_run_id`), aucune colonne supprimée
**Testing**: Vitest côté API (157 tests aujourd'hui, dont
`delivery-fee.spec.ts` et `dispatch.service.spec.ts` directement concernés)
**Target Platform**: API Node sur Dokku ; apps Android (client, fournisseur,
livreur)
**Project Type**: Monorepo — API NestJS + applications mobiles + back-office web
**Performance Goals**: aperçu du panier sous 1 s pour 5 boutiques ; diffusion
d'une tournée déclenchée dans les 30 s suivant le paiement (cadence du cron
existant)
**Constraints**: le Mobile Money ne sait ni geler des fonds ni les rendre
partiellement — le dédommagement passe par le portefeuille eBio (FR-011) ; la
migration doit préserver les paniers en cours et l'historique des commandes
**Scale/Scope**: environ 25 exigences, 2 entités, 4 modules API touchés
(`orders`, `payments`, `deliveries`, `wallet`), l'app client et l'app livreur

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principe | Statut | Remarque |
|---|---|---|
| I. Design System Compliance | ✅ | Écrans panier et caisse redessinés avec les tokens existants ; aucune couleur ni graisse nouvelle |
| II. Brand Consistency | ✅ | Vocabulaire « Fournisseur », « Acheteur », « Commander » ; montants en JetBrains Mono au format `X XXX FCFA` |
| III. Monorepo Architecture | ✅ | Tout reste dans `apps/api` et `apps/mobile` ; aucun nouveau paquet |
| IV. Accessibility First | ✅ | Cibles 44×44, libellés visibles, l'état d'une boutique bloquante ne repose pas sur la seule couleur |
| V. TypeScript Strict | ⚠️ | Voir Complexity Tracking : le mobile appelle l'API en `fetch` brut, pas par le SDK généré |
| VI. Token-Based Styling | ✅ | `theme.ts` côté mobile, aucune valeur en dur |

**Gate** : franchi, avec une dérogation existante documentée ci-dessous et une
seconde portant sur l'emplacement des specs.

## Project Structure

### Documentation (this feature)

```text
specs/006-unified-cart/
├── plan.md              # Ce fichier
├── research.md          # Phase 0 — décisions d'architecture et alternatives écartées
├── data-model.md        # Phase 1 — entités, colonnes, transitions, migration
├── quickstart.md        # Phase 1 — comment lancer et vérifier la fonctionnalité
├── contracts/           # Phase 1 — contrats d'API
│   ├── checkout.md
│   └── delivery-run.md
├── checklists/
│   └── requirements.md  # Qualité de la spec (issu de /speckit.specify)
└── tasks.md             # Phase 2 — produit par /speckit.tasks, pas ici
```

### Source Code (repository root)

```text
apps/api/src/
├── common/
│   └── delivery-fee.ts                  # tarif d'une tournée, plus d'une course seule
├── modules/
│   ├── orders/
│   │   ├── orders.service.ts            # createOrder → createCheckout, N commandes
│   │   ├── orders.controller.ts         # POST /orders/preview et POST /orders élargis
│   │   └── contracts/
│   ├── payments/
│   │   ├── entities/checkout.entity.ts  # NOUVEAU — transaction unique, N paiements
│   │   ├── payment.entity.ts            # + rattachement au checkout
│   │   ├── payments.service.ts          # ventilation, dédommagement au portefeuille
│   │   ├── escrow-scheduler.service.ts  # inchangé : il raisonne déjà par commande
│   │   └── payments-webhook.controller.ts
│   ├── deliveries/
│   │   ├── entities/delivery-run.entity.ts  # NOUVEAU — tournée
│   │   ├── entities/delivery.entity.ts      # + rattachement à la tournée
│   │   ├── dispatch.service.ts              # diffusion au niveau tournée
│   │   ├── deliveries.service.ts            # collecte par boutique, remise groupée
│   │   └── couriers.controller.ts           # accepter/refuser une tournée
│   ├── wallet/                          # crédit de dédommagement acheteur
│   └── db/migrations/                   # checkouts, delivery_runs, colonnes
└── ...

apps/mobile/src/
├── features/cart/
│   ├── cart-context.tsx                 # état à plat, plus de groupes par boutique
│   ├── components/cart-screen.tsx       # une liste, un total, un bouton
│   └── components/checkout-flow.tsx     # multi-boutiques, une adresse, un paiement
├── features/orders/                     # suivi d'une tournée côté acheteur
└── features/courier/                    # acceptation et exécution d'une tournée
```

**Structure Decision** — monorepo existant, aucune nouvelle application. Les
deux entités nouvelles vivent dans les modules qu'elles regroupent
(`payments`, `deliveries`) plutôt que dans un module « checkout » transversal :
elles n'ont de sens que là, et un module de plus séparerait artificiellement le
paiement de son escrow et la tournée de sa diffusion.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **V. TypeScript Strict** — le mobile appellera les nouveaux endpoints en `fetch` brut (`apiFetch`), pas via le SDK OpenAPI généré | Dérogation préexistante à tout ce travail : `apps/mobile` vit hors du workspace pnpm (npm + `legacy-peer-deps`) et ne consomme pas `@boilerstone/openapi-generator`. L'aligner ici mêlerait une migration d'outillage à un chantier fonctionnel | Générer le SDK pour le mobile est souhaitable mais c'est un chantier propre, à mener sur l'ensemble des appels — pas sur les trois de cette fonctionnalité, ce qui laisserait le code à deux régimes |
| **Emplacement des specs** — `specs/006-unified-cart/` au lieu de `docs/features/<nom>/` imposé par la constitution | Les cinq specs précédentes (001 à 005) sont dans `specs/`, créées par l'outillage speckit qui impose ce chemin | Déplacer briserait l'outillage et l'historique. La constitution mériterait d'être amendée pour refléter la pratique établie, ce qui relève de sa procédure d'amendement, pas de ce plan |
| **Deux entités de regroupement** au lieu d'une commande parente | La commande parente a été explicitement écartée par le porteur du produit (spec, décision COMMANDES). Le regroupement doit donc exister deux fois, une par agrégat | Une entité unique « commande groupée » portant paiement et livraison réintroduirait exactement la commande parente refusée, et imposerait de toucher tous les écrans fournisseur |
