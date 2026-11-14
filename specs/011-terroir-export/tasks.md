---

description: "Découpage exécutable — terroir vers l'étranger"
---

# Tasks: Module diaspora — Terroir vers l'étranger

**Input**: `/specs/011-terroir-export/` — plan.md, spec.md, research.md, data-model.md, contracts/terroir-export.md, quickstart.md
**Branch**: `011-terroir-export`

## Format: `[ID] [P?] [Story] Description`

- **[P]** : parallélisable — fichier distinct, aucune dépendance en attente.
- **[Story]** : US1 à US10 (spec.md).

**Tests** : obligatoires là où l'argent ou une capacité est en jeu — calculs
purs (poids, prix, marge, assurance, départs, remplissage, complément, packs),
capacité sous paiements simultanés, transport jamais crédité à une boutique,
versement à la collecte, remboursements (manquant, perdu, assuré), suivi
public sans prix. Le reste par le quickstart.

**Rappels** : pas de point-virgule, Zod v4, MikroORM 6 (dates nullables
`type: 'Date'`, numériques à convertir avec `Number()`), commentaires en
anglais, textes en français accentué avec vouvoiement, les 8 règles de lint de
`CLAUDE.md`. Lint depuis la racine : `./node_modules/.bin/eslint <fichiers>`.
Tests e2e dans `tests/`. Les tests construisent la base depuis les **entités** :
toute table neuve a son entité. Avant un `git push`, arrêter Metro/back-office/landing locaux.

---

## Phase 1 — Mise en place

- [X] T001 Migration `apps/api/src/modules/db/migrations/Migration20261117090000.ts` : les 11 tables de `data-model.md` §1–§3 avec leurs contraintes ; `PickupMode` `EXPORT` (CHECK `orders.pickup_mode`, `checkouts.delivery_mode`) ; `orders.export_pack_id` ; `PlatformAccount` `EXPORT` (CHECK `wallets.platform_account`) et ligne de portefeuille plateforme `EXPORT` (solde 0) ; types de mouvements (4) et de notifications (6) — CHECK régénérés depuis la liste complète, tout en `IF NOT EXISTS` / `DROP CONSTRAINT IF EXISTS`
- [X] T002 Script prod idempotent `apps/api/scripts/2026-11-17-terroir-export.sql`, rejoué deux fois sur une base jetable
- [X] T003 Appliquer en local (`../../node_modules/.bin/mikro-orm migration:up --only Migration20261117090000`)
- [X] T004 Réglages plateforme (`settings/platform-settings.service.ts`) : les 8 clés de data-model §5 avec validation ; `terroirExportEnabled` dans `GET /settings/public` ; garde `TerroirEnabledGuard` (403 `TERROIR_DISABLED`)

---

## Phase 2 — Socle

- [X] T005 [P] Entités `apps/api/src/modules/terroir/entities/*.entity.ts` (11), enums dans `contracts/terroir.contract.ts`
- [X] T006 [P] `PickupMode.EXPORT` (`orders/entities/order.entity.ts`, contrats) ; `PlatformAccount.EXPORT` et types de mouvements (`wallet/entities/*`, zod) ; types de notification + audiences (`notifications/*`)
- [X] T007 `apps/api/src/modules/terroir/terroir-math.ts` : `estimateWeight`, `shippingPrice`, `marginKg`, `insurancePrice`, `availableDepartures`, `fillRatio`, `supplementFor`, `packSplit` (data-model §8)
- [X] T008 [P] Test `terroir-math.spec.ts` : minimum facturé, arrondi, marge, assurance avec minimum, départ échu / plein / trop lourd exclu, seuil de complément à 10 %, pack eBio moins cher (compensation) et plus cher (marge)
- [X] T009 `terroir.module.ts` importé dans `app.module.ts` ; contrats Zod de `contracts/terroir-export.md`
- [X] T010 `payments/escrow-release-policy.ts` : délai 0 pour une commande `EXPORT` ; `orders.service.ts` `confirmDelivery` refuse `EXPORT` (400 `EXPORT_ORDER`) ; garde que les crochets de livraison locale ignorent bien `EXPORT` (test)
- [X] T011 [P] Test `orders/tests/export-pickup-mode.e2e-spec.ts` : une commande `EXPORT` passant PREPARING puis READY ne crée aucune livraison locale ; `confirm-delivery` refusé

---

## Phase 3 — US2 : agences et départs (P1)

**Test indépendant** : quickstart §1 ; seuls les départs ouverts, non échus et non pleins sont proposés.

