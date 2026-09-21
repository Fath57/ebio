# Feature Specification: Panier unifié multi-boutiques avec dispatch serveur

**Feature Branch**: `006-unified-cart`
**Created**: 2026-09-21
**Status**: Draft
**Input**: User description: "Panier unifié multi-boutiques avec dispatch serveur : un panier unique, un seul passage en caisse, un paiement réparti, une course groupée, N commandes indépendantes."

## Vue d'ensemble

Le panier de l'application client est aujourd'hui découpé par boutique : l'acheteur qui compose un panier chez trois fournisseurs voit trois blocs, appuie sur trois boutons de commande, remplit trois fois son adresse, paie trois fois et reçoit trois livraisons. Chaque boutique ajoutée est une friction de plus, ce qui pousse l'acheteur à se limiter à une seule — exactement l'inverse de ce qu'une place de marché doit encourager.

La cible : **un panier, un passage en caisse, une livraison**. La répartition entre boutiques devient l'affaire de la plateforme et cesse d'être celle de l'acheteur.

Côté vendeur, rien ne change : chaque boutique continue de recevoir sa commande, son chat et son suivi comme aujourd'hui. Le regroupement vit au-dessus des commandes, pas à leur place.

## Clarifications

### Session 2026-09-21

- Q: En cas de refus d'une boutique après encaissement, comment l'acheteur est-il remboursé ? → A: Encaisser tout de suite, créditer la part refusée sur le portefeuille eBio de l'acheteur, avec retrait possible.
- Q: Le paiement en espèces à la livraison reste-t-il possible sur un panier multi-boutiques ? → A: Oui, avec le plafond appliqué au total de la tournée et non à chaque commande.
- Q: Quelles limites au regroupement des boutiques dans une tournée ? → A: ~~Aucune limite en v1~~ — **révisé en seconde passe, voir ci-dessous**.
- Q: Que se passe-t-il quand aucun livreur n'accepte une tournée ? → A: Alerte du back-office à 15 minutes pour attribution manuelle, puis à 30 minutes la décision revient à l'acheteuse — attendre ou annuler et être créditée.

### Session 2026-09-21 (seconde passe)

Revient sur la troisième réponse ci-dessus, à la lumière de ce que font les
plateformes comparables : Uber Eats n'accepte que deux commerces proches l'un
de l'autre, DoorDash n'autorise qu'une seule boutique d'appoint et **bascule
sur deux livreurs** quand le lot n'a pas de sens.

- Q: Faut-il finalement limiter le regroupement ? → A: Oui, deux boutiques par tournée.
- Q: Que faire quand une tournée ne trouve pas preneur ? → A: La dégrouper en livraisons séparées, plutôt que de faire attendre.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Un panier, un paiement (Priority: P1)

Une acheteuse compose son panier avec du riz d'une boutique, des jus d'une autre et de l'huile d'une troisième. Elle voit **un seul panier**, un seul total, saisit son adresse une fois, et paie une fois. La plateforme crée ensuite une commande chez chacune des trois boutiques et ventile l'argent vers elles.

**Why this priority** : c'est la friction décrite, et la seule partie indispensable. Elle a de la valeur même si les livraisons restent séparées : un paiement au lieu de trois supprime déjà l'essentiel de l'abandon de panier.

**Independent Test** : composer un panier chez deux boutiques, passer commande une seule fois, vérifier que deux commandes distinctes apparaissent côté vendeurs et que chaque boutique est créditée de sa part, commission déduite.

**Acceptance Scenarios** :

1. **Given** un panier contenant des articles de trois boutiques, **When** l'acheteuse ouvre son panier, **Then** elle voit une seule liste, un seul total et un seul bouton de commande.
2. **Given** ce panier, **When** elle valide le paiement, **Then** elle effectue une seule opération de paiement pour le montant total.
3. **Given** le paiement accepté, **When** les commandes sont créées, **Then** chaque boutique reçoit une commande ne contenant que ses articles, avec son numéro et son suivi propres.
4. **Given** les commandes créées, **When** la plateforme ventile les fonds, **Then** chaque portefeuille boutique est crédité du montant de sa commande diminué de la commission eBio.
5. **Given** un panier ne contenant qu'une seule boutique, **When** l'acheteuse commande, **Then** le parcours reste au moins aussi court qu'avant cette fonctionnalité.

