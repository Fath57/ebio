---

description: "Découpage exécutable — module diaspora : commander pour un proche"
---

# Tasks: Module diaspora — Commander pour un proche

**Input**: `/specs/009-diaspora-gift-order/` — plan.md, spec.md, research.md, data-model.md, contracts/diaspora.md, quickstart.md
**Branch**: `009-diaspora-gift-order`

## Format: `[ID] [P?] [Story] Description`

- **[P]** : parallélisable — fichier distinct, aucune dépendance en attente.
- **[Story]** : l'histoire utilisateur servie (US1 à US6, voir spec.md).

**Tests** : la spec ne réclame pas de TDD. Mais plusieurs règles touchent à
l'argent ou à la vie privée et ne se vérifient pas à l'œil : le gel du taux et
la marge, la preuve exigée, le montant remboursé après un échec, ce que montre
le lien public, le rattachement par numéro vérifié, la garde SMS hors Bénin.
Elles ont leurs tâches de test (Vitest, e2e sur PostGIS via testcontainers).
Le reste se vérifie par le quickstart.

**Rappels pour chaque tâche** : pas de point-virgule, Zod v4, MikroORM 6,
commentaires de code en anglais et textes d'interface en français accentué,
vouvoiement. Les 8 règles de lint de `CLAUDE.md` s'appliquent. Lancer
`pnpm lint` à la fin de chaque phase. Le mobile est hors du workspace pnpm :
`cd apps/mobile && npx eslint <fichiers>`.

---

## Phase 1 — Mise en place

- [ ] T001 Vérifier en sandbox INTRAM qu'un paiement par carte (moyen `STRIPE_CARD`) passe depuis la page hébergée pour le compte marchand eBio, et noter le montant minimum observé dans `specs/009-diaspora-gift-order/research.md` §7 — **bloquant pour US1** : sans carte, s'arrêter et prévenir
- [X] T002 Créer la migration `apps/api/src/modules/db/migrations/Migration20261114090000.ts` (`cd apps/api && ../../node_modules/.bin/mikro-orm migration:create`) : table `saved_relatives` ; colonnes `checkouts` (destinataire, `tracking_token` unique, `recipient_sms_resend_count`, `payer_time_zone`, `display_currency`, `fx_rate`, `fx_margin_bps`, `display_total`) ; colonnes `deliveries` (`proof_latitude`, `proof_longitude`, `proof_taken_at`, `proof_distance_m`, `proof_far`) ; colonnes `user` (`phone_verified_at`, `display_currency`) ; reprise `phone_verified_at = created_at` pour les e-mails `@phone.ebio.app` ; tous les CHECK de `data-model.md` §2-4, chaque `ADD CONSTRAINT` précédé de son `DROP CONSTRAINT IF EXISTS`
- [X] T003 Dans la même migration, régénérer les CHECK des enums `deliveries.proof_type` (+ `CODE_AND_PHOTO`) et `notifications.type` (+ `GIFT_DELIVERED`, `GIFT_DELIVERY_FAILED`) à partir de la liste complète des valeurs actuelles
- [X] T004 Écrire `apps/api/scripts/2026-11-14-diaspora-gift-order.sql`, équivalent idempotent de T002-T003 pour la production (le registre de migrations prod est désynchronisé), et le rejouer **deux fois** sur une base jetable
- [X] T005 Appliquer la migration en local et vérifier le schéma (`\d checkouts`, `\d deliveries`, `\d saved_relatives`, contraintes CHECK)

---

## Phase 2 — Socle (bloquant pour toutes les histoires)

### Entités et enums

- [X] T006 [P] Ajouter à `apps/api/src/modules/payments/entities/checkout.entity.ts` : `recipientName`, `recipientPhone`, `savedRelative` (ManyToOne nullable, `deleteRule: 'set null'`), `trackingToken`, `recipientSmsResendCount`, `payerTimeZone`, `displayCurrency`, `fxRate`, `fxMarginBps`, `displayTotal`, avec un getter `isGift` — les dates et numériques nullables avec leur `type` explicite (voir mémoire sérialisation MikroORM)
- [X] T007 [P] Ajouter `CODE_AND_PHOTO` à `DeliveryProofType` et les colonnes `proofLatitude`, `proofLongitude`, `proofTakenAt` (`type: 'Date'`), `proofDistanceM`, `proofFar` dans `apps/api/src/modules/deliveries/entities/delivery.entity.ts`
- [X] T008 [P] Ajouter `phoneVerifiedAt` (`type: 'Date'`, nullable) et `displayCurrency` (défaut `'XOF'`) à `apps/api/src/modules/auth/auth.entity.ts` ; exposer `displayCurrency` dans `userResponseSchema` (`apps/api/src/modules/users/contracts/user.contract.ts`)
- [X] T009 [P] Ajouter `GIFT_DELIVERED` et `GIFT_DELIVERY_FAILED` à `NotificationType` (`apps/api/src/modules/notifications/notification.entity.ts`) et à la table d'audience acheteur de `apps/api/src/modules/notifications/notifications.service.ts` (L26-78)
- [X] T010 [P] Créer `apps/api/src/modules/relatives/entities/saved-relative.entity.ts` selon `data-model.md` §1 (unicité `owner, phone`)