- [X] T012 [US2] `export-logistics.service.ts` : CRUD agences, points de retrait, départs avec leurs tarifs par pays ; `cancel(departureId, reassignTo?)` (réaffectation, surcoût débité du compte `EXPORT`, client prévenu)
- [X] T013 [US2] `export-logistics.service.ts` : `reservedKg(departureId)`, remplissage, alerte 80 % une fois (`fill_alerted_at`), passage `FULL` à 100 %
- [X] T014 [US2] `admin-export.controller.ts` : routes agences, points de retrait, départs, annulation, détail d'un départ (remplissage, colis, liste de collecte) — `@Roles('ADMIN')`, `@CanManage`, audit des créations et annulations
- [X] T015 [P] [US2] Test e2e `terroir/tests/departures.e2e-spec.ts` : création avec tarifs FR/BE, départ échu exclu, plein exclu, annulation avec réaffectation et surcoût porté par `EXPORT`
- [ ] T016 [US2] Back-office `apps/web-spa/app/features/admin/terroir/pages/export-agencies-page.tsx` (agences + points de retrait) et `export-departures-page.tsx` (liste, création, tarifs par pays, jauge de remplissage en barre + texte) ; routes et menu « Terroir » ; i18n fr/en

---

## Phase 4 — US3 : produits exportables et packs (P1)

**Test indépendant** : quickstart §2.