---

### User Story 2 - Une seule livraison pour plusieurs boutiques (Priority: P2)

L'acheteuse ne paie qu'**un seul frais de livraison** et reçoit **une seule fois**. Un livreur accepte une tournée, passe dans les boutiques dans l'ordre indiqué, puis livre l'ensemble à l'adresse de l'acheteuse.

**Why this priority** : c'est le gain le plus visible après le paiement unique, mais il dépend d'un dispatch capable de raisonner en tournée, ce qui n'existe pas aujourd'hui. La story 1 reste livrable sans elle.

**Independent Test** : créer un panier chez deux boutiques proches, vérifier qu'un seul frais est annoncé avant paiement, qu'une seule tournée est proposée aux livreurs, et qu'un livreur qui l'accepte voit ses points de collecte puis le point de livraison.

**Acceptance Scenarios** :

1. **Given** un panier multi-boutiques en livraison, **When** l'acheteuse consulte le récapitulatif, **Then** un frais de livraison unique est affiché, avant paiement.
2. **Given** les commandes créées, **When** la plateforme cherche un livreur, **Then** une seule proposition regroupant tous les points de collecte est diffusée.
3. **Given** une tournée proposée, **When** un livreur l'accepte, **Then** il obtient la liste ordonnée des boutiques puis l'adresse finale, et aucune autre course ne lui est proposée pour ce créneau.
4. **Given** une tournée en cours, **When** l'acheteuse suit sa commande, **Then** elle voit une progression unique, et chaque boutique voit sa propre commande passer en « récupérée ».
5. **Given** un livreur ayant collecté chez toutes les boutiques, **When** il remet la marchandise, **Then** toutes les commandes de la tournée passent en « livrée » par ce seul geste.

---

### User Story 3 - Une boutique défaille, l'acheteuse n'est pas lésée (Priority: P3)

Entre le paiement et la préparation, une boutique ferme, annule ou n'a plus le stock. L'acheteuse doit être créditée de cette part exactement, garder le reste de sa commande, et comprendre ce qui s'est passé sans contacter le support.

**Why this priority** : sans cette story, le paiement unique transfère le risque sur l'acheteuse, ce qui est inacceptable en production. Elle vient après les deux autres parce qu'elle n'a de sens qu'une fois le paiement unifié.

**Independent Test** : passer une commande multi-boutiques, faire refuser l'une des commandes, vérifier que le crédit porté au portefeuille correspond au montant de cette commande seule, que les autres suivent leur cours, et que l'acheteuse reçoit une explication.

**Acceptance Scenarios** :

1. **Given** un paiement encaissé pour trois boutiques, **When** l'une refuse la commande, **Then** le portefeuille eBio de l'acheteuse est crédité du montant de cette commande et elle en est informée.
2. **Given** une boutique retirée après paiement, **When** la tournée est recalculée, **Then** le frais de livraison est réajusté et l'écart éventuel est crédité au portefeuille de l'acheteuse.
3. **Given** toutes les boutiques qui refusent, **When** la dernière commande est annulée, **Then** l'intégralité du montant, frais compris, est créditée au portefeuille de l'acheteuse.
4. **Given** une boutique qui annule alors que le livreur a déjà collecté ailleurs, **When** la tournée se poursuit, **Then** la livraison des autres boutiques a bien lieu et seule la part annulée est créditée.

---

### Edge Cases