### Devises (module `currency`)

- [X] T011 Créer `apps/api/src/modules/currency/currency.constants.ts` : `SUPPORTED_DISPLAY_CURRENCIES = ['XOF','EUR','USD','CAD']`, `EUR_OFFICIAL_PARITY = 655.957`, `DEFAULT_FX_MARGIN_BPS = 200`, `RATE_STALE_HOURS = 72`
- [X] T012 Ajouter à `apps/api/src/modules/settings/platform-settings.service.ts` les clés `EXCHANGE_RATES` (JSON validé Zod : par devise `xofPerUnit > 0`, `source: 'AUTO'|'MANUAL'`, `updatedAt`) et `FX_MARGIN_BPS` (0..1000), avec `getExchangeRates()` (EUR = `EUR_OFFICIAL_PARITY` en `MANUAL` si absent), `setExchangeRates(partial, source)`, `getFxMarginBps()`, `setFxMarginBps()` — sur le modèle de `getEscrowRelease`/`setEscrowRelease`
- [X] T013 Créer `apps/api/src/modules/currency/ecb-rates.client.ts` : `fetchEurCross(): Promise<{ USD: number, CAD: number }>` sur `https://api.frankfurter.dev/latest?from=EUR&to=USD,CAD`, `AbortSignal.timeout(10_000)`, réponse validée Zod
- [X] T014 Créer `apps/api/src/modules/currency/exchange-rates.service.ts` : `effectiveRate(currency)` = `xofPerUnit × (1 − marge)` ; `toDisplay(xof, currency)` arrondi au centime **supérieur** ; `freeze(totalXof, currency)` → `{ fxRate, fxMarginBps, displayTotal }` ou `null` pour XOF ; `publicRates()` pour `/settings/public` ; `adminView()` avec `stale` (jamais vrai pour EUR)
- [X] T015 Créer `apps/api/src/modules/currency/exchange-rates.scheduler.ts` : `@Cron('0 6 * * *')` + `@SingleInstance()` + `@EnsureRequestContext()` (modèle `payments/escrow-scheduler.service.ts` L35) ; USD et CAD = `EUR_OFFICIAL_PARITY / cross` en source `AUTO` ; **ne jamais toucher EUR** ; en cas d'échec, journaliser et garder les derniers taux
- [X] T016 Créer `apps/api/src/modules/currency/currency.module.ts`, l'importer dans le module racine, et exposer `currencies` (taux effectifs) dans `apps/api/src/modules/settings/public-settings.controller.ts`
- [X] T017 [P] Test `apps/api/src/modules/currency/exchange-rates.service.spec.ts` : 6 559,57 FCFA en EUR à 2 % → 10,21 € ; EUR saisi à 660 → 10,15 € ; marge 0 % → 10,00 € ; arrondi toujours vers le haut ; XOF → `null`
- [X] T018 [P] Test `apps/api/src/modules/currency/exchange-rates.scheduler.spec.ts` : le cron met USD/CAD à jour en `AUTO`, laisse EUR intact même s'il a été saisi, et garde les anciens taux si l'appel BCE échoue

### Garde SMS, vérification et numéros

- [X] T019 Dans `apps/api/src/modules/notifications/notifications.service.ts` `sendSms` (L262) : ne rien envoyer si `user.phone` ne commence pas par `+229` (journal `debug`) — les autres canaux de la notification partent normalement (FR-033)
- [X] T020 [P] Test `apps/api/src/modules/notifications/notifications.service.spec.ts` : une notification `PUSH + SMS` à un utilisateur `+33…` part en push et pas en SMS ; à un `+229…`, les deux
- [X] T021 Poser `phoneVerifiedAt = new Date()` dans `registerWithPhone` (`apps/api/src/modules/auth/otp-auth.service.ts` L60-96) ; dans `apps/api/src/modules/users/users.service.ts` (L60-61) remettre `phoneVerifiedAt` à `null` quand `phone` change, et valider `phone` en E.164 `^\+[1-9]\d{6,14}$` dans `updateUserSchema`
- [X] T022 Dans `apps/api/src/modules/orders/checkout.service.ts` `create()` (L267) et dans le chemin legacy `POST orders` : refuser avec `400 ACCOUNT_NOT_VERIFIED` si l'acheteur n'a ni `emailVerified` ni `phoneVerifiedAt` (FR-034c)

