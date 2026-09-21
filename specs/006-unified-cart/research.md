# Phase 0 — Recherche et décisions d'architecture

**Feature**: 006-unified-cart · **Date**: 2026-09-21

Aucun marqueur `NEEDS CLARIFICATION` ne subsistait dans la spec à l'entrée de
cette phase : les quatre décisions produit ont été tranchées en session de
clarification. Cette phase traite les inconnues **techniques**, toutes issues
de l'état réel du dépôt.

---

## D1 — Comment un paiement unique couvre-t-il N commandes ?

**Contrainte constatée** : `Payment` est propriétaire d'un `@OneToOne(Order)`.
Autour de ce lien vivent l'escrow (`released_at`, `refunded_at`,
`escrow-scheduler.service.ts`), les reçus (`receipt.service.ts`), les webhooks
du prestataire et le calcul de commission (`commission.service.ts`).

**Décision** : introduire un **Checkout** qui porte la transaction unique du
prestataire et regroupe N `Payment`, chacun restant 1-1 avec sa commande.

**Rationale** : l'escrow raisonne par commande — il libère les fonds d'une
commande quand acheteur et fournisseur ont confirmé, ou au bout du délai. C'est
exactement le comportement voulu en multi-boutiques : chaque boutique est payée
au rythme de *sa* commande, pas au rythme de la plus lente. Conserver
`Payment` par commande préserve ce mécanisme sans y toucher, ainsi que les
reçus et la commission. Le Checkout ne porte que ce qui est réellement commun :
l'identifiant de transaction, le moyen de paiement, le montant total encaissé.

**Alternatives écartées** :

- *Rendre `Payment.order` nullable et le rattacher au checkout* — casse
  l'escrow, les reçus et la commission d'un coup, pour ne gagner qu'une table.
- *Une commande parente* — explicitement refusée côté produit, et elle
  obligerait à reprendre tous les écrans fournisseur.
- *N paiements réels chez le prestataire* — contredit la décision produit d'un
  paiement unique, et multiplie les frais de transaction.

---

## D2 — Comment dédommager quand une boutique refuse ?

**Contrainte constatée** : le Mobile Money (MTN, Moov) ne sait ni geler des
fonds ni en rendre une partie. `Wallet` est polymorphe — `user_id`,
`supplier_id`, `courier_profile_id`, ou un compte plateforme — donc un acheteur
peut déjà en posséder un, et `WalletTransactionType` contient déjà `REFUND`.

**Décision** : créditer le portefeuille eBio de l'acheteur, montant exact de la
commande refusée, avec retrait possible par les mécanismes existants
(`withdrawal-request.entity.ts`, `payout-number.entity.ts`).

**Rationale** : immédiat pour l'acheteur, aucune dépendance à une capacité que
le prestataire n'a pas, et zéro entité nouvelle. C'est la décision produit
Q1 de la session de clarification.

**Alternatives écartées** :

- *Remboursement partiel chez le prestataire* — techniquement indisponible en
  Mobile Money, qui est le moyen de paiement majoritaire ici.
- *Capture différée jusqu'à confirmation de toutes les boutiques* — même
  indisponibilité, et l'acheteur attendrait sans savoir si sa commande passe.

---

## D3 — Comment une course dessert-elle plusieurs boutiques ?

**Contrainte constatée** : `Delivery` porte un `@OneToOne(Order, { unique: true })`,
garanti par un index unique en base. Le `dispatch.service.ts` raisonne
entièrement par `deliveryId` : `findEligibleCouriers`, `rankCandidates`,
`startDispatch`, `offerNext`, `respondToOffer`, avec un cron toutes les
30 secondes et une bascule ciblé → diffusion large.

**Décision** : introduire une **DeliveryRun** regroupant N `Delivery`. Chaque
livraison reste 1-1 avec sa commande ; la tournée devient l'unité de diffusion,
d'acceptation et de rémunération.

**Rationale** : le statut par commande, les événements de livraison, la preuve
de remise et les écrans fournisseur continuent de fonctionner sans retouche.
Le dispatch monte d'un cran — il classe des livreurs pour une tournée au lieu
d'une course — mais sa logique d'éligibilité (zone, position GPS récente,
dette) se transpose en prenant le **premier point de collecte** comme origine.

**Alternatives écartées** :

- *`Delivery` pointant sur plusieurs commandes* — casse l'index unique, le
  statut par commande et la preuve de remise ; toute l'app livreur serait à
  reprendre.
- *N livraisons diffusées séparément avec une préférence pour le même livreur* —
  aucune garantie de regroupement, donc un frais unique impossible à tenir.

---

## D4 — Sur quoi le tarif de livraison d'une tournée se calcule-t-il ?

**Contrainte constatée** : `computeDeliveryFee` (`common/delivery-fee.ts`)
prend une distance unique et un `hasShopPosition`, et connaît les modes `FLAT`,
`DISTANCE`, `ZONE`, plus les motifs `NO_POSITION`, `NO_SHOP_POSITION`,
`OUT_OF_RANGE`.

**Décision** : alimenter la fonction avec la distance de la **tournée complète**
— somme des tronçons collecte à collecte, puis dernier point de collecte à
l'adresse de livraison — et non la somme des distances boutique-acheteur.

**Rationale** : c'est la distance que le livreur parcourt réellement, donc la
seule base honnête pour le tarif comme pour sa rémunération. La fonction elle-
même ne change pas de forme ; seule son entrée est calculée autrement.

**Point d'attention** : `NO_SHOP_POSITION` reste possible si une boutique de la
tournée n'est pas localisée. Le correctif de `db18b82` a établi que ce motif
n'est pas bloquant et applique le forfait ; ce comportement doit être conservé
au niveau tournée.

---

## D5 — Comment le panier mobile perd-il ses groupes sans perdre son contenu ?

**Contrainte constatée** : `CartState.groups: SupplierCartGroup[]`, persisté
sous la clé `ebio_cart`, avec un `deliveryMode` **par groupe**.

**Décision** : passer à une liste d'articles à plat, chaque article conservant
`supplierId` et `supplierName` pour l'affichage, et remonter `deliveryMode` au
niveau du panier. Une hydratation de compatibilité aplatit l'ancien format au
premier lancement.

**Rationale** : la spec exige que les paniers en cours survivent à la mise à
jour. L'aplatissement est déterministe ; en cas de modes divergents entre
anciens groupes, on retient la livraison, qui est le mode par défaut du code
actuel et le moins surprenant.

**Alternatives écartées** :

- *Vider les paniers à la migration* — perte de contenu, donc de commandes.
- *Conserver les groupes en interne et n'aplatir qu'à l'affichage* — laisse
  toute la logique par boutique en place, c'est-à-dire l'essentiel du problème.

---

## D6 — Que mesure-t-on pour poser plus tard les limites de regroupement ?

**Contrainte constatée** : la décision produit (Q3) est de ne poser **aucune
limite** en v1 et de les fixer à l'usage. Sans mesure, « à l'usage » n'a rien
sur quoi s'appuyer.

**Décision** : chaque tournée enregistre le nombre de boutiques, la distance
totale, et l'issue de la diffusion — acceptée par qui et après combien de
propositions, refusée, ou sans preneur au bout des 15 et 30 minutes de FR-022.

**Rationale** : ce sont les trois variables dont dépendra le seuil. Les
enregistrer coûte trois colonnes et une ligne à l'acceptation ; ne pas les
enregistrer condamne à choisir les limites au doigt mouillé.
