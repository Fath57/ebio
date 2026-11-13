# Phase 0 — Recherche : terroir vers l'étranger

Lu dans le code, pas supposé. Chemins relatifs à `apps/api/src/modules/` sauf
mention. Aucun code d'expédition, d'agence, d'international ou d'assurance
n'existe : tout ce qui touche au transport est neuf.

## 1. Une commande terroir ne doit jamais aller au livreur local

Tous les crochets de livraison locale testent `pickupMode === PickupMode.DELIVERY`
(`orders/orders.service.ts` : `updateStatus` L624-650 → `scheduleForOrder`,
`applyStatus` L760-797 → `createForOrder` / `closeForOrder`).

**Décision** : une troisième valeur `PickupMode.EXPORT`. Les crochets locaux ne
se déclenchent pas ; aucune garde supplémentaire à semer. Migration : contrainte
CHECK de `orders.pickup_mode` (et `checkouts.delivery_mode`) régénérée.
**Écarté** : `ON_SITE` (faux : la boutique ne remet pas au client) ; un champ
« canal » séparé (il faudrait le tester partout).

## 2. Payer la boutique à la collecte

`EscrowScheduler.releaseIfDue` (`payments/escrow-scheduler.service.ts` L71) exige
`order.status === DELIVERED`, et `escrowReleaseAt` compte depuis `deliveredAt`
(`payments/escrow-release-policy.ts`).

**Décision** : quand eBio confirme la collecte des produits d'une boutique, la
commande de cette boutique passe `DELIVERED` (`deliveredAt` = heure de collecte)
et le séquestre est libéré **immédiatement** : `effectiveDelays` renvoie 0 pour
une commande `EXPORT`, quel que soit le délai de la boutique. La boutique voit
« Remise à eBio ». Le client, lui, ne voit jamais ce statut : son écran suit le
**colis** (§4). `confirm-delivery` est refusé pour une commande `EXPORT`.

## 3. Le transport ne doit pas être crédité à la boutique

`payments/supplier-share.ts` ne retire `deliveryFee` de la part boutique que si
`deliveredByCourier`. Un transport rangé dans `order.deliveryFee` serait donc
**versé à la boutique**.

**Décision** : `order.deliveryFee = 0` pour toute commande `EXPORT`. Transport,
supplément domicile et assurance vivent sur le colis (`export_shipments`) et
dans le total du passage en caisse. À la confirmation du paiement, eBio les
porte sur un compte plateforme dédié (`wallets.platform_account = 'EXPORT'`,
même mécanisme que les comptes de revenus existants) ; eBio règle les agences
hors application.

## 4. Le colis et son suivi

**Décision** : un **colis** par passage en caisse terroir (un client, un départ,
une adresse ou un point de retrait), qui regroupe les commandes de plusieurs
boutiques. Tables `export_shipments` et `export_shipment_events` (étape
standard ou message libre, auteur, date). Étapes standard : `PAID`,
`COLLECTING`, `PACKED`, `DROPPED_AT_AGENCY`, `DEPARTED`, `ARRIVED`,
`READY_FOR_PICKUP`, `OUT_FOR_DELIVERY`, `HANDED_OVER` ; plus `LOST`, `DAMAGED`,
`CANCELLED`. L'étape courante est dénormalisée sur le colis.

Le passage en caisse terroir **autorise plusieurs boutiques** (le colis les
regroupe) : un service `TerroirCheckoutService` à part, qui réutilise
`OrdersService.create(…, checkoutContext)` avec `pickupMode: EXPORT` et
`deliveryFee: 0`, et le gel de devise (`ExchangeRatesService.freeze`).
`CheckoutService.assertSingleShop` (L158) et le devis de livraison locale
(`deliveryPricing.quoteCart`, qui exige des coordonnées au Bénin) ne sont pas
concernés.

## 5. Agences, points de retrait, départs, tarifs

Tables neuves : `export_agencies`, `export_pickup_points` (agence, pays, ville,
adresse, horaires), `export_departures` (agence, dates, délai min–max, capacité
kg, statut), `export_departure_rates` (départ, pays, prix au kilo, minimum
facturé en kg, poids max, supplément domicile — `null` = pas de domicile).

**Prix du transport** = `max(poids estimé, minimum) × prix au kilo`, arrondi au
franc ; affiché en euros par le module devise. Droits et taxes inclus (spec
FR-014) : aucun calcul de douane.

**Poids estimé** = Σ poids emballés × quantités + emballage forfaitaire (réglage,
300 g par défaut).

**Départs proposés** : statut `OPEN`, pays desservi, poids ≤ max, kilos réservés
+ poids ≤ capacité, `deposit_deadline − délai de collecte` (réglage, 3 jours)
dans le futur. Tri par date de départ.

**Remplissage** : kilos réservés = Σ poids réel (ou estimé) des colis non
annulés du départ. Alerte à 80 % (une fois, colonne `fill_alerted_at`) ; à
100 % le départ passe `FULL`. Le contrôle de capacité se fait dans la
transaction de paiement, après un verrou `SELECT … FOR UPDATE` sur le départ —
même méthode que le portefeuille famille (010).