### Mobile — socle devise

- [X] T023 Créer `apps/mobile/src/features/common/currency-context.tsx` sur le modèle de `apps/mobile/src/theme/theme-context.tsx` : devise persistée dans `storage` (`apps/mobile/src/utils/offline-storage.ts`, clé ajoutée à `ACCOUNT_KEYS`), synchronisée avec `displayCurrency` du profil à la connexion, taux lus dans `/api/settings/public`
- [X] T024 Créer `apps/mobile/src/features/common/hooks/use-money.ts` : `formatMoney(xof)` → `{ primary: '10,21 €', secondary: '6 560 FCFA' }` ; en XOF, `primary = '6 560 FCFA'` et `secondary = null` ; virgule décimale, espace des milliers, symbole après le nombre (« 10,21 € », « 12,40 $ US », « 15,10 $ CA »)
- [X] T025 Monter `CurrencyProvider` dans l'arbre des providers de l'app acheteur (`apps/mobile/src/app/` — à côté de `ThemeProvider`)

**Point de contrôle** : `pnpm lint`, `pnpm --filter api test`, migration appliquée. Les histoires peuvent démarrer.

---

## Phase 3 — US1 : faire livrer un panier à un proche (P1) 🎯 MVP

**Objectif** : un payeur choisit « Livrer à un proche », paie, le proche est
prévenu par SMS et le livreur le contacte et remet le panier contre le code.
**Test indépendant** : quickstart §3 étapes 1 à 4, puis collecte et remise par
le code (la preuve photo arrive en US2).

### API