- [X] T017 [US3] `export-catalog.service.ts` : `upsertProfile(supplierId, productId, input)` (refus `EXPORT_CATEGORY_BANNED`, statut `PENDING`), `removeProfile` ; crochet dans `ProductsService.update` : poids / composition / étiquette modifiés → `PENDING`
- [X] T018 [US3] `export-catalog.service.ts` : `review(productId, decision, checklist, reason, agentId)` — `APPROVE` exige toutes les clés de la liste (data-model §7) et la photo d'étiquette ; conserve agent et date ; notification `EXPORT_PRODUCT_REVIEWED`
- [X] T019 [US3] Packs : `createPack` / `updatePack` / `retirePack` (boutique : ses produits seulement, `EXPORT_PACK_FOREIGN_PRODUCT` ; eBio : multi-boutiques) ; validation des packs ; `isPackOrderable`
- [X] T020 [US3] `supplier-export.controller.ts` (routes boutique) et routes back-office de validation et de packs eBio dans `admin-export.controller.ts`
- [X] T021 [P] [US3] Test e2e `terroir/tests/export-catalog.e2e-spec.ts` : catégorie interdite, validation refusée sans liste complète, modification qui renvoie en validation, pack boutique avec un produit étranger refusé, pack non commandable si un produit n'est plus validé
- [X] T022 [US3] App Fournisseur : `apps/mobile/src/features/supplier-dashboard/components/export-profile-form.tsx` (« Vendre à l'étranger » depuis la fiche produit : poids, dimensions, conservation, origine, photos d'origine, photo d'étiquette, statut et motif) et `export-packs-screen.tsx` ; routes dans `navigation.supplier.tsx`
- [ ] T023 [US3] Back-office `export-reviews-page.tsx` (file de validation produits et packs, liste de contrôle à cocher, photo d'étiquette, motif de refus) et `export-packs-page.tsx` (packs eBio : composition multi-boutiques, prix, écart avec la somme affiché)

---

## Phase 5 — US1 : commander et suivre (P1) 🎯

**Test indépendant** : quickstart §3.

### API

- [ ] T024 [US1] `export-catalog.service.ts` `catalog(country, filters)` et fiches produit / pack pour le client (prix en devise, origine, badge) ; `GET /terroir/departures` (prochain départ + liste)
- [ ] T025 [US1] `terroir-checkout.service.ts` `preview(buyer, input)` : déplier les packs (`packSplit`), poids, départs proposables, prix figés, assurance, domicile, devise, suggestions de marge, lignes indisponibles ; enregistrer `export_checkout_drafts`
- [ ] T026 [US1] `terroir-checkout.service.ts` `create(buyer, input)` : dans une transaction — verrou `FOR UPDATE` du départ, recontrôle capacité et échéance (`DEPARTURE_UNAVAILABLE`), une commande `EXPORT` par boutique (`OrdersService.create` avec `checkoutContext`, `deliveryFee: 0`, compensation de pack eBio), checkout (total = produits + transport + domicile + assurance), colis `export_shipments` (prix figés, jeton de suivi), événement `PAID` après confirmation ; paiement portefeuille immédiat ou page INTRAM via le circuit existant
- [ ] T027 [US1] À la confirmation de paiement d'un checkout terroir (`payments.service.ts` `confirmCheckout` et débit portefeuille) : créditer le compte `EXPORT` (transport, domicile, assurance, marge de pack) ; colis `PAID` ; notification
- [ ] T028 [US1] `terroir-client.controller.ts` : catalogue, fiches, départs, aperçu, création, `GET /terroir/shipments`, `GET /terroir/shipments/:id` — garde `TerroirEnabledGuard` (sauf le suivi des colis déjà payés)
- [ ] T029 [P] [US1] Test e2e `terroir/tests/terroir-checkout.e2e-spec.ts` : multi-boutiques → un colis, commandes `EXPORT` à frais de livraison nuls, total exact, prix figé malgré un changement de tarif, **la part boutique n'inclut jamais le transport**, compte `EXPORT` crédité
- [ ] T030 [P] [US1] Test e2e `terroir/tests/departure-capacity.e2e-spec.ts` : deux paiements simultanés qui dépasseraient la capacité → un seul passe

### Mobile (app Client)

- [ ] T031 [US1] `apps/mobile/src/features/terroir/terroir-api.ts` et `terroir-cart-context.tsx` (`ebio_terroir_cart`, lignes produit ou pack, pays FR/BE pré-rempli d'après le fuseau)
- [ ] T032 [US1] `components/terroir-home-screen.tsx` : choix du pays, catalogue (produits et packs, badge), entrée depuis l'accueil (bannière) ; masqué si l'interrupteur est faux
- [ ] T033 [US1] `components/terroir-product-screen.tsx` (photos, prix en euros, composition, conservation, origine) et ajout au panier terroir
- [ ] T034 [US1] `components/terroir-checkout-screen.tsx` : départs (le plus proche présélectionné, date, fenêtre d'arrivée, prix, « droits et taxes inclus »), point de retrait, paiement carte (page hébergée, `PaymentWebView`) ou portefeuille, récapitulatif en euros et FCFA
- [ ] T035 [US1] `components/shipments-list.tsx` et `shipment-screen.tsx` : étape courante, historique daté, adresse et horaires de retrait ; entrée depuis l'onglet Commandes

---

## Phase 6 — US4 + US5 : préparer, expédier, suivre (P2)

**Test indépendant** : quickstart §4.

- [ ] T036 [US4] Côté boutique : une commande `EXPORT` affiche « à remettre à eBio avant le … » ; l'action finale est « Prête pour la collecte » (`READY`) — app Fournisseur `supplier-dashboard/components/order-detail-screen.tsx` et API (date de collecte = échéance du départ − délai de collecte)
- [ ] T037 [US4] `export-shipments.service.ts` `collect(shipmentId, supplierId)` : commande de la boutique → `DELIVERED` (heure de collecte), séquestre libéré immédiatement ; colis `COLLECTING` puis `PACKED` quand toutes les boutiques sont collectées
- [ ] T038 [US4] `missing(shipmentId, orderItemId)` : ligne retirée, client remboursé du produit et de la part de transport recalculée ; colis continue
- [ ] T039 [US4] `weigh(shipmentId, actualWeightG)` : complément via `supplementFor` ; au-delà du seuil, colis `REQUESTED` + notification ; `POST /terroir/shipments/:id/supplement` (payer via page INTRAM comme une recharge, ou retirer un produit) ; cron 48 h → `WAIVED`, perte portée par `EXPORT`
- [ ] T040 [US4] Liste du départ `GET /admin/export/departures/:id/manifest` (HTML imprimable : colis, destinataire, ville, contenu, quantités, valeur déclarée en euros, poids)
- [ ] T041 [US5] `addEvent(shipmentId, step?, message?, pickupPoint?)` et `addDepartureEvent(departureId, step, message?)` (tous les colis en une requête) ; `handedOver`, `lost(damaged)` (remboursement produits + transport, boutique non débitée, perte sur `EXPORT`, assurance suivie)
- [ ] T042 [US5] `terroir-notifier.service.ts` : notification à chaque événement (push + e-mail) ; colis offert : destinataire par e-mail / SMS +229, sans prix (US10) ; `terroir.scheduler.ts` : rappel de retrait à 14 j
- [ ] T043 [P] [US4] Test e2e `terroir/tests/shipment-flow.e2e-spec.ts` : collecte → portefeuille boutique crédité immédiatement de sa seule part ; manquant remboursé ; complément demandé au-delà de 10 % et absorbé à 48 h ; colis perdu remboursé, boutique non débitée ; étape de départ appliquée à tous les colis
- [ ] T044 [US4] Back-office `export-departure-detail-page.tsx` : jauge, liste de collecte par boutique (« Collecté »), pesée, étape pour tout le départ, liste imprimable ; `export-shipment-page.tsx` : événements, message libre, manquant, perte, remise
- [ ] T045 [US5] App Client : complément de poids dans `shipment-screen.tsx` (payer ou retirer un produit, échéance)

---

## Phase 7 — US7 à US10 : calendrier, poids, origine, cadeau (P2)

- [ ] T046 [US7] Alertes de départ : `POST/DELETE /terroir/departure-alerts` ; à l'ouverture d'un départ, envoi une fois aux inscrits du pays ; `terroir.scheduler.ts` : rappel 48 h avant l'échéance pour les aperçus non payés (`export_checkout_drafts`)
- [ ] T047 [US7] App Client : bandeau du prochain départ et liste des départs dans `terroir-home-screen.tsx` ; « Me prévenir du prochain départ » quand il n'y en a pas
- [ ] T048 [US8] App Client `components/terroir-cart-screen.tsx` : poids, minimum facturé, marge sans surcoût et suggestions (données de l'aperçu) ; prix du kilo supplémentaire au-delà
- [ ] T049 [US9] Origine et badge : déjà portés par T017/T024 ; affichage complet dans `terroir-product-screen.tsx` et origine de chaque produit d'un pack
- [ ] T050 [US10] Colis offert : champs `gift` du passage en caisse, départs vers le pays du destinataire, `GET /terroir/tracking/:token` public sans prix (`@Public`, limite de débit élevée — la landing appelle depuis son serveur), payeur prévenu à la remise
- [ ] T051 [US10] Landing `apps/landing/app/routes/colis.tsx` : suivi public du colis offert (étapes, adresse de retrait, message du payeur, jamais de prix) ; route `colis/:token`
- [ ] T052 [P] [US10] Test e2e `terroir/tests/gift-tracking.e2e-spec.ts` : la réponse publique ne contient aucune clé de prix ni de montant
- [ ] T053 [US10] App Client : « Offrir à quelqu'un » dans `terroir-checkout-screen.tsx` (nom, e-mail, téléphone, pays, message)

---

## Phase 8 — US6 + options : domicile, assurance (P3)

- [ ] T054 [US6] Livraison à domicile : proposée seulement si le tarif du départ a un supplément pour le pays ; adresse saisie ; étape `OUT_FOR_DELIVERY`
- [ ] T055 [US6] Assurance : case au passage en caisse avec son prix ; colis assuré perdu → remboursement intégral ; montants assurés et pertes suivis à part (vue back-office)
- [ ] T056 [P] Test e2e `terroir/tests/insurance-home.e2e-spec.ts` : domicile indisponible refusé (`HOME_DELIVERY_UNAVAILABLE`), prix de l'assurance avec minimum, remboursement d'un colis assuré

---

## Phase 9 — Finitions

- [ ] T057 Carte « Terroir vers l'étranger » dans la section Livraison de la page Réglages (`settings-registry.tsx`) : interrupteur, emballage, délai de collecte, seuil de poids, assurance, catégories interdites, rappel de retrait
- [ ] T058 Comptes plateforme : le compte `EXPORT` visible dans Argent → Comptes ; colonne de solde
- [ ] T059 CGU et confidentialité (`apps/landing/app/routes/cgu.tsx`, `confidentialite.tsx`) : terroir, droits et taxes inclus, remboursement sans retour, assurance
- [ ] T060 `pnpm generate` (API temporaire sur un port libre) ; lint, `pnpm --filter api test`, `pnpm build`, `npx tsc --noEmit` dans `apps/mobile`
- [ ] T061 Dérouler `quickstart.md` ; `/design-review` des pages back-office et de la page `colis/:token`

---

## Dépendances

```
Phase 1 → Phase 2 → US2 → US3 → US1 → (US4 + US5) → US7–US10 → US6
Phase 9 en continu à partir de US1
```

- `orders.service.ts` : T010 puis T036 ; `payments.service.ts` : T027.
- `terroir-checkout.service.ts` : T025, T026, T050, T054, T055 en série.
- `export-shipments.service.ts` : T037, T038, T039, T041 en série.

## Exemples de parallélisation

- Socle : T005, T006 ensemble ; T008 dès T007 ; T011 dès T010.
- Tests e2e T015, T021, T029, T030, T043, T052, T056 sur des fichiers distincts.
- App Fournisseur (T022) et back-office (T016, T023) pendant l'API de US1.

## Stratégie de livraison

1. **Socle + US2 + US3** : eBio peut préparer agences, départs, produits et packs, interrupteur fermé.
2. **+ US1** : premier livrable — commander, payer, suivre.
3. **+ US4/US5** : préparation et versement à la collecte — indispensables avant l'ouverture réelle.
4. **+ US7–US10, US6** : enrichissements ; ouverture aux clients une fois les accords avec les agences signés.