- **Modes mixtes** : l'acheteuse veut retirer sur place chez une boutique et se faire livrer par une autre. Hors périmètre v1 (voir Assumptions), mais l'interface doit le refuser avec un message clair plutôt que de produire une commande incohérente.
- **Boutique hors zone** : une boutique du panier est trop loin pour être livrée à l'adresse choisie. L'acheteuse doit pouvoir commander le reste sans deviner laquelle bloque.
- **Boutique sans position connue** : la plateforme sait déjà appliquer un forfait dans ce cas ; la tournée doit rester possible.
- **Stock épuisé entre l'ajout au panier et le paiement** : l'acheteuse ne doit pas payer un article devenu indisponible.
- **Code promo** : l'acheteuse applique un code alors que le panier couvre plusieurs boutiques. Son assiette doit être explicite (voir Assumptions).
- **Seuil de livraison gratuite** : chaque boutique a le sien ; avec un frais unique, le seuil doit être évalué sur un périmètre défini et compréhensible.
- **Panier mono-boutique** : le cas le plus fréquent ne doit pas être alourdi par la mécanique multi-boutiques.
- **Une seule boutique dans la tournée** : la tournée ne doit pas rendre plus lent ou plus cher ce qui fonctionne aujourd'hui.
- **Aucun livreur ne prend la tournée** : trois temps — alerte back-office à 15 minutes, dégroupage à 30, main rendue à l'acheteur si même séparées les courses ne trouvent personne (FR-022).
- **Panier de plus de deux boutiques** : plusieurs tournées, donc plusieurs frais. Le total doit être annoncé avant paiement, sans que l'acheteur ait à comprendre le découpage.
- **L'acheteuse choisit d'attendre, puis se ravise** : l'issue « annuler » doit rester ouverte tant que la marchandise n'est pas collectée.
- **Tournée très dispersée** : la limite porte sur le nombre de boutiques, pas sur l'écart entre elles — deux boutiques aux extrémités de la ville restent groupables. La marchandise ne doit pas attendre indéfiniment chez celle qui a déjà préparé (voir Risks).
- **Panier en espèces au-dessus du plafond** : le refus seul ne suffit pas, l'acheteuse doit savoir de combien elle dépasse et ce qu'elle peut faire.

## Requirements *(mandatory)*

### Functional Requirements

#### Panier et caisse

- **FR-001** : L'acheteur MUST voir un panier unique listant tous ses articles, quelle que soit la boutique d'origine, avec la boutique indiquée sur chaque ligne.
- **FR-002** : L'acheteur MUST pouvoir commander l'ensemble de son panier en une seule opération.
- **FR-003** : Le système MUST afficher, avant paiement, le détail du montant : total des articles, frais de livraison, réductions, et total à payer.
- **FR-004** : L'acheteur MUST saisir son adresse et sa position de livraison une seule fois pour l'ensemble du panier.
- **FR-005** : Le système MUST permettre de retirer un article ou une boutique entière du panier sans perdre le reste.

#### Paiement et répartition

- **FR-006** : L'acheteur MUST effectuer une seule opération de paiement pour l'ensemble du panier.
- **FR-007** : Le système MUST créer une commande distincte par boutique, chacune conservant son numéro, son suivi, son chat et ses litiges.
- **FR-008** : Le système MUST créditer chaque boutique du montant de sa commande, commission eBio déduite, sans intervention manuelle.
- **FR-009** : Le système MUST conserver le lien entre le paiement et les commandes qu'il couvre, afin qu'un remboursement partiel puisse être rattaché à la bonne commande.
- **FR-010** : Le système MUST dédommager l'acheteur du montant exact d'une commande refusée ou annulée, sans affecter les autres commandes du même paiement.
- **FR-011** : Le système MUST encaisser le montant total dès la validation du panier, puis créditer le portefeuille eBio de l'acheteur de la part correspondant à toute commande refusée ou annulée. L'acheteur MUST pouvoir réutiliser ce solde sur la plateforme ou en demander le retrait, comme pour tout autre solde.
- **FR-012** : Le paiement en espèces à la livraison MUST rester disponible sur un panier multi-boutiques.
- **FR-012a** : Le plafond des espèces MUST s'appliquer au total de la tournée, toutes boutiques confondues, et non à chaque commande : il borne ce que le livreur avance, et cette avance est celle de la tournée.
- **FR-012b** : Lorsqu'un panier dépasse le plafond en espèces, le système MUST l'annoncer avant la validation, en indiquant le montant en cause et les deux issues possibles — payer en ligne, ou retirer des articles.