- [X] T026 [US1] Étendre `createCheckoutSchema` et le schéma de preview dans `apps/api/src/modules/orders/contracts/checkout.contract.ts` : `recipient?: { name (1..120), phone (^\+229\d{10}$), savedRelativeId?: uuid }`, `displayCurrency` (défaut `XOF`), `payerTimeZone?` (fuseau IANA de l'appareil, validé par `Intl.supportedValuesOf('timeZone')`) ; réponse preview `display` et `cardMinimumNotMet` ; réponse create `isGift`, `display` (contrats §2)
- [X] T027 [US1] Dans `CheckoutService.create()` (`apps/api/src/modules/orders/checkout.service.ts` L267) : si `recipient` — ignorer s'il a le numéro du payeur ; sinon refuser `GIFT_CASH_NOT_ALLOWED` (à côté des contrôles L281-288), `GIFT_REQUIRES_DELIVERY` si retrait, `GIFT_AMOUNT_TOO_LOW` sous 1 000 FCFA ; écrire `recipientName`, `recipientPhone`, `savedRelative` (vérifier qu'il appartient au payeur) et un `trackingToken` (`randomBytes(18).toString('base64url')`)
- [X] T028 [US1] Dans `CheckoutService.preview()` (L112) : renvoyer `cardMinimumNotMet` et le bloc `display` via `ExchangeRatesService` ; dans `create()`, geler devise, taux, marge et total avec `freeze()` (FR-022) — le client n'envoie que la devise
- [X] T029 [US1] Créer `apps/api/src/modules/gift/gift-notifier.service.ts` avec `announceToRecipient(checkout)`, `sendCodeToRecipient(checkout, code)`, `announceCancellation(checkout)` — `SmsService.send()` direct (`apps/api/src/common/sms.service.ts` L88), textes de `contracts/diaspora.md` §10, lien `${config.clients.publicSite.url}/suivi/${trackingToken}`, créneau en « demain entre 10 h et 12 h » (heure du Bénin) ; ne jamais lever d'exception (journaliser)
- [X] T030 [US1] Appeler `announceToRecipient` dans `confirmCheckout()` (`apps/api/src/modules/payments/payments.service.ts` L439) après le passage en PAID, pour un passage en caisse avec proche
- [X] T031 [US1] Appeler `sendCodeToRecipient` aux deux endroits où le code est poussé à l'acheteur (`apps/api/src/modules/deliveries/deliveries.service.ts` L862-869 livraison seule, L1184 tournée) — une seule fois par passage en caisse et par code
- [X] T032 [US1] Appeler `announceCancellation` depuis `onOrderCancelled` (`apps/api/src/modules/orders/orders.service.ts` L1399) quand **toutes** les commandes du passage en caisse sont annulées et que l'annonce avait été envoyée
- [X] T033 [US1] Dans `apps/api/src/modules/deliveries/deliveries.mapper.ts` (L275) : pour un passage en caisse avec proche, `buyerContact = { name: recipientName, phone: recipientPhone, role: 'RECIPIENT', payerFirstName }` et `requiresGiftProof: true` ; charger `order.checkout` dans les requêtes qui alimentent ce mapper
- [X] T034 [US1] Ajouter `POST /api/checkouts/:id/recipient-sms` (payeur seulement) dans `apps/api/src/modules/payments/checkouts.controller.ts` : renvoie le dernier SMS utile (code s'il existe, sinon annonce), incrémente `recipientSmsResendCount`, `429 RECIPIENT_SMS_LIMIT` au-delà de 3
- [X] T035 [US1] Ajouter le bloc `gift` (`recipient`, `confirmationCode`, `smsResendsLeft`) et `display` à la réponse commande acheteur (`apps/api/src/modules/orders/` — mapper de `GET /orders/:id`)
- [X] T036 [P] [US1] Test e2e `apps/api/src/modules/orders/checkout-gift.e2e-spec.ts` : espèces refusées ; retrait refusé ; numéro non béninois refusé ; numéro du payeur → commande ordinaire ; jeton unique créé ; le livreur voit le proche comme contact
- [X] T037 [P] [US1] Test `apps/api/src/modules/gift/gift-notifier.service.spec.ts` : annonce sans code ; SMS du code envoyé une seule fois pour une tournée de deux commandes ; échec Wirepick sans exception ; 4e renvoi → 429

### Mobile acheteur

- [X] T038 [US1] Créer `apps/mobile/src/features/cart/components/recipient-step.tsx` : choix « Me livrer » / « Livrer à un proche » ; formulaire nom, téléphone (`+229` prérempli), adresse (≥ 10 caractères), point via `LocationPickerScreen` ; labels visibles, cibles 44 px
- [X] T039 [US1] Intégrer `recipient-step` dans `apps/mobile/src/features/cart/components/checkout-flow.tsx` : envoyer `recipient` et `payerTimeZone` (`getCalendars()[0].timeZone`) au preview et au create (L616-635), masquer `CASH` pour un proche, placer le paiement en ligne en tête avec la mention « Carte bancaire ou Mobile Money », afficher le message de `cardMinimumNotMet`, traduire les codes d'erreur `GIFT_*`
- [X] T040 [US1] Ne pas mémoriser l'adresse du proche dans le brouillon `apps/mobile/src/features/cart/utils/checkout-draft.ts` (il garde l'adresse du payeur)
- [X] T041 [US1] Dans `apps/mobile/src/features/orders/components/order-tracking.tsx` : bloc « Livré à Afiavi Kossou », code de remise, bouton « Renvoyer le SMS » (désactivé à 0 restant) qui appelle `recipient-sms`

### Mobile livreur

- [X] T042 [US1] Dans les écrans de course livreur (`apps/mobile/src/features/courier/components/active-delivery-screen.tsx` et la fiche de course) : afficher « Pour Afiavi Kossou, de la part d'Awa » et appeler le numéro du proche

**Point de contrôle** : quickstart §3 complet ; une commande ordinaire se comporte exactement comme avant.

---

## Phase 4 — US2 : preuve de remise envoyée au payeur (P1)

**Objectif** : remise validée par code + photo + position ; payeur prévenu avec
la photo ; échec remboursé sur le portefeuille moins les frais.
**Test indépendant** : quickstart §5 et §6.

### API

