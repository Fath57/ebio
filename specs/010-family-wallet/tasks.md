---

description: "Découpage exécutable — portefeuille famille"
---

# Tasks: Module diaspora — Portefeuille famille

**Input**: `/specs/010-family-wallet/` — plan.md, spec.md, research.md, data-model.md, contracts/family-wallet.md, quickstart.md
**Branch**: `010-family-wallet`

## Format: `[ID] [P?] [Story] Description`

- **[P]** : parallélisable — fichier distinct, aucune dépendance en attente.
- **[Story]** : US1 à US6 (spec.md).

**Tests** : la spec ne réclame pas de TDD, mais l'argent et les limites ne se
vérifient pas à l'œil. Tests obligatoires : limites effectives et refus (pur),
paiement simultané de deux membres, routage des remboursements, fermeture,
rattachement par numéro vérifié, suppression de compte refusée, vie privée de
l'historique. Le reste par le quickstart.

**Rappels** : pas de point-virgule, Zod v4, MikroORM 6 (dates nullables
`type: 'Date'`, champ greffé perdu à la sérialisation), commentaires en anglais,
textes en français accentué avec vouvoiement, les 8 règles de lint de
`CLAUDE.md`. Lint depuis la racine : `./node_modules/.bin/eslint <fichiers>`.
Tests e2e dans des sous-dossiers `tests/` (testcontainers). Avant un
`git push`, arrêter Metro/back-office/landing locaux (délais du hook).

---

## Phase 1 — Mise en place