#### Livraison groupée

- **FR-013** : Le système MUST annoncer un frais de livraison unique pour l'ensemble du panier, avant paiement.
- **FR-014** : Le système MUST regrouper les livraisons d'un même passage en caisse en une tournée proposée comme un tout aux livreurs.
- **FR-015** : Un livreur MUST pouvoir accepter ou refuser une tournée en une seule décision, sans pouvoir n'en prendre qu'une partie.
- **FR-016** : Le livreur MUST voir l'ordre de passage dans les boutiques puis l'adresse de livraison.
- **FR-017** : Le système MUST refléter la collecte chez une boutique sur la commande de cette boutique seule, et la remise finale sur toutes les commandes de la tournée.
- **FR-018** : L'acheteur MUST suivre l'avancement d'une tournée comme une progression unique.
- **FR-019** : Le système MUST rémunérer le livreur au titre de la tournée, et non par commande transportée.
- **FR-020** : Le système MUST limiter une tournée à **deux boutiques**. Au-delà, le panier produit plusieurs tournées, chacune avec ses frais, et le total est annoncé avant paiement comme tout le reste. La limite MUST être réglable depuis le back-office : deux est un point de départ, pas une vérité.
- **FR-020a** : Le système MUST enregistrer, pour chaque tournée, le nombre de boutiques, la distance parcourue et l'issue de la diffusion — acceptée, refusée, sans preneur — afin que ces limites puissent être fixées sur des faits et non sur une intuition.
- **FR-020b** : Le système MUST pouvoir **dégrouper** une tournée en livraisons individuelles lorsqu'elle ne trouve pas preneur. Faire attendre l'acheteur pendant que la marchandise est prête chez des boutiques qui, elles, ont préparé, est le pire des dénouements.
- **FR-021** : Le système MUST gérer le retrait d'une boutique d'une tournée déjà acceptée sans interrompre la livraison des autres.
- **FR-022** : Le système MUST alerter le back-office lorsqu'une tournée reste sans preneur au bout de 15 minutes, afin qu'un administrateur puisse attribuer un livreur à la main.
- **FR-022a** : Le système MUST dégrouper la tournée en livraisons individuelles lorsqu'elle reste sans preneur au bout de 30 minutes, et les diffuser séparément. L'acheteur MUST en être informé : il recevra en plusieurs fois, et l'écart de frais éventuel lui est crédité.
- **FR-022b** : Lorsque l'acheteur choisit d'annuler faute de livreur, le système MUST créditer l'intégralité du montant, frais compris, et prévenir les boutiques concernées.
- **FR-022c** : Le système MUST rendre la décision à l'acheteur lorsque les livraisons dégroupées ne trouvent pas preneur non plus, en lui proposant explicitement d'attendre ou d'annuler.

#### Continuité

- **FR-023** : Les applications fournisseur et les écrans de suivi par commande MUST continuer de fonctionner sans modification visible pour le vendeur.
- **FR-024** : Un panier ne contenant qu'une boutique MUST produire exactement le même résultat qu'aujourd'hui, au même nombre d'étapes ou moins.
- **FR-025** : Le système MUST empêcher la validation d'un panier dont une boutique ne peut pas être livrée à l'adresse choisie, en désignant explicitement la boutique concernée et l'action possible.

### Key Entities