- [X] T043 [US2] Ajouter la branche `CODE_AND_PHOTO` (`code`, `mediaId`, `latitude`, `longitude`, `occurredAt`) à `completeDeliverySchema` (`apps/api/src/modules/deliveries/contracts/delivery.contract.ts` L151-165)
- [X] T044 [US2] Dans `DeliveriesService.complete()` (`apps/api/src/modules/deliveries/deliveries.service.ts` L1388) : livraison pour un proche → seul `CODE_AND_PHOTO` accepté (`400 GIFT_PROOF_REQUIRED`) ; vérifier le code ; vérifier que le média existe, a le contexte `DELIVERY_PROOF` et a été envoyé par ce livreur (`400 INVALID_PROOF_MEDIA`) ; écrire position, `proofTakenAt = occurredAt`, `proofDistanceM` (`ST_Distance` geography vers `order.deliveryLatitude/Longitude`), `proofFar = distance > 300`
- [X] T045 [US2] Même traitement dans `deliverRun()` (L1206-1272) : la preuve est recopiée sur chaque livraison de la tournée, nouveaux champs compris
- [X] T046 [US2] Passer `imageUrl` de `NotificationsService.send` jusqu'à `pushOptionsFor` (`notifications.service.ts` L239) et `FcmService`
- [X] T047 [P] [US2] Créer `apps/api/src/modules/email/templates/gift-delivered.ejs` (photo inline `cid:proof`, nom du proche, heure de remise en heure du Bénin **et** heure du payeur) et `gift-delivery-failed.ejs` (motif, montant recrédité) ; les déclarer dans `TemplateName` (`apps/api/src/modules/email/email-template.service.ts` L6-26)
- [X] T048 [US2] Dans `GiftNotifierService` : `notifyDelivered(delivery)` — push `GIFT_DELIVERED` avec URL signée 7 jours (`MediaService.getSignedUrl`, L320) et e-mail avec les octets de la photo (`readObject`, L378) ; heure du payeur dans `checkout.payerTimeZone` — **sans fuseau connu, n'afficher que l'heure du Bénin**
- [X] T049 [US2] Appeler `notifyDelivered` après `applyStatusFromDelivery(DELIVERED)` dans `complete()` et `deliverRun()` pour une livraison pour un proche
- [X] T050 [US2] Ajouter à `compensateOrder()` (`apps/api/src/modules/payments/compensation.service.ts` L61) une option `withholdDeliveryFee` : crédit = `order.totalAmount − frais de livraison de la commande`, libellé de transaction explicite, idempotence inchangée
- [X] T051 [US2] Créer `apps/api/src/modules/gift/gift-failure.service.ts` `onGiftDeliveryFailed(delivery)` : annuler la commande, `compensateOrder(orderId, reason, { withholdDeliveryFee: true })`, régler le livreur comme une livraison effectuée (`settleCourierWallet`), notifier le payeur (`GIFT_DELIVERY_FAILED`, push + e-mail) et SMS d'annulation au proche ; l'appeler depuis `DeliveriesService.fail()` (L1555) **seulement** pour une livraison pour un proche — les commandes ordinaires gardent le comportement actuel
- [X] T052 [US2] Ajouter le bloc `proof` (URL signée 1 h, `takenAt`, `far`) à la réponse commande du payeur
- [X] T053 [P] [US2] Test e2e `apps/api/src/modules/deliveries/gift-proof.e2e-spec.ts` : `CODE` seul refusé sur un proche, accepté sur une commande ordinaire ; média d'un autre livreur refusé ; remise à 1 km → `proofFar` ; tournée de deux commandes → deux preuves identiques
- [X] T054 [P] [US2] Test e2e `apps/api/src/modules/gift/gift-failure.e2e-spec.ts` : commande à 10 000 FCFA dont 1 500 de livraison → portefeuille crédité de 8 500, une seule fois même si `fail` est rejoué ; livreur crédité ; commande annulée ; une commande ordinaire en échec ne bouge pas d'argent

### Mobile livreur

- [X] T055 [US2] Dans `apps/mobile/src/features/courier/components/proof-screen.tsx` : quand `requiresGiftProof`, afficher code **et** photo ensemble, « Valider » inactif tant que les deux et la position manquent ; position lue avec `expo-location` (`getCurrentPositionAsync`, repli sur la dernière position de moins de 2 min) ; envoyer `{ proofType: 'CODE_AND_PHOTO', … }` via `queue.sendTransition` (`apps/mobile/src/app/navigation.courier.tsx` L333-345) avec l'heure de la prise de vue en `occurredAt`

### Mobile acheteur

- [X] T056 [US2] Dans `order-tracking.tsx` : afficher la photo de remise (texte alternatif « Photo de la remise du panier à {prénom}, {heure} »), l'heure, et rien d'autre en cas de `far` (le signalement est pour le support)

**Point de contrôle** : quickstart §5 et §6 ; US1 + US2 = premier livrable utile, en FCFA.

---

## Phase 5 — US3 : voir les prix et payer depuis l'étranger (P2)

**Objectif** : prix en EUR/USD/CAD partout côté acheteur, montant gelé à la commande.
**Test indépendant** : quickstart §2.

