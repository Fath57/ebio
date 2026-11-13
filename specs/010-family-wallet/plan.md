# Implementation Plan: Module diaspora — Portefeuille famille

**Branch**: `010-family-wallet` | **Date**: 2026-11-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/010-family-wallet/spec.md`

## Summary

Un payeur a un portefeuille famille ; ses proches en deviennent membres et
paient leurs courses avec, dans la limite de leurs plafonds.

Le solde n'est pas une nouveauté technique : c'est **une ligne de `wallets`**
avec un nouveau propriétaire. Il hérite ainsi du verrou qui empêche tout solde
négatif, de l'historique, de la recharge INTRAM et des pages Argent du
back-office. Ce qui est neuf :

- **les membres** (une table), rattachés à un compte vérifié par SMS ou en attente ;
- **les limites** : par défaut sur le portefeuille, propres sur un membre ;
  vérifiées dans la transaction du paiement, après le verrou, donc exactes même
  quand plusieurs membres paient en même temps ;
- **un moyen de paiement** `FAMILY_WALLET` au passage en caisse, qui couvre toute
  la commande ou n'est pas proposé ;
- **le routage des remboursements** : le checkout garde le membre qui a payé.

## Technical Context

**Language/Version**: TypeScript strict, Node.js 24.13.0 (API, back-office) ; React Native 0.81.5 / Expo SDK 54, React 19.1 (mobile)
**Primary Dependencies**: NestJS, MikroORM 6, Zod + nzoth (`@TypedBody`), Better Auth, CASL, `@nestjs/schedule` (API) ; React Navigation 7, `expo-contacts` (déjà ajouté en 009) (mobile) ; React 19 + SDK OpenAPI généré (back-office). Aucune dépendance nouvelle.
**Storage**: PostgreSQL — tables `family_wallets`, `family_wallet_members` ; colonnes `wallets.family_wallet_id`, `wallet_transactions.family_member_id`, `checkouts.family_member_id` ; `saved_relatives` à adresse facultative
**Testing**: Vitest ; e2e sur PostGIS réel via testcontainers
**Target Platform**: Android et iOS (app Client), API Linux sous dokku, back-office web
**Project Type**: mobile + API + back-office
**Performance Goals**: crédit d'une recharge visible par les membres < 1 min (SC-002) ; notification d'achat au payeur < 1 min (SC-003) ; l'aperçu du passage en caisse calcule les portefeuilles famille sans requête par ligne de panier
**Constraints**: aucun solde négatif ni dépassement de limite sous paiements simultanés (SC-004) ; argent jamais retiré en espèces ; payeur souvent à l'étranger (pas de SMS, devise d'affichage)
**Scale/Scope**: 6 user stories ; ~6 écrans mobiles créés (portefeuille, membres, ajout, limites, historique, vue membre), passage en caisse touché ; 1 page back-office créée, 2 touchées

## Constitution Check

*GATE : à passer avant la phase 0, revérifié après la phase 1.*

| Principe | Verdict | Comment il est tenu |
|---|---|---|
| **I. Design System** | ✅ | Écrans bâtis sur les composants existants (`ScreenHeader`, cartes, puces, `PaymentWebView`) ; aucune couleur nouvelle. |
| **II. Brand Consistency** | ⚠️ | Montants en devise : même écart que 009, déjà justifié (FCFA toujours affiché à côté). « Portefeuille famille », « proche », « membre » sont des mots courants, pas des rôles nouveaux. Vouvoiement, accents. |
| **III. Monorepo** | ⚠️ | Le mobile appelle l'API à la main (écart existant, consigné en 007). |
| **IV. Accessibility** | ✅ | Limites saisies avec labels visibles ; statut des membres en texte + icône ; jauge de dépense doublée d'un texte (« 12 500 / 40 000 FCFA »). |
| **V. TypeScript Strict** | ✅ | Contrats Zod ; calcul des limites en fonctions pures typées. |
| **VI. Token-Based Styling** | ✅ | `theme.ts` et jetons `ebio-*`. |

**Après la phase 1** : aucune dépendance nouvelle, aucun écart supplémentaire.

## Project Structure

### Documentation

```text
specs/010-family-wallet/
├── plan.md  ├── spec.md  ├── research.md  ├── data-model.md  ├── quickstart.md
├── contracts/family-wallet.md
├── checklists/requirements.md
└── tasks.md            # /speckit.tasks
```

### Source Code

```text
apps/api/src/modules/
├── family-wallet/                         # CRÉÉ
│   ├── family-wallet.module.ts
│   ├── entities/family-wallet.entity.ts
│   ├── entities/family-wallet-member.entity.ts
│   ├── contracts/family-wallet.contract.ts
│   ├── family-limits.ts                   # fonctions pures : limites effectives, refus
│   ├── family-wallets.service.ts          # ouvrir, défauts, suspendre, fermer, solde, historique
│   ├── family-members.service.ts          # ajouter, limites propres, suspendre, retirer, rattacher
│   ├── family-payment.service.ts          # options au passage en caisse, débit, cible de remboursement
│   ├── family-funding.service.ts          # recharge (cible topup), virement depuis le personnel
│   ├── family-notifier.service.ts         # SMS d'invitation, push, solde bas
│   ├── family-pending.scheduler.ts        # rappel des 30 jours
│   ├── family-wallet.controller.ts        # /family-wallet (payeur)
│   ├── family-member-view.controller.ts   # /family-wallets/mine (membre)
│   └── admin-family-wallets.controller.ts
├── wallet/entities/wallet.entity.ts               # + familyWallet
├── wallet/entities/wallet-transaction.entity.ts   # + familyMember, 4 types
├── wallet/wallet.service.ts                       # WalletOwner.familyWalletId
├── wallet/topup.service.ts                        # cible 'family'
├── wallet/admin-wallets.service.ts                # type FAMILY
├── orders/checkout.service.ts                     # FAMILY_WALLET, aperçu familyWallets
├── payments/compensation.service.ts               # cible de remboursement
├── deliveries/deliveries.service.ts               # idem (frais de tournée)
├── auth/otp-auth.service.ts                       # rattacher les membres en attente
├── users/account-deletion.service.ts              # FAMILY_WALLET_OPEN
├── relatives/…                                    # adresse facultative
├── notifications/…                                # 6 types
└── db/migrations/Migration2026111…ts