- **Panier** : la liste des articles choisis par un acheteur, toutes boutiques confondues, avec un mode de remise unique et une adresse unique. Remplace la collection de paniers par boutique.
- **Commande** : inchangée. Une boutique, ses articles, son statut, son chat, son litige. Reste l'unité de travail du vendeur.
- **Paiement** : une opération d'encaissement couvrant plusieurs commandes, porteuse de la répartition vers les boutiques et du rattachement des remboursements partiels.
- **Tournée de livraison** : un regroupement de livraisons confié à un seul livreur — points de collecte ordonnés, point de remise unique, rémunération propre.
- **Livraison** : inchangée. Reste attachée à une commande et une seule ; c'est la tournée qui les regroupe, pas la livraison qui se dédouble.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001** : Une acheteuse commande chez trois boutiques en une seule opération de paiement, contre trois aujourd'hui.
- **SC-002** : Le nombre d'étapes pour finaliser un panier de trois boutiques ne dépasse pas celui d'un panier d'une seule boutique.
- **SC-003** : La part des paniers contenant plus d'une boutique augmente d'au moins 30 % dans les trois mois suivant la mise en service.
- **SC-004** : La part des paniers multi-boutiques abandonnés au moment de la caisse diminue d'au moins 40 %.
- **SC-005** : Pour un panier de trois boutiques, l'acheteuse paie un seul frais de livraison et reçoit une seule remise dans 90 % des cas.
- **SC-006** : Le crédit consécutif au refus d'une boutique est porté au portefeuille de l'acheteuse sans intervention humaine, et visible par elle en moins de 5 minutes.
- **SC-007** : Aucune commande de boutique ne se perd : le nombre de commandes créées est toujours égal au nombre de boutiques payées.
- **SC-008** : Le vendeur ne constate aucun changement dans son travail quotidien : même écran de commandes, mêmes statuts, mêmes délais.
- **SC-009** : Un livreur accepte une tournée de trois boutiques en une seule action et la mène à son terme sans instruction hors application.
- **SC-010** : Aucune tournée ne reste sans décision au-delà de 30 minutes : passé ce délai, l'acheteuse a toujours été informée et peut trancher.

## Assumptions

Ces choix ont été retenus faute de contre-indication ; ils sont à confirmer au moment du plan.

- **Un seul mode de remise par panier** : livraison pour tout, ou retrait sur place pour tout. Le mode mixte (retrait chez l'une, livraison depuis l'autre) est hors périmètre v1 : il double les parcours pour un cas d'usage marginal.
- **Le retrait sur place reste par boutique** : un panier en retrait produit N commandes à retirer, sans tournée. Aucun regroupement n'a de sens ici.
- **Frais de livraison calculés sur la tournée complète**, avec la tarification plateforme existante, et non par la somme des frais que chaque boutique aurait facturés isolément.
- **Seuil de livraison gratuite évalué sur le total du panier**, et non boutique par boutique. C'est le seul choix lisible pour l'acheteuse, qui ne voit plus qu'un panier.
- **Code promo appliqué au panier entier**, sa charge étant répartie entre les boutiques concernées au prorata de leur part.
- **Commission eBio inchangée**, calculée par commande comme aujourd'hui.
- **Aucun changement visible côté fournisseur**, ce qui interdit toute modification du contrat de la commande.
- **La migration est transparente** : les paniers en cours au moment de la mise à jour sont conservés, fusionnés en un panier unique.

## Dependencies

- Le portefeuille acheteur doit accepter un crédit de type remboursement et rester retirable. Aucune capacité de remboursement partiel n'est attendue du prestataire de paiement : le Mobile Money ne sait ni geler des fonds ni les rendre partiellement.
- La diffusion des courses aux livreurs doit pouvoir raisonner sur un lot de points de collecte, ce qu'elle ne fait pas aujourd'hui.
- Les portefeuilles boutique doivent accepter d'être crédités depuis un encaissement couvrant plusieurs commandes.

## Risks

- **Le frais unique est à la charge de la plateforme** : plus une tournée s'étire, plus eBio paie un livreur pour un trajet que l'acheteur ne finance pas. La limite de deux boutiques (FR-020) borne cette exposition ; FR-020a la mesure, pour ajuster le seuil sur des faits.
- **Deux boutiques peuvent être proches sur le papier et loin en pratique.** La limite porte sur le nombre, pas encore sur l'écart entre points de collecte. Uber Eats impose les deux. À trancher avant la mise en service : sans critère de distance, deux boutiques aux extrémités de la ville restent groupables.

## Out of Scope

- Le mode de remise mixte au sein d'un même panier.
- Le regroupement de commandes passées séparément dans une même tournée.
- La négociation, par l'acheteur, de l'ordre de passage ou du créneau de collecte.
- Toute modification des applications fournisseur.