- [X] T057 [US3] Accepter `displayCurrency` dans `PUT /users/me` (la route existante est un PUT) (`apps/api/src/modules/users/contracts/user.contract.ts`, `users.service.ts`)
- [X] T058 [US3] Ajouter au profil (`apps/mobile/src/features/profile/components/edit-profile-screen.tsx` ou l'écran Réglages) un choix « Devise d'affichage » : FCFA, Euro, Dollar US, Dollar canadien
- [ ] T059 [P] [US3] Remplacer le formatage local par `useMoney` dans `apps/mobile/src/features/catalog/components/product-card.tsx`, `product-detail-screen.tsx`, `format-picker.tsx`, `apps/mobile/src/features/catalog/promotions.ts`, `hooks/use-product-units.ts` — attention : `product-detail-screen.tsx` a des modifications non commitées antérieures à cette branche, les préserver
- [X] T060 [P] [US3] Idem dans `apps/mobile/src/features/search/components/search-result-card.tsx` et `filter-sheet.tsx`, `apps/mobile/src/features/common/components/price-tag.tsx`, `apps/mobile/src/features/home/components/home-header.tsx`
- [X] T061 [P] [US3] Idem dans `apps/mobile/src/features/cart/components/cart-screen.tsx`, `cart-cta-bar.tsx`, `basket-suggestions.tsx`
- [X] T062 [US3] Dans `checkout-flow.tsx` : récapitulatif en devise via le bloc `display` du preview (pas un recalcul client) + mention « Le montant prélevé par votre banque peut différer légèrement ; vous serez débité de {X FCFA} » ; envoyer `displayCurrency`
- [X] T063 [P] [US3] Dans `order-list.tsx` et `order-tracking.tsx` (`apps/mobile/src/features/orders/components/`) : montant en devise **gelé** de la commande (`display`) et montant FCFA encaissé
- [X] T064 [P] [US3] Test e2e `apps/api/src/modules/orders/checkout-currency.e2e-spec.ts` : preview et create en USD ; changer le taux USD après création ne change pas `displayTotal` ; XOF → colonnes nulles ; encaissement, commission et versement restent en FCFA

**Point de contrôle** : écrans fournisseur et livreur toujours en FCFA.

---

## Phase 6 — US4 : carnet de proches (P2)

**Objectif** : enregistrer, réutiliser, modifier, supprimer des proches.
**Test indépendant** : quickstart §3 étape 5, puis seconde commande depuis le carnet.

- [X] T065 [P] [US4] Créer `apps/api/src/modules/relatives/contracts/relative.contract.ts` (contrats §1)
- [X] T066 [US4] Créer `apps/api/src/modules/relatives/relatives.service.ts` : CRUD limité au propriétaire, `409 RELATIVE_PHONE_EXISTS`, `422 RELATIVES_LIMIT_REACHED` à 20
- [X] T067 [US4] Créer `apps/api/src/modules/relatives/relatives.controller.ts` (`GET/POST /relatives`, `PATCH/DELETE /relatives/:id`, `AuthGuard`) et `relatives.module.ts`, l'importer dans le module racine
- [X] T068 [P] [US4] Test `apps/api/src/modules/relatives/relatives.service.spec.ts` : 21e proche refusé ; doublon de numéro refusé ; un autre compte ne lit ni ne modifie ; supprimer un proche laisse le passage en caisse intact (`saved_relative_id` à null, nom et numéro conservés)
- [X] T069 [US4] Créer `apps/mobile/src/features/relatives/components/relatives-screen.tsx` (liste + suppression) et `relative-form-screen.tsx` ; route dans `apps/mobile/src/app/navigation.tsx` (pile Profil) et entrée « Mes proches » dans le profil
- [X] T070 [US4] Dans `recipient-step.tsx` : liste des proches du carnet en tête (choix → préremplissage modifiable, `savedRelativeId` envoyé) ; après une commande pour un nouveau proche, proposer « Enregistrer Afiavi dans vos proches ? » avec un surnom sur l'écran de confirmation

---

## Phase 7 — US6 : s'inscrire depuis l'étranger (P2)

**Objectif** : hors du Bénin, Google / Apple / e-mail sans code SMS ; jamais de SMS au payeur étranger.
**Test indépendant** : quickstart §1.

- [X] T071 [US6] Dans `apps/api/src/modules/auth/otp-auth.controller.ts` (`/request`, `/verify`, `/register`) et `contracts/auth.contract.ts` : un numéro hors `+229` renvoie `400 { code: 'PHONE_NOT_SUPPORTED' }` au lieu de l'erreur Zod générique
- [X] T072 [P] [US6] Créer `apps/mobile/src/features/common/utils/is-abroad.ts` : `isAbroad()` via `getCalendars()[0].timeZone` d'`expo-localization` ; faux pour `Africa/Porto-Novo`, `Africa/Lagos`, `Africa/Douala`, `Africa/Kinshasa`, `Africa/Malabo`, `Africa/Libreville`, `Africa/Niamey`, `Africa/Ndjamena`, `Africa/Bangui`, `Africa/Brazzaville`, `Africa/Luanda` ; faux aussi si le fuseau est illisible (on garde l'écran d'aujourd'hui)
- [X] T073 [US6] Dans `apps/mobile/src/features/auth/components/register-screen.tsx` : si `isAbroad()`, démarrer à l'étape `email-form` avec Google et Apple dans leur disposition actuelle, sans l'étape `phone-input`, et ajouter le lien « J'ai un numéro béninois » qui ramène à `phone-input`
- [X] T074 [US6] Même chose dans `apps/mobile/src/features/auth/components/login-screen.tsx` : méthode initiale `email` au lieu de `phone` (L41) quand `isAbroad()`, lien « J'ai un numéro béninois »
- [X] T075 [US6] Traduire `PHONE_NOT_SUPPORTED` dans les deux écrans : « Les codes par SMS sont réservés aux numéros béninois. Continuez avec Google, Apple ou votre e-mail. »
- [X] T076 [US6] Dans `edit-profile-screen.tsx` (L357-366) : placeholder international, validation E.164 côté client, message si le numéro est refusé
- [X] T077 [US6] Traduire `ACCOUNT_NOT_VERIFIED` au passage en caisse (`checkout-flow.tsx`) : « Confirmez votre adresse e-mail pour commander » + bouton de renvoi de l'e-mail
- [ ] T078 [P] [US6] Test `apps/mobile/src/features/common/utils/is-abroad.test.ts` si le mobile a un lanceur de tests ; sinon vérification manuelle quickstart §1 (fuseaux Europe/Paris, America/Toronto, Africa/Porto-Novo, Africa/Lagos)