## 6. Produits exportables

`Product` n'a pas de poids (`unit` est un code texte, `products/entities/product.entity.ts`
L88) mais a déjà une composition (`ingredients`, `allergens`, `labels`, `origin`
texte, `conservation`, L110-133) et une modération eBio (`moderationStatus`).

**Décision** : une table `export_profiles` (1–1 avec le produit) : statut
(`PENDING`, `APPROVED`, `REJECTED`), poids emballé (g), dimensions (cm), durée
de conservation (jours), origine structurée (producteur, commune/région, année,
mode de fabrication, 1–3 photos), photo d'étiquette, liste de contrôle
(JSON : clé → coché), agent, date, motif. La composition reste sur le produit ;
un changement de composition ou de poids repasse le profil en `PENDING`
(crochet dans `ProductsService.update`).

**Variantes** : un produit exportable porte un poids pour l'unité ; une variante
« pack de N » pèse N × ce poids. Pas de poids par variante en v1.

**Photos** : URLs comme `Product.photos` (contexte média `PRODUCT_PHOTO`,
public). Photo d'étiquette : même contexte (elle est déjà sur l'emballage).

**Catégories interdites** : réglage plateforme `export_banned_category_ids`.

## 7. Packs terroir

Il n'existe qu'un « pack de N » d'un même produit (`ProductVariant.packSize`).
**Décision** : tables `export_packs` (auteur boutique ou `null` = eBio, nom,
description, photos, prix, statut de validation) et `export_pack_items`
(produit, variante facultative, quantité).

**Achat d'un pack** : le panier envoie le pack ; le serveur le **déplie** en
lignes ordinaires par boutique (au prix boutique) dans les commandes du colis.
Pack boutique : le prix du pack est la somme de ses lignes, la remise éventuelle
étant portée comme une remise de la boutique. Pack eBio : chaque boutique est
payée au prix de ses produits ; l'écart (prix du pack − somme des lignes) est
une **compensation plateforme** si négatif (mécanisme existant
`platformPromoCompensation`, crédité à la boutique à la libération du séquestre)
ou un revenu du compte `EXPORT` si positif.

## 8. Remboursements

Règle existante : `compensateOrder` crédite le portefeuille personnel de
l'acheteur (`payments/compensation.service.ts`). Ajouts :
- **produit manquant à la collecte** : ligne retirée de la commande, crédit
  du produit + part de transport recalculée (poids allégé) ;
- **colis perdu ou abîmé** : remboursement des produits et du transport ;
  la boutique, déjà payée, n'est pas débitée — le compte `EXPORT` porte la
  perte ; si le colis est assuré, l'assurance encaissée la couvre (suivi séparé).

## 9. Écart de poids

Seuil réglable (`export_weight_tolerance_pct`, 10). Au-delà : le colis passe
« complément demandé », le client est prévenu et choisit (paiement du
complément par une demande de paiement INTRAM, comme une recharge ; ou retrait
d'un produit). Sans réponse sous 48 h (cron), eBio absorbe et le colis continue.

## 10. Pays de livraison du client

`User` n'a pas de pays ; `isAbroad()` mobile se fonde sur le fuseau. **Décision** :
le pays (FR, BE) est choisi dans l'espace Terroir (pré-rempli d'après le fuseau
`Europe/Paris` / `Europe/Brussels`), gardé localement, et **porté par le colis**
(`export_shipments.country`). Pas de colonne utilisateur en v1.

## 11. Côté mobile

Un seul panier (`features/cart/cart-context.tsx`, `ebio_cart`, synchronisé avec
`PUT /api/cart`, table `carts` unique par utilisateur). **Décision** : un
contexte `terroir-cart-context` séparé (`ebio_terroir_cart`, sans synchronisation
serveur en v1). Le rappel des 48 h (FR-033) se fonde donc sur les **aperçus** de
passage en caisse terroir enregistrés (table `export_checkout_drafts` : client,
départ visé, date), pas sur le panier.

Espace Terroir : écran de la pile Accueil, accessible par une bannière et une
section de l'accueil (`home/home-section.entity.ts` gère déjà des sections
choisies au back-office).

## 12. Interrupteur

Réglage `terroir_export_enabled` (faux par défaut), même modèle que
`family_wallet_enabled` (010) : garde 403 `TERROIR_DISABLED` sur les routes
client, carte dans la section « Livraison » de la page Réglages.

## 13. Notifications

Types neufs (`notifications/notification.entity.ts` + audience + CHECK) :
`EXPORT_SHIPMENT_UPDATE`, `EXPORT_DEPARTURE_OPEN`, `EXPORT_DEADLINE_REMINDER`,
`EXPORT_WEIGHT_SUPPLEMENT`, `EXPORT_PRODUCT_REVIEWED` (boutique),
`EXPORT_DEPARTURE_FILL` (équipe). Destinataire d'un colis offert : e-mail (et SMS
s'il a un numéro +229) via un notifier dédié, comme le cadeau 009 — jamais de prix.