- [X] T001 Créer la migration `apps/api/src/modules/db/migrations/Migration20261115090000.ts` selon `data-model.md` : tables `family_wallets` et `family_wallet_members` (index unique partiel, CHECK de statut) ; `wallets.family_wallet_id` (unique) et contrainte `wallet_single_owner` régénérée avec cinq propriétaires ; `wallet_transactions.family_member_id` + index ; `checkouts.family_member_id` + CHECK ; `saved_relatives` à adresse et point nullables (CHECK d'adresse seulement si renseignée) ; régénérer depuis la liste complète les CHECK `wallet_transactions_type_check`, `notifications_type_check` et ceux de `payment_method` (orders, checkouts) s'ils existent — chaque `ADD CONSTRAINT` précédé de `DROP CONSTRAINT IF EXISTS`, tout en `IF NOT EXISTS`
- [X] T002 Écrire `apps/api/scripts/2026-11-15-family-wallet.sql`, équivalent idempotent en une transaction, et le rejouer deux fois sur une base jetable
- [X] T003 Appliquer la migration en local (`../../node_modules/.bin/mikro-orm migration:up --only Migration20261115090000`) et vérifier le schéma
- [X] T004 Ajouter le réglage plateforme `family_wallet_enabled` (faux par défaut) dans `apps/api/src/modules/settings/platform-settings.service.ts`, exposé dans `GET /settings/public` ; toutes les routes du module refusent `403 FAMILY_WALLET_DISABLED` quand il est faux (garde réutilisable)

---

## Phase 2 — Socle (bloquant)

- [X] T005 [P] Créer `apps/api/src/modules/family-wallet/entities/family-wallet.entity.ts` et `family-wallet-member.entity.ts` (data-model §1-2)
- [X] T006 [P] `apps/api/src/modules/wallet/entities/wallet.entity.ts` : relation `familyWallet` (OneToOne nullable) ; `wallet-transaction.entity.ts` : `familyMember` (ManyToOne nullable) et types `FAMILY_TRANSFER_OUT`, `FAMILY_TRANSFER_IN`, `FAMILY_CLOSURE_OUT`, `FAMILY_CLOSURE_IN` ; mettre aussi à jour le zod de `wallet/contracts/wallet.contract.ts` (y ajouter `REFERRAL_REWARD`, oublié)
- [X] T007 [P] `WalletOwner.familyWalletId` et `getOrCreate` dans `apps/api/src/modules/wallet/wallet.service.ts` ; `WalletMovement.familyMemberId` écrit sur la ligne d'historique
- [X] T008 [P] `checkouts.familyMember` dans `apps/api/src/modules/payments/entities/checkout.entity.ts` ; `FAMILY_WALLET` dans `PaymentMethod` (`orders/entities/order.entity.ts`) et `paymentMethodEnum` (`orders/contracts/order.contract.ts`)
- [X] T009 [P] Six types de notification (research §9) : `notifications/notification.entity.ts` et `AUDIENCE_TYPES` (`notifications.service.ts`)
- [X] T010 Créer `apps/api/src/modules/family-wallet/family-limits.ts` : `effectiveLimits(wallet, member)`, `spendable(balance, effective, spentThisMonth)`, `refusalFor({ wallet, member, effective, spent, balance, total, productCategoryIds })` → `null | { reason, blockedProductIds? }` dans l'ordre de data-model §7 ; `monthStart(now)` au fuseau Africa/Porto-Novo
- [X] T011 [P] Test `apps/api/src/modules/family-wallet/family-limits.spec.ts` : limite propre prioritaire, propre vide = défaut, aucune limite = solde seul, ordre des refus, produits bloqués par catégorie, début de mois au Bénin le 1er à 0 h 30 heure de Paris
- [X] T012 Créer `apps/api/src/modules/family-wallet/contracts/family-wallet.contract.ts` (contrats §1-5) et `family-wallet.module.ts`, importé dans `app.module.ts`
- [X] T013 Assistant `spentThisMonth(em, memberId, now)` dans `family-payment.service.ts` : `−SUM(amount)` des `ORDER_PAYMENT` et `REFUND` du membre depuis `monthStart`

**Point de contrôle** : `pnpm lint`, `pnpm --filter api test`, migration appliquée.

---

## Phase 3 — US1 : ouvrir, ajouter des proches, recharger (P1) 🎯

**Test indépendant** : quickstart §1.

### API

- [X] T014 [US1] `family-wallets.service.ts` : `open(payerId)` (409 `FAMILY_WALLET_EXISTS`, crée la ligne `wallets` liée), `get(payerId)` (membres, limites effectives, dépense du mois, solde, `display` dans la devise du payeur), `updateDefaults`
- [X] T015 [US1] `family-members.service.ts` `add(payerId, input)` : depuis `savedRelativeId` (vérifier le propriétaire) ou création d'un proche via `RelativesService.create` ; refuser le numéro du payeur (`FAMILY_MEMBER_IS_PAYER`) et un doublon actif (`FAMILY_MEMBER_EXISTS`) ; rattacher au compte au numéro vérifié s'il existe (`ACTIVE`), sinon `PENDING`
- [X] T016 [US1] `relatives` : adresse, latitude, longitude facultatives dans le contrat et l'entité (`relatives/contracts/relative.contract.ts`, `entities/saved-relative.entity.ts`) ; le passage en caisse « Livrer à un proche » garde son exigence d'adresse et de point
- [X] T017 [US1] `family-funding.service.ts` : recharge par carte via `TopupService.initiate(userId, amount, 'family')` — ajouter la cible `'family'` dans `wallet/topup.service.ts` `resolveOwner` (payeur seulement), bornes 1 000–500 000 (`FAMILY_TOPUP_AMOUNT`) ; après `settleFromProvider` d'une recharge famille, appeler le notifier
- [X] T018 [US1] `family-funding.service.ts` `transferFromPersonal(payerId, amount)` : débit `FAMILY_TRANSFER_OUT` du personnel et crédit `FAMILY_TRANSFER_IN` du famille dans une seule `em.transactional`
- [X] T019 [US1] `family-notifier.service.ts` : SMS + push à l'ajout d'un membre actif, SMS d'invitation à un membre en attente (lien `${PUBLIC_SITE_URL}`), push aux membres actifs après recharge (montant dépensable de chacun) ; ne lève jamais
- [X] T020 [US1] `family-wallet.controller.ts` : `GET/POST/PATCH /family-wallet`, `POST /family-wallet/members`, `POST /family-wallet/topups`, `POST /family-wallet/topups/:id/verify`, `POST /family-wallet/transfer`
- [X] T021 [P] [US1] Test e2e `apps/api/src/modules/family-wallet/tests/family-wallet-setup.e2e-spec.ts` : ouverture unique, ajout depuis le carnet et nouveau proche, membre actif vs en attente, payeur refusé, doublon refusé, virement atomique (personnel insuffisant → rien ne bouge)

### Mobile (payeur)

- [X] T022 [US1] `apps/mobile/src/features/family-wallet/family-wallet-api.ts` (appels typés à la main, codes d'erreur traduits)
- [X] T023 [US1] `components/family-wallet-screen.tsx` : état « pas encore ouvert » avec explication et bouton ; sinon solde (devise + FCFA), membres (statut, dépense du mois / plafond en jauge doublée de texte), boutons « Recharger » et « Ajouter un proche »
- [X] T024 [US1] `components/add-family-member-screen.tsx` : liste du carnet + « Nouveau proche » (nom, `+229`, `ContactPickButton` de 009, adresse facultative)
- [X] T025 [US1] Recharge : feuille réutilisant `PaymentWebView` et `awaitSettlement` comme `wallet-screen.tsx`, avec l'onglet « Depuis mon portefeuille eBio » ; montants avec équivalent en devise
- [X] T026 [US1] Entrée « Portefeuille famille » dans `profile/components/profile-screen.tsx` (masquée si `family_wallet_enabled` est faux) et routes dans `src/app/navigation.tsx` (modifications locales minimales)

---

## Phase 4 — US2 + US3 : payer et limiter (P1)

**Test indépendant** : quickstart §2, §3 et §4.

### API

- [X] T027 [US2] `family-payment.service.ts` `optionsFor(buyerId, total, productCategoryIds)` : pour chaque membre actif d'un portefeuille actif dont l'acheteur est le compte, `{ memberId, payerFirstName, spendable, usable, reason, blockedProductIds }`
- [X] T028 [US2] `CheckoutService.preview` (`orders/checkout.service.ts`) : charger `category` des produits (`groupBySupplier`), renvoyer `familyWallets`
- [X] T029 [US2] `family-payment.service.ts` `pay(em, buyer, checkout, orders, memberId)` : dans la transaction du passage en caisse, verrouiller le portefeuille (`WalletService` débit), recalculer limites et dépense **après** le verrou, refuser `FAMILY_WALLET_REFUSED` + `reason`, débiter `ORDER_PAYMENT` avec `familyMemberId`, écrire les `Payment` en `ESCROW` comme `payFromWallet`, poser `checkout.familyMember`
- [X] T030 [US2] `CheckoutService.create` : branche `FAMILY_WALLET` (refus `FAMILY_WALLET_WITH_RECIPIENT` pour une commande destinée à un proche) ; e-mail et notifications comme pour le portefeuille personnel
- [X] T031 [US2] `family-payment.service.ts` `refundTargetWallet(checkout)` : portefeuille famille non fermé, sinon portefeuille personnel du payeur ; l'utiliser dans `payments/compensation.service.ts` (L111, L132) et `deliveries/deliveries.service.ts` (L1054-1061), en portant `familyMemberId` sur la ligne `REFUND` quand la cible est le portefeuille famille
- [X] T032 [US2] Après un achat : push `FAMILY_WALLET_PURCHASE` au payeur ; alerte `FAMILY_WALLET_LOW_BALANCE` au franchissement du seuil (drapeau `low_balance_alerted`, remis à faux quand le solde repasse au-dessus)
- [X] T033 [P] [US2] Test e2e `tests/family-wallet-payment.e2e-spec.ts` : paiement complet, solde insuffisant refusé, commande annulée → solde et dépense du mois rétablis, fermeture puis annulation → personnel du payeur, commande pour un proche refusée
- [X] T034 [P] [US2] Test e2e `tests/family-wallet-concurrency.e2e-spec.ts` : deux membres paient 3 000 en parallèle sur 5 000 → un seul succès, solde 2 000 ; même membre, deux commandes simultanées sous plafond de 4 000 → une seule
- [X] T035 [US3] `family-members.service.ts` `updateLimits(memberId, limits)` ; `PATCH /family-wallet/members/:id` ; `family-wallets.service.ts` `updateDefaults` valide (montants > 0, liste de catégories non vide ou null)
- [X] T036 [P] [US3] Test e2e `tests/family-wallet-limits.e2e-spec.ts` : défaut 2 000 / propre 4 000, refus mensuel puis réussite le mois suivant (horloge simulée), maximum par commande, catégorie interdite avec produits signalés, modification de limites sans effet sur une commande passée

### Mobile (membre et passage en caisse)

- [X] T037 [US2] `cart/components/checkout-flow.tsx` : option « Portefeuille famille (Awa) — X FCFA disponibles » par portefeuille de `familyWallets` ; grisée avec la raison en clair (« Il vous reste 2 000 FCFA ce mois-ci », « Ces produits ne sont pas autorisés : … ») ; envoie `paymentMethod: 'FAMILY_WALLET'`, `familyMemberId` ; masquée pour une commande destinée à un proche
- [X] T038 [US3] `components/family-limits-screen.tsx` : limites par défaut et limites propres d'un membre (« Comme pour tous » / valeur), sélection des catégories, montants avec équivalent en devise

---

## Phase 5 — US4 : suivi (P1)

- [X] T039 [US4] `family-wallets.service.ts` `transactions(payerId, memberId?, page)` : contrat §3, produits et boutique de l'achat, jamais d'adresse ni de message ; `GET /family-wallet/transactions`
- [X] T040 [US4] `family-member-view.controller.ts` : `GET /family-wallets/mine` et `GET /family-wallets/mine/:memberId/transactions` (ses achats seulement, jamais le solde total)
- [X] T041 [P] [US4] Test e2e `tests/family-wallet-privacy.e2e-spec.ts` : la réponse membre ne contient pas `balance` ; l'historique payeur ne contient aucune clé `address`, `latitude`, `message` ; filtre par membre exact
- [X] T042 [US4] `components/family-history-screen.tsx` (payeur, filtre par proche) et `components/member-wallets-section.tsx` dans `wallet/components/wallet-screen.tsx` (membre : dépensable, limites, ses achats)

---

## Phase 6 — US5 : contrôle (P2)

- [X] T043 [US5] `family-members.service.ts` : `suspend`, `resume`, `remove` (reste dans le carnet, historique conservé) ; routes `POST …/suspend|resume`, `DELETE …/:id`
- [X] T044 [US5] `family-wallets.service.ts` : `suspend`, `resume` (refus si suspendu par le back-office), `close` (débit `FAMILY_CLOSURE_OUT` du solde entier, crédit `FAMILY_CLOSURE_IN` du personnel, une transaction, statut `CLOSED`)
- [X] T045 [US5] Notifications `FAMILY_WALLET_STATUS` aux membres concernés
- [X] T046 [US5] `users/account-deletion.service.ts` `assertNothingPending` : `409 FAMILY_WALLET_OPEN` pour un payeur au portefeuille non fermé ; un membre qui supprime son compte passe `REMOVED`
- [X] T047 [P] [US5] Test e2e `tests/family-wallet-control.e2e-spec.ts` : membre suspendu sans option, les autres oui ; fermeture → personnel crédité une seule fois même rejouée ; suppression de compte refusée puis acceptée après fermeture
- [X] T048 [US5] Mobile : actions sur un membre (suspendre, réactiver, retirer avec confirmation) et sur le portefeuille (suspendre, fermer avec le montant restitué affiché) dans `family-wallet-screen.tsx`

---

## Phase 7 — US6 : invitation (P2)

- [X] T049 [US6] `auth/otp-auth.service.ts` `registerWithPhone` : appeler `FamilyMembersService.linkPendingByPhone(userId, phone)` (membres `PENDING` de ce numéro → `ACTIVE`), push `FAMILY_WALLET_MEMBER_JOINED` au payeur
- [X] T050 [US6] `POST /family-wallet/members/:id/invite` (une fois par 24 h) ; `family-pending.scheduler.ts` : cron quotidien `@SingleInstance`, membres en attente depuis 30 jours sans rappel → push au payeur, `pending_reminded_at`
- [X] T051 [P] [US6] Test e2e `tests/family-wallet-invite.e2e-spec.ts` : inscription par SMS rattache, numéro saisi au profil ne rattache pas, rappel une seule fois
- [X] T052 [US6] Mobile : membre en attente avec « Renvoyer l'invitation » dans `family-wallet-screen.tsx`

---

## Phase 8 — Back-office et finitions

- [X] T053 `wallet/admin-wallets.service.ts` : type `FAMILY` (jointure `family_wallets` → nom du payeur) et filtre `ownerType=FAMILY`
- [X] T054 `admin-family-wallets.controller.ts` : liste, détail, suspension / réactivation du portefeuille ou d'un membre avec motif, trace d'audit (`AuditModule`), `suspended_by_admin`
- [X] T055 `pnpm generate` (API temporaire sur un port libre si l'API locale est ancienne, cf. mémoire)
- [X] T056 [P] `apps/web-spa/app/features/admin/family-wallets/pages/admin-family-wallets-page.tsx` et `admin-family-wallet-detail-page.tsx` ; type « Famille » dans `wallets/pages/admin-wallets-page.tsx` ; entrée de menu sous « Argent » ; i18n fr/en
- [X] T057 [P] Interrupteur `family_wallet_enabled` dans la page Réglages du back-office
- [X] T058 CGU et confidentialité (`apps/landing/app/routes/cgu.tsx`, `confidentialite.tsx`) : portefeuille famille, argent récupérable par le payeur, aucun retrait d'espèces
- [X] T059 `./node_modules/.bin/eslint` sur les fichiers touchés, `pnpm --filter api test`, `pnpm build`, `npx tsc --noEmit` dans `apps/mobile`
- [ ] T060 Dérouler `quickstart.md` sur le téléphone de test ; `/design-review` des pages back-office

---

## Dépendances

```
Phase 1 → Phase 2 → US1 → (US2 + US3) → US4
                      └──→ US5, US6 (après US1)
Phase 8 après les histoires qu'elle expose
```

- `checkout-flow.tsx` : T037 seul ; `family-wallet-screen.tsx` : T023, T048, T052 en série.
- `orders/checkout.service.ts` : T028, T030 en série ; `compensation.service.ts` : T031.

## Exemples de parallélisation

- Socle : T005, T006, T007, T008, T009 ensemble ; T011 dès T010.
- Tests e2e T033, T034, T036, T041, T047, T051 sur des fichiers distincts.
- Mobile payeur (T022-T026) pendant l'API de US2.

## Stratégie de livraison

1. **MVP = Phases 1-2 + US1 + US2 + US3** : un payeur alimente, ses proches paient dans leurs limites. Livré **désactivé** (`family_wallet_enabled` faux) tant que la validation juridique n'est pas faite.
2. **+ US4** : transparence (déjà indispensable au lancement réel).
3. **+ US5, US6, back-office** avant l'activation en production.