---

## Phase 8 — US5 : le proche suit son panier et peut créer un compte (P3)

**Objectif** : lien public sans compte ; « Paniers reçus » et notation pour un compte au numéro vérifié.
**Test indépendant** : quickstart §4 et §7.

### Suivi public

- [X] T079 [US5] Créer `apps/api/src/modules/gift/gift-tracking.service.ts` : réponse de `contracts/diaspora.md` §5 — position du livreur seulement pendant la course, aucun prix, code, téléphone ni adresse texte ; `expired: true` et rien d'autre sept jours après livraison, échec ou annulation
- [X] T080 [US5] Créer `apps/api/src/modules/gift/gift-tracking.controller.ts` `GET /api/gift-tracking/:token` avec `@Public()` + `@UseGuards(RateLimitGuard) @RateLimit(60)` ; `404` si le jeton est inconnu ; créer `apps/api/src/modules/gift/gift.module.ts` et l'importer
- [X] T081 [P] [US5] Test e2e `apps/api/src/modules/gift/gift-tracking.e2e-spec.ts` : la réponse sérialisée ne contient **aucune** des clés `price`, `amount`, `total`, `code`, `phone`, `address` ; position absente avant collecte et après remise ; à J+8, seul `{ status, expired }`
- [X] T082 [US5] Créer `apps/landing/app/routes/suivi.tsx` sur le modèle de `routes/parrainage.tsx` : loader vers `${API_URL}/api/gift-tracking/${token}` (`AbortSignal.timeout(5000)`), `meta` `robots: noindex`, `SiteHeader`/`SiteFooter`, étapes de la livraison, contenu du panier avec images, carte avec le livreur pendant la course, rafraîchissement toutes les 15 s via `useRevalidator` tant que la course est en cours ; page « lien introuvable » sur 404
- [X] T083 [US5] Déclarer `route('suivi/:token', 'routes/suivi.tsx')` dans `apps/landing/app/routes.ts`

### Paniers reçus

- [X] T084 [US5] Créer `apps/api/src/modules/gift/received-orders.controller.ts` `GET /api/orders/received` : commandes dont `checkout.recipientPhone = user.phone` **et** `user.phoneVerifiedAt` non nul ; réponse §4 sans aucun montant ; vide si le numéro n'est pas vérifié ; déclarer la route avant `orders/:id` pour éviter la collision
- [X] T085 [US5] Étendre l'éligibilité du module `ratings` (avis boutique, livreur et produits — `apps/api/src/modules/ratings/`) : l'auteur peut être le proche rattaché (numéro vérifié égal à `recipientPhone`) d'une commande livrée ; le payeur garde aussi le droit
- [X] T086 [P] [US5] Test e2e `apps/api/src/modules/gift/received-orders.e2e-spec.ts` : compte SMS au bon numéro → la commande apparaît sans montant ; même numéro saisi dans le profil d'un autre compte → rien ; changement de numéro → plus rien ; le proche peut noter après la remise
- [X] T087 [US5] Créer `apps/mobile/src/features/orders/components/received-orders.tsx` et l'ajouter comme segment « Paniers reçus » dans l'onglet Commandes (`order-list.tsx`), affiché seulement s'il y a au moins un panier reçu ; ouverture d'un panier → suivi sans montant, sans annulation, avec accès à la notation existante (`rate-order-flow.tsx`)

