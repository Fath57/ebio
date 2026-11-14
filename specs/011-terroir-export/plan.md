# Implementation Plan: Module diaspora — Terroir vers l'étranger

**Branch**: `011-terroir-export` | **Date**: 2026-11-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/011-terroir-export/spec.md`

## Summary

Un client en France ou en Belgique achète des produits exportables et des packs ;
eBio collecte auprès des boutiques, emballe, pèse et confie un **colis** au
départ d'une **agence partenaire** dont les dates et le prix au kilo sont tenus
à jour au back-office.

Trois choix structurent le module (research §1–§4) :

- **Mode de retrait `EXPORT`** : les commandes terroir ne touchent jamais la
  diffusion aux livreurs locaux, sans garde à semer dans le code.
- **Le colis porte le transport** (et l'assurance, le domicile) ; les commandes
  des boutiques ont un frais de livraison nul — sinon il serait versé à la
  boutique. Ces montants vont sur un compte plateforme `EXPORT`.
- **La boutique est payée à la collecte** : sa commande passe livrée à ce
  moment, avec un versement immédiat. Le client ne voit jamais ce statut : il
  suit le colis, étape par étape.

Le passage en caisse terroir est un service à part, multi-boutiques, qui
réutilise la création de commandes, le paiement et le gel de devise existants.
Tout est derrière l'interrupteur `terroir_export_enabled`.

## Technical Context

**Language/Version**: TypeScript strict, Node.js 24.13.0 (API, back-office) ; React Native 0.81.5 / Expo SDK 54, React 19.1 (apps Client et Fournisseur)
**Primary Dependencies**: NestJS, MikroORM 6, Zod + nzoth, Better Auth, CASL, `@nestjs/schedule` (API) ; React Navigation 7 (mobile) ; React 19 + SDK OpenAPI (back-office). Aucune dépendance nouvelle.
**Storage**: PostgreSQL — 10 tables (`export_profiles`, `export_packs`, `export_pack_items`, `export_agencies`, `export_pickup_points`, `export_departures`, `export_departure_rates`, `export_departure_alerts`, `export_checkout_drafts`, `export_shipments`, `export_shipment_events`) ; valeurs ajoutées à `PickupMode`, `PlatformAccount`, types de mouvements et de notifications
**Testing**: Vitest ; e2e sur PostGIS via testcontainers
**Target Platform**: apps Client et Fournisseur (Android, iOS), API sous dokku, back-office web
**Project Type**: mobile + API + back-office
**Performance Goals**: aperçu du passage en caisse < 1 s (départs, poids, prix calculés en mémoire) ; une étape appliquée à tout un départ en une requête (SC-005)
**Constraints**: aucun dépassement de capacité d'un départ sous paiements simultanés (SC-008) ; transport jamais crédité à une boutique ; montants encaissés en FCFA, affichés en euros ; produits frais et d'origine animale exclus
**Scale/Scope**: 10 user stories ; app Client ~6 écrans (espace Terroir, fiche, panier, paiement, colis, suivi), app Fournisseur 2 (profil d'export, packs), back-office 6 pages (validation, packs eBio, agences, départs, détail d'un départ, colis)

## Constitution Check

*GATE : à passer avant la phase 0, revérifié après la phase 1.*

| Principe | Verdict | Comment il est tenu |
|---|---|---|
| **I. Design System** | ✅ | Composants existants ; badge « Terroir validé eBio » en jetons vert/terre ; jauge de remplissage doublée d'un texte. |
| **II. Brand Consistency** | ⚠️ | Prix en euros pour le client à l'étranger (écart déjà justifié en 009) ; FCFA toujours visibles. Vocabulaire : Fournisseur, Acheteur. |
| **III. Monorepo** | ⚠️ | Mobile sans SDK généré (écart existant, 007). |
| **IV. Accessibility** | ✅ | Étapes du suivi en texte + icône ; photos d'origine avec `alt` en français. |
| **V. TypeScript Strict** | ✅ | Contrats Zod ; calculs (poids, prix, capacité, complément, packs) en fonctions pures testées. |
| **VI. Token-Based Styling** | ✅ | `theme.ts` et jetons `ebio-*`. |

**Après la phase 1** : aucun écart supplémentaire.

## Project Structure

### Documentation

```text
specs/011-terroir-export/
├── plan.md  ├── spec.md  ├── research.md  ├── data-model.md  ├── quickstart.md
├── contracts/terroir-export.md
├── checklists/requirements.md
└── tasks.md            # /speckit.tasks
```

### Source Code

```text
apps/api/src/modules/terroir/                 # CRÉÉ
├── terroir.module.ts
├── entities/…                                # 11 entités (data-model §1–§3)
├── contracts/terroir.contract.ts
├── terroir-math.ts                           # poids, prix, marge, assurance, départs, remplissage, complément, packs
├── export-catalog.service.ts                 # profils d'export, packs, validation, catalogue client
├── export-logistics.service.ts               # agences, points de retrait, départs, tarifs, remplissage, annulation
├── terroir-checkout.service.ts               # aperçu, création (multi-boutiques), verrou de capacité
├── export-shipments.service.ts               # collecte, manquants, pesée, complément, étapes, remise, perte
├── terroir-notifier.service.ts               # notifications client, destinataire offert, alertes, équipe
├── terroir.scheduler.ts                      # rappels 48 h, retrait 14 j, complément sans réponse 48 h
├── terroir-client.controller.ts              # /terroir/*
├── supplier-export.controller.ts             # /suppliers/:id/products/:id/export, /export-packs
├── admin-export.controller.ts                # /admin/export/*
└── tests/…
apps/api/src/modules/
├── orders/…                                  # PickupMode.EXPORT ; confirm-delivery refusé
├── payments/escrow-release-policy.ts         # délai 0 pour EXPORT
├── payments/payments.service.ts              # confirmation d'un checkout terroir → compte EXPORT
├── wallet/…                                  # PlatformAccount.EXPORT, 4 types de mouvements
├── settings/…                                # 8 réglages
├── notifications/…                           # 6 types
└── db/migrations/Migration2026111…ts

