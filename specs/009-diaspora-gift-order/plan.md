# Implementation Plan: Module diaspora — Commander pour un proche

**Branch**: `009-diaspora-gift-order` | **Date**: 2026-11-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-diaspora-gift-order/spec.md`

## Summary

Une commande pour un proche est un **passage en caisse ordinaire** avec un
destinataire figé dessus. Le point du proche prend la place de l'adresse de
l'acheteur dans les colonnes qui existent déjà : devis, zone, diffusion et
tournées n'ont rien à apprendre. Ce qui change se concentre aux deux bouts :

- **Au paiement** : espèces refusées, montant en devise gelé sur `checkouts`,
  SMS d'annonce au proche avec un lien de suivi public.
- **À la remise** : code **et** photo **et** position exigés, photo envoyée au
  payeur par push et e-mail ; en cas d'échec, remboursement sur le portefeuille
  eBio moins les frais de livraison (un remboursement carte INTRAM ne peut être
  qu'intégral).

Autour : un carnet de proches (une table), une préférence de devise (taux BCE
quotidiens + marge réglable), l'inscription depuis l'étranger (détection par
le fuseau horaire, Google / Apple / e-mail), et une page de suivi publique dans
`apps/landing`.

Le code de remise n'existe qu'à la collecte : le proche reçoit donc deux SMS,
l'annonce au paiement et le code au départ du livreur. La spec a été corrigée
en ce sens (FR-008, FR-009).

## Technical Context

**Language/Version**: TypeScript strict, Node.js 24.13.0 (API, landing, back-office) ; React Native 0.81.5 / Expo SDK 54, React 19.1 (mobile)
**Primary Dependencies**: NestJS, MikroORM 6, Zod + nzoth (`@TypedBody`), Better Auth, CASL, `@nestjs/schedule` (API) ; React Navigation 7, `expo-location`, `expo-image-picker`, `expo-localization` (déjà installé, première utilisation) (mobile) ; React Router 7 SSR (landing) ; React 19 + SDK OpenAPI généré (back-office). **Aucune dépendance nouvelle.** Service externe : taux BCE via `api.frankfurter.dev` (gratuit, sans clé).
**Storage**: PostgreSQL + PostGIS — table `saved_relatives` ; colonnes sur `checkouts`, `deliveries`, `user` ; deux clés `platform_settings` ; médias de preuve dans le préfixe privé `delivery_proof/`
**Testing**: Vitest ; e2e sur PostGIS réel via testcontainers (`postgis/postgis:16-3.4`)
**Target Platform**: Android et iOS (acheteur, livreur), API Linux sous dokku, landing SSR, back-office web
**Project Type**: mobile + API + landing SSR + back-office
**Performance Goals**: SMS d'annonce < 2 min après la confirmation (SC-002) ; notification de remise < 1 min (SC-004) ; la page de suivi publique répond en < 1 s et se rafraîchit toutes les 15 s pendant la course
**Constraints**: réseau du livreur instable (preuve rejouée hors ligne avec son heure et sa position) ; payeur à l'étranger (pas de SMS, fuseaux différents) ; minimum carte INTRAM 1 000 FCFA ; remboursement carte INTRAM intégral seulement ; aucune donnée personnelle ni prix sur le lien public
**Scale/Scope**: 6 user stories ; ~8 écrans mobiles acheteur touchés + 1 créé (carnet), 1 écran livreur, 1 page landing créée, 3 pages back-office touchées ; 1 table, 4 migrations

## Constitution Check

*GATE : à passer avant la phase 0, revérifié après la phase 1.*

| Principe | Verdict | Comment il est tenu |
|---|---|---|
| **I. Design System** | ✅ | Carnet, choix « Me livrer / Livrer à un proche », bandeau de preuve : composants existants (cartes, `ScreenHeader`, boutons Primary/Secondary). Page landing sur `SiteHeader`/`SiteFooter`. Aucune couleur nouvelle. |
| **II. Brand Consistency** | ⚠️ | Voir Complexity Tracking : prix en devise. Vocabulaire : **Acheteur** dans l'interface ; « proche » est un mot courant, pas un rôle. SMS et e-mails en vouvoiement. Heures en « 10 h 42 », jamais d'ISO. |
| **III. Monorepo** | ⚠️ | Voir Complexity Tracking : le mobile n'utilise pas le SDK OpenAPI (écart déjà consigné en 007). Back-office et landing passent par l'API, le back-office par le SDK généré. |
| **IV. Accessibility** | ✅ | Champs du proche avec labels visibles. Photo de preuve avec texte alternatif (« Photo de la remise du panier à Afiavi, 10 h 42 »). Le statut « position éloignée » porte une icône et un texte, pas seulement une couleur. Lien « J'ai un numéro béninois » à 44 px de hauteur tactile. |
| **V. TypeScript Strict** | ✅ | Contrats Zod via `@TypedBody`, union discriminée étendue pour la preuve, JSON des taux validé Zod à la lecture et à l'écriture. Aucun `any`. |
| **VI. Token-Based Styling** | ✅ | Tout depuis `theme.ts` (mobile) et les jetons `ebio-*` (landing, back-office). |

**Vérification après conception (phase 1)** : les contrats, le modèle et le
quickstart n'introduisent aucune dépendance hors de la pile déclarée. Le service
de taux BCE est un appel HTTP sortant, comme Wirepick ou INTRAM. Les deux écarts
restent ceux consignés ci-dessous.

## Project Structure

### Documentation (this feature)

```text
specs/009-diaspora-gift-order/
├── plan.md              # Ce fichier
├── spec.md
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── diaspora.md      # Phase 1
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit.tasks)
```

### Source Code (repository root)

```text
apps/api/src/modules/
├── relatives/                         # CRÉÉ — carnet de proches
│   ├── relatives.module.ts
│   ├── relatives.controller.ts
│   ├── relatives.service.ts
│   ├── entities/saved-relative.entity.ts
│   └── contracts/relative.contract.ts
├── gift/                              # CRÉÉ — logique « pour un proche »
│   ├── gift.module.ts
│   ├── gift-notifier.service.ts       # SMS au proche, push/e-mail au payeur
│   ├── gift-tracking.controller.ts    # GET /gift-tracking/:token (@Public)
│   ├── gift-tracking.service.ts
│   ├── gift-failure.service.ts        # échec → remboursement moins frais
│   ├── gift-proof-purge.scheduler.ts  # purge des photos à 90 jours
│   └── received-orders.controller.ts  # GET /orders/received
├── currency/                          # CRÉÉ — taux et conversion
│   ├── currency.module.ts
│   ├── exchange-rates.service.ts      # lecture, conversion, gel
│   ├── exchange-rates.scheduler.ts    # cron quotidien BCE
│   ├── ecb-rates.client.ts
│   └── admin-exchange-rates.controller.ts
├── payments/entities/checkout.entity.ts      # + destinataire, jeton, devise
├── orders/checkout.service.ts                # proche, espèces, devise, compte vérifié
├── orders/contracts/checkout.contract.ts     # + recipient, displayCurrency
├── payments/payments.service.ts              # confirmCheckout → SMS d'annonce
├── payments/compensation.service.ts          # + retenue des frais de livraison
├── deliveries/entities/delivery.entity.ts    # + preuve CODE_AND_PHOTO, position
├── deliveries/contracts/delivery.contract.ts # + branche CODE_AND_PHOTO
├── deliveries/deliveries.service.ts          # complete/deliverRun/fail/collect
├── deliveries/deliveries.mapper.ts           # contact = proche
├── notifications/                            # + 2 types, imageUrl, garde SMS hors +229
├── email/templates/gift-delivered.ejs        # CRÉÉ
├── email/templates/gift-delivery-failed.ejs  # CRÉÉ
├── auth/…                                    # PHONE_NOT_SUPPORTED, phone_verified_at
├── users/…                                   # displayCurrency, phone E.164
├── ratings/…                                 # éligibilité du proche rattaché
├── settings/public-settings.controller.ts    # + currencies
└── db/migrations/Migration2026111…ts         # 4 migrations