---

## Phase 9 — Back-office et finitions

- [X] T088 Créer `apps/api/src/modules/currency/admin-exchange-rates.controller.ts` : `GET/PUT /admin/exchange-rates` (EUR, USD, CAD saisissables, source `MANUAL`), `PUT /admin/fx-margin`, `POST /admin/exchange-rates/refresh` — `@Roles('ADMIN')`, `@CanManage('Settings')`
- [X] T089 Régénérer le SDK (`pnpm generate`) pour le back-office
- [X] T090 [P] Créer `apps/web-spa/app/features/admin/settings/forms/exchange-rates-form.tsx` (trois taux en FCFA pour une unité, source et date, bandeau d'alerte si `stale`, marge en %, bouton « Actualiser ») et l'ajouter à `admin-settings-page.tsx`
- [X] T091 [P] Dans `apps/web-spa/app/features/admin/orders/pages/admin-order-detail-page.tsx` : bloc « Pour un proche » (payeur, proche, téléphone), devise et taux gelés, preuve (photo signée, heure, distance, mention « Position éloignée » avec icône) ; filtre `gift=true` dans la liste des commandes (API `GET /admin/orders` + page)
- [X] T092 [P] Créer `GET /admin/deliveries/far-proofs` et `apps/web-spa/app/features/admin/deliveries/pages/far-proofs-page.tsx` (liste avec photo, distance, livreur, commande) ; entrée de menu
- [X] T093 Créer `apps/api/src/modules/gift/gift-proof-purge.scheduler.ts` : cron quotidien `@SingleInstance`, supprime le média de preuve des livraisons pour un proche remises depuis plus de 90 jours et met `proofMediaId` à null (FR-017)
- [X] T094 [P] Mettre à jour la page d'aide / CGU (`apps/landing/app/routes/cgu.tsx`, `confidentialite.tsx`) : commande pour un proche, photo de remise conservée 90 jours, remboursement sur portefeuille en cas d'échec
- [X] T095 `pnpm lint` (racine) et `npx eslint` sur les fichiers mobiles touchés ; `pnpm --filter api test` ; `pnpm build`
- [ ] T096 Dérouler `specs/009-diaspora-gift-order/quickstart.md` de bout en bout sur l'émulateur ; lancer `/design-review` pour la page `suivi/:token` et les écrans back-office

---

## Dépendances

```
Phase 1 (T001 bloque US1 côté paiement)
   └─▶ Phase 2 (socle)
          ├─▶ US1 ──▶ US2          (US2 a besoin du proche sur le passage en caisse)
          ├─▶ US3                  (indépendante ; T062 touche checkout-flow comme T039)
          ├─▶ US4 ──(T070 après T038)
          ├─▶ US6                  (indépendante)
          └─▶ US5 (après US1)      (le jeton et le proche viennent d'US1)
Phase 9 après les histoires qu'elle expose (T091 après US2/US3)
```

- `checkout-flow.tsx` est touché par T039, T062, T077 : **ne pas** les mener en parallèle.
- `order-tracking.tsx` : T041, T056, T063 — idem.
- `deliveries.service.ts` : T031, T044, T045, T049, T051 — idem.

## Exemples de parallélisation

- **Socle** : T006, T007, T008, T009, T010 ensemble ; puis T017, T018, T020 ensemble.
- **US1** : T036 et T037 (tests) pendant que T038-T042 (mobile) avancent.
- **US2** : T047 (gabarits) pendant T043-T045 ; T053 et T054 ensemble.
- **US3** : T059, T060, T061, T063 sur des fichiers distincts.
- **Back-office** : T090, T091, T092 ensemble après T089.

## Stratégie de livraison

1. **MVP = Phase 1 + 2 + US1 + US2**, en FCFA. Déployable seul : un payeur peut
   déjà faire livrer un proche avec preuve et remboursement sur échec.
2. **+ US3 et US6** : l'expérience diaspora complète (devise, inscription).
   Build EAS mobile nécessaire (nouveaux écrans), pas de nouveau module natif.
3. **+ US4** : fidélisation.
4. **+ US5** : suivi public et paniers reçus.
5. **Phase 9** au fil de l'eau ; T088-T090 doivent être en production **avant**
   d'ouvrir la devise aux utilisateurs, pour pouvoir corriger un taux.