apps/mobile/src/features/
├── family-wallet/                         # CRÉÉ
│   ├── family-wallet-api.ts
│   ├── components/family-wallet-screen.tsx        # solde, membres, recharger, historique
│   ├── components/add-family-member-screen.tsx    # carnet ou nouveau (contacts)
│   ├── components/family-limits-screen.tsx        # défauts et limites propres
│   ├── components/family-history-screen.tsx
│   └── components/member-wallets-section.tsx      # vue membre (dans le portefeuille personnel)
├── cart/components/checkout-flow.tsx      # option « Portefeuille famille (Awa) »
├── wallet/components/wallet-screen.tsx    # section « Portefeuilles famille » côté membre
└── profile/components/profile-screen.tsx  # entrée « Portefeuille famille »

apps/web-spa/app/features/admin/
├── family-wallets/pages/{admin-family-wallets-page,admin-family-wallet-detail-page}.tsx  # CRÉÉ
└── wallets/pages/admin-wallets-page.tsx   # type « Famille »
```

**Structure Decision** : un module API `family-wallet` par responsabilité
(portefeuille, membres, paiement, financement, notifications), branché sur
l'existant par appels directs, comme 009. Le module `wallet` ne reçoit que de
quoi reconnaître un nouveau propriétaire.

### Ordre conseillé

1. Migration + entités + `family-limits.ts` (testé seul).
2. US1 : ouvrir, ajouter, recharger (API + mobile payeur).
3. US2 + US3 : paiement et limites au passage en caisse (API + mobile membre) — le cœur.
4. US4 : suivi.
5. US5 + US6 : contrôle, invitation, rattachement.
6. Back-office, suppression de compte.

## Risques

| Risque | Parade |
|---|---|
| Statut réglementaire (BCEAO) des fonds pour compte de tiers | Validation juridique **avant** l'ouverture en production ; le module peut être livré désactivé (réglage plateforme `family_wallet_enabled`, faux par défaut) |
| Un membre vide le solde au détriment des autres | Limites par défaut proposées dès l'ouverture ; alerte de solde bas |
| Dépassement de plafond sous paiements simultanés | Contrôle dans la transaction, après le verrou du portefeuille ; test e2e dédié |
| Remboursement vers le mauvais portefeuille | `checkouts.family_member_id` + un seul point de décision `refundTargetWallet` ; tests par cas (ouvert / fermé) |
| Membre rattaché au mauvais compte | Rattachement uniquement par numéro vérifié par SMS, comme « Paniers reçus » |

## Complexity Tracking

| Écart | Pourquoi | Alternative plus simple écartée parce que |
|---|---|---|
| **II** — montants en devise | Le payeur est à l'étranger (déjà justifié en 009) | Le FCFA reste toujours affiché à côté |
| **III** — mobile sans SDK généré | Écart existant de l'app mobile (007) | Hors périmètre |