apps/mobile/src/features/terroir/             # CRÉÉ (app Client)
├── terroir-api.ts
├── terroir-cart-context.tsx                  # panier séparé (ebio_terroir_cart)
├── components/terroir-home-screen.tsx        # pays, bandeau du prochain départ, alerte, catalogue
├── components/terroir-product-screen.tsx     # origine, badge, packs
├── components/terroir-cart-screen.tsx        # optimisation du poids
├── components/terroir-checkout-screen.tsx    # départs, réception, assurance, cadeau, paiement
├── components/shipment-screen.tsx            # suivi, complément de poids
└── components/shipments-list.tsx
apps/mobile/src/features/supplier-dashboard/  # app Fournisseur
├── components/export-profile-form.tsx
└── components/export-packs-screen.tsx

apps/web-spa/app/features/admin/terroir/      # CRÉÉ
├── pages/export-reviews-page.tsx             # validation par liste de contrôle
├── pages/export-packs-page.tsx
├── pages/export-agencies-page.tsx
├── pages/export-departures-page.tsx
├── pages/export-departure-detail-page.tsx    # remplissage, collecte, pesée, étapes, liste imprimable
└── pages/export-shipment-page.tsx
apps/landing/app/routes/colis.tsx             # suivi public d'un colis offert (sans prix)
```

**Structure Decision** : un module API `terroir` découpé par responsabilité
(catalogue, logistique, passage en caisse, colis, notifications), branché sur
l'existant par trois points précis : le mode de retrait, la politique de
séquestre et le compte plateforme.

### Ordre conseillé

1. Fondations : migration, interrupteur, réglages, `terroir-math.ts` testé.
2. **US2** agences et départs (back-office) — tout le reste en dépend.
3. **US3** produits exportables, validation, packs (Fournisseur + back-office).
4. **US1** catalogue, passage en caisse, colis, suivi client — le premier livrable.
5. **US4–US5** collecte, versement, pesée, étapes, liste du départ.
6. **US7–US10** calendrier, poids optimisé, origine, colis offert.
7. **US6** livraison à domicile, assurance, remplissage, finitions.

## Risques

| Risque | Parade |
|---|---|
| Agences sans tarif « dédouanement compris » | Seules les agences qui l'acceptent sont saisies (spec FR-014) ; à négocier avant l'ouverture |
| Perte d'un colis déjà payé aux boutiques | Compte `EXPORT` + assurance optionnelle suivie à part ; accords d'indemnisation avec les agences |
| Conformité UE d'un produit | Liste de contrôle obligatoire, conservée avec la preuve ; catégories interdites |
| Dépassement de capacité sous commandes simultanées | Verrou sur le départ dans la transaction de paiement ; test e2e |
| Transport versé par erreur à une boutique | `deliveryFee = 0` sur toute commande `EXPORT` ; test qui vérifie la part boutique |
| Prix au kilo périmé | Prix figé au paiement ; départ fermé dès qu'il n'est plus à jour |

## Complexity Tracking

| Écart | Pourquoi | Alternative plus simple écartée parce que |
|---|---|---|
| **II** — prix en euros | Client à l'étranger (justifié en 009) | FCFA toujours affichés |
| **III** — mobile sans SDK généré | Écart existant (007) | Hors périmètre |