apps/mobile/src/
├── features/common/currency-context.tsx       # CRÉÉ
├── features/common/hooks/use-money.ts         # CRÉÉ — formatMoney
├── features/common/utils/is-abroad.ts         # CRÉÉ — fuseau horaire
├── features/relatives/                        # CRÉÉ — carnet (liste, formulaire)
├── features/cart/components/checkout-flow.tsx # choix proche, devise, espèces masquées
├── features/cart/components/recipient-step.tsx  # CRÉÉ
├── features/orders/components/order-tracking.tsx  # bloc proche, code, renvoi SMS, preuve
├── features/orders/components/received-orders.tsx # CRÉÉ — « Paniers reçus »
├── features/courier/components/proof-screen.tsx   # code + photo + position
├── features/auth/components/{login,register}-screen.tsx  # écran étranger
├── features/profile/components/edit-profile-screen.tsx   # devise, téléphone E.164
└── écrans de prix acheteur (catalogue, recherche, panier, commandes) → useMoney

apps/landing/app/
├── routes.ts                                  # + suivi/:token
└── routes/suivi.tsx                           # CRÉÉ

apps/web-spa/app/features/admin/
├── settings/forms/exchange-rates-form.tsx     # CRÉÉ — taux, marge, alerte 72 h
├── orders/pages/admin-order-detail-page.tsx   # proche, devise, preuve
└── deliveries/pages/far-proofs-page.tsx       # CRÉÉ — preuves éloignées
```

**Structure Decision** : trois modules API nouveaux, chacun avec une seule
responsabilité (`relatives`, `gift`, `currency`), branchés sur l'existant par
quelques appels directs — le projet n'a pas de bus d'événements et ce lot n'en
introduit pas. Les entités existantes reçoivent des colonnes plutôt que des
tables jumelles, parce qu'elles sont déjà le lieu de ces données (adresse sur
`checkouts`, preuve sur `deliveries`).

### Ordre de livraison conseillé

1. **Fondations** : migrations, `currency` (taux + cron + réglages), garde SMS
   hors Bénin, `phone_verified_at`.
2. **US1** : proche au passage en caisse, espèces refusées, SMS d'annonce et
   SMS du code, contact livreur = proche.
3. **US2** : preuve `CODE_AND_PHOTO`, notifications de remise, échec →
   portefeuille.
4. **US3 + US6** : devise côté mobile, inscription depuis l'étranger.
5. **US4** : carnet.
6. **US5** : suivi public, paniers reçus, notation du proche.
7. **Back-office** : taux, détail de commande, preuves éloignées.

US1 et US2 forment le premier livrable utile ; elles fonctionnent en FCFA,
avant la devise.

## Risques

| Risque | Parade |
|---|---|
| Le moyen carte n'est pas activé sur le compte marchand INTRAM | Vérification en sandbox en tête de lot ; sans carte, le module reste utilisable en mobile money par un tiers au pays, mais perd son intérêt |
| Débit carte supérieur au montant affiché (change bancaire) | Marge de 2 % et mention au paiement ; montant FCFA toujours visible |
| Le livreur oublie la photo | Bouton « Valider » inactif tant que code, photo et position ne sont pas tous là |
| Position GPS refusée sur le téléphone du livreur | La remise reste possible avec la dernière position connue (< 2 min) ; sinon refus avec message |
| Le cron de taux ne tourne pas (incident du 30/08 : `ScheduleModule` absent) | Alerte back-office à 72 h ; bouton « Actualiser » |
| Jeton de suivi diffusé | Aucun prix, code ni téléphone sur la page ; détail effacé à 7 jours |

## Complexity Tracking

| Écart | Pourquoi | Alternative plus simple écartée parce que |
|---|---|---|
| **II** — prix affichés dans une autre devise que le FCFA, alors que la constitution impose « X XXX FCFA » | Le payeur pense en euros ou en dollars ; c'est l'objet même de US3 | Afficher seulement le FCFA laisse le payeur faire le calcul de tête et ne dit rien du montant final. Le montant FCFA reste **toujours** affiché à côté, en JetBrains Mono, et la devise n'est jamais imposée : FCFA par défaut, pour tous les utilisateurs au Bénin. |
| **III** — l'app mobile appelle l'API à la main, sans le SDK OpenAPI | Écart existant de toute l'app mobile, déjà consigné en 007 | Migrer le mobile vers le SDK sort du périmètre de ce lot. Les contrats Zod de l'API restent la source de vérité. |
