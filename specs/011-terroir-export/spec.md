# Feature Specification: Module diaspora — Terroir vers l'étranger

**Feature Branch**: `011-terroir-export`
**Created**: 2026-11-13
**Status**: Draft
**Input**: User description: "Module diaspora — « Terroir vers l'étranger ». Un client de la diaspora en France ou en Belgique commande des produits du terroir béninois vendus par les boutiques eBio, expédiés depuis le Bénin. Envoi par des agences d'envoi de colis partenaires dont eBio met à jour régulièrement les dates de départ et les prix au kilo, ce qui permet d'estimer coût et délai à la commande ; le départ le plus proche est proposé par défaut. Packs composés par les boutiques ou par eBio depuis le back-office. Suivi du colis mis à jour régulièrement par eBio pour que le client sache où le récupérer ; souplesse dans le suivi. Hors périmètre v1 : autres pays, produits frais, retours internationaux, stock eBio en propre."

## Clarifications

### Session 2026-11-13

- Q: Qui paie les droits et taxes à l'import ? → A: Ils sont inclus dans le prix au kilo de l'agence partenaire (dédouanement compris) ; le client ne paie rien de plus.
- Q: Quand les boutiques sont-elles payées ? → A: À la remise des produits à eBio (collecte) ; eBio porte le risque de transport.
- Q: Mode d'envoi par défaut ? → A: Le prochain départ d'une agence partenaire (express) ; les départs et prix au kilo sont mis à jour par eBio.

## Vocabulaire

- **Client à l'étranger** : un acheteur eBio qui se fait livrer en France ou en Belgique.
- **Produit exportable** : un produit d'une boutique eBio validé par eBio pour l'envoi à l'étranger (sec ou transformé, non périssable).
- **Pack terroir** : un ensemble de produits exportables vendu comme un seul article, composé par une boutique (ses produits) ou par eBio (produits de plusieurs boutiques).
- **Agence partenaire** : une agence d'envoi de colis Bénin → France / Belgique avec laquelle eBio travaille.
- **Départ** : une date d'envoi d'une agence partenaire, avec son prix au kilo, son délai annoncé, sa date limite de dépôt et ses destinations.
- **Colis** : l'ensemble des produits d'une commande à l'étranger, emballé par eBio et confié à une agence pour un départ.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Commander du terroir et le voir arriver (Priority: P1)

Awa, à Paris, ouvre l'espace « Terroir » de l'app. Elle choisit un pack karité et deux sachets de moringa. Au paiement, eBio estime le poids du colis (1,8 kg) et propose le prochain départ : « Agence Bénin Express — départ le 22 novembre, arrivée estimée entre le 29 novembre et le 3 décembre, 23,40 € de transport ». Elle paie par carte en euros. Elle suit ensuite son colis étape par étape jusqu'à « Disponible au retrait : Bénin Express, 12 rue …, Paris 18e, du mardi au samedi ».

**Why this priority**: C'est le parcours complet qui crée la valeur pour le client à l'étranger.

**Independent Test**: Un client avec une adresse en France commande deux produits exportables ; on vérifie le poids estimé, le prix et le délai du départ proposé, le paiement, puis, en faisant avancer le suivi depuis le back-office, chaque notification reçue jusqu'à la remise.

**Acceptance Scenarios**:

1. **Given** un client qui choisit la France ou la Belgique comme pays de livraison, **When** il ouvre l'espace « Terroir », **Then** il ne voit que les produits et packs exportables, prix en euros.
2. **Given** un panier terroir, **When** il passe au paiement, **Then** le poids estimé du colis (poids des produits + emballage) et les départs disponibles vers son pays s'affichent, le plus proche sélectionné par défaut, chacun avec son agence, sa date de départ, sa fenêtre d'arrivée estimée et le prix du transport.
3. **Given** plusieurs départs disponibles, **When** le client en choisit un autre (moins cher, plus tardif), **Then** le prix et le délai se mettent à jour.
4. **Given** un départ choisi, **When** le client paie, **Then** le total comprend les produits et le transport, droits et taxes inclus (FR-014) ; il voit la date limite à laquelle eBio doit avoir collecté ses produits.
5. **Given** une commande payée, **When** eBio fait avancer le colis, **Then** le client reçoit une notification à chaque étape et voit dans l'app l'étape, la date et le message (par exemple l'adresse et les horaires du retrait).
6. **Given** un colis disponible au retrait, **When** le client le récupère, **Then** eBio marque le colis « remis » et la commande est terminée.
7. **Given** aucun départ disponible vers le pays du client, **When** il ouvre l'espace « Terroir », **Then** il voit qu'aucun envoi n'est programmé pour l'instant et peut être prévenu du prochain départ.

---

### User Story 2 - eBio tient à jour les agences et leurs départs (Priority: P1)

L'équipe eBio ajoute l'agence « Bénin Express » (contact, adresses de retrait à Paris et Bruxelles). Chaque semaine, elle saisit les prochains départs : date, date limite de dépôt, prix au kilo par destination, délai annoncé. Elle ferme un départ complet ou annulé.

**Why this priority**: Sans départ à jour, aucune estimation de coût ni de délai n'est possible.

**Independent Test**: Un agent du back-office crée une agence, deux départs avec des prix différents, en clôt un ; seuls les départs ouverts et dont la date limite n'est pas passée apparaissent aux clients, avec les bons prix.

**Acceptance Scenarios**:

1. **Given** le back-office, **When** un agent crée une agence partenaire, **Then** il renseigne nom, contacts, destinations desservies et, pour chaque ville d'arrivée, une ou plusieurs adresses de retrait avec horaires.
2. **Given** une agence, **When** l'agent ajoute un départ, **Then** il renseigne la date de départ, la date limite de dépôt, le délai annoncé (minimum–maximum en jours), le prix au kilo par pays, et éventuellement un minimum facturé et un poids maximum par colis.
3. **Given** un départ dont la date limite de dépôt moins le délai de collecte eBio est passée, **When** un client commande, **Then** ce départ n'est plus proposé.
4. **Given** un départ, **When** l'agent le ferme (complet, annulé), **Then** il n'est plus proposé ; les commandes déjà rattachées restent visibles pour être réaffectées.
5. **Given** un départ annulé avec des commandes rattachées, **When** l'agent les réaffecte à un autre départ, **Then** chaque client est prévenu de la nouvelle date ; si le nouveau prix de transport est plus élevé, eBio prend la différence.

---

### User Story 3 - Produits exportables et packs (Priority: P1)

Fatou, qui vend du karité, marque deux produits comme exportables en indiquant le poids emballé et la composition. eBio les valide. Elle compose un « Pack beauté karité » de trois produits. De son côté, l'équipe eBio compose un « Pack découverte Bénin » avec des produits de quatre boutiques.

**Why this priority**: Le catalogue terroir n'existe pas sans produits validés ; les packs sont le format d'achat le plus naturel pour un cadeau ou une commande depuis l'étranger.

**Independent Test**: Une boutique demande l'export d'un produit ; il n'apparaît à l'étranger qu'après validation eBio. Un pack boutique et un pack eBio multi-boutiques s'achètent comme un article ; chaque boutique est payée pour ses produits.

**Acceptance Scenarios**:

1. **Given** une boutique, **When** elle demande l'export d'un produit, **Then** elle renseigne le poids emballé, les dimensions, la composition / ingrédients et la durée de conservation ; le produit passe « en attente de validation ».
2. **Given** un produit en attente, **When** eBio le valide ou le refuse (avec motif), **Then** la boutique est prévenue ; seul un produit validé est visible à l'étranger.
3. **Given** une catégorie de produit interdite à l'export (frais, viande, lait, plantes vivantes…), **When** une boutique demande l'export d'un produit de cette catégorie, **Then** la demande est refusée d'emblée avec le motif.
4. **Given** une boutique, **When** elle compose un pack de ses produits exportables, **Then** elle fixe le prix du pack ; le pack est validé par eBio comme un produit.
5. **Given** le back-office, **When** eBio compose un pack avec des produits de plusieurs boutiques, **Then** eBio fixe le prix du pack ; chaque boutique est rémunérée au prix de ses produits inclus, et la différence (marge ou remise) revient à eBio.
6. **Given** un pack, **When** un de ses produits n'est plus disponible ou plus exportable, **Then** le pack n'est plus commandable jusqu'à correction.
7. **Given** un produit exportable, **When** la boutique modifie son poids ou sa composition, **Then** il repasse en validation.

---

### User Story 4 - Préparer et expédier les colis (Priority: P2)

Pour le départ du 22 novembre, l'équipe eBio voit la liste des commandes rattachées et, par boutique, les produits à collecter. Elle collecte, contrôle et emballe chaque colis, saisit son poids réel, et le dépose à l'agence. Elle imprime la liste du départ (colis, destinataires, contenu, valeurs) pour l'agence et la douane.

**Why this priority**: Indispensable dès les premières commandes, mais ce sont des outils internes : le client n'en voit que le suivi.

**Independent Test**: Avec trois commandes sur un départ, le back-office affiche la liste de collecte par boutique, permet de passer chaque colis de « collecté » à « déposé à l'agence » avec son poids réel, et produit la liste du départ.

**Acceptance Scenarios**:

1. **Given** un départ, **When** l'agent l'ouvre, **Then** il voit les commandes rattachées et une liste de collecte par boutique (produits, quantités, commande).
2. **Given** une boutique, **When** une commande à l'étranger contient ses produits, **Then** elle reçoit la commande comme aujourd'hui, avec la date limite de remise à eBio ; elle confirme la préparation et la remise au collecteur.
3. **Given** un colis, **When** il est emballé, **Then** l'agent saisit son poids réel ; si celui-ci dépasse le poids estimé de plus de 15 %, l'écart est signalé (eBio prend l'écart à sa charge en v1).
4. **Given** un départ, **When** l'agent génère la liste du départ, **Then** elle comporte, par colis : destinataire, ville, contenu, quantités, valeur déclarée en euros et poids.
5. **Given** un produit manquant à la collecte, **When** l'agent le signale, **Then** le client est prévenu et remboursé de ce produit (et du transport correspondant si le colis devient plus léger), le reste du colis part.

---

### User Story 5 - Suivi souple mis à jour par eBio (Priority: P2)

L'équipe eBio met à jour les colis d'un départ en une fois : « Expédié », puis « Arrivé à Paris », puis « Disponible au retrait » avec l'adresse et les horaires. Pour un colis, elle ajoute un message libre : « Retrait possible aussi samedi matin ».

**Why this priority**: C'est ce qui rassure le client pendant les semaines d'attente et lui dit où aller.

**Independent Test**: L'agent passe tous les colis d'un départ à une étape, puis un seul colis à une autre avec un message ; chaque client concerné reçoit une notification et voit l'historique complet dans l'app.

**Acceptance Scenarios**:

1. **Given** un départ, **When** l'agent applique une étape à tous ses colis, **Then** chaque colis reçoit cette étape et chaque client une notification.
2. **Given** un colis, **When** l'agent lui ajoute une étape ou un message libre, **Then** seul son client est prévenu.
3. **Given** les étapes standard (payé, en collecte, emballé, déposé à l'agence, parti du Bénin, arrivé, disponible au retrait / en livraison, remis), **When** l'agent met à jour, **Then** il choisit une étape standard ou écrit un message libre ; une étape « disponible au retrait » propose l'adresse de retrait de l'agence dans la ville du client, modifiable.
4. **Given** un colis disponible au retrait depuis 14 jours, **When** le client ne l'a pas récupéré, **Then** il reçoit un rappel.

---

### User Story 6 - Livraison à domicile en option (Priority: P3)

Plutôt que le retrait à l'agence, Awa choisit la livraison à domicile proposée par l'agence pour 6 € de plus.

**Why this priority**: Confort ; le retrait couvre le besoin de base.

**Independent Test**: Sur un départ dont l'agence propose la livraison à domicile, le client choisit l'option, paie le supplément, et le suivi se termine par « en livraison » puis « remis ».

**Acceptance Scenarios**:

1. **Given** une agence qui livre à domicile dans un pays, **When** le client choisit cette option, **Then** il saisit son adresse et paie le supplément fixé pour ce départ.
2. **Given** une agence sans livraison à domicile, **When** le client passe commande, **Then** seule l'option retrait est proposée.

---

### Edge Cases

- **Panier terroir et panier local** : un panier terroir est séparé du panier local ; les deux ne se mélangent pas.
- **Poids au-delà du maximum d'un départ** : le départ n'est pas proposé ; le client voit pourquoi et peut retirer des produits.
- **Prix au kilo modifié après la commande** : la commande garde le prix au moment du paiement.
- **Départ annulé** : réaffectation (US2-5) ; si aucun départ n'est possible sous 30 jours, le client peut demander le remboursement intégral.
- **Colis perdu ou abîmé** : remboursement sans retour physique (produits et transport), sur le portefeuille eBio selon la règle existante ; la boutique, déjà payée à la collecte, n'est pas débitée ; eBio se retourne vers l'agence.
- **Colis non retiré** : rappel à 14 jours ; au-delà de la durée de garde de l'agence, eBio contacte le client ; pas de remboursement automatique.
- **Boutique qui ne remet pas les produits à temps** : le produit est retiré du colis et remboursé (US4-5) ; si plus rien ne part, la commande est réaffectée au départ suivant avec l'accord du client.
- **Client qui change de pays** : le panier terroir est recalculé ; les produits non exportables vers le nouveau pays sont signalés.
- **Commande pour un proche (009)** : non applicable au terroir en v1 (le destinataire est à l'étranger).

## Requirements *(mandatory)*

### Functional Requirements

**Catalogue et packs**

- **FR-001**: Une boutique MUST pouvoir demander l'export d'un produit en renseignant poids emballé, dimensions, composition et durée de conservation ; le produit MUST être validé par eBio avant d'être visible à l'étranger.
- **FR-002**: eBio MUST pouvoir valider ou refuser (avec motif) un produit exportable ; une modification du poids ou de la composition MUST le renvoyer en validation.
- **FR-003**: eBio MUST pouvoir déclarer des catégories interdites à l'export ; une demande dans ces catégories MUST être refusée d'emblée.
- **FR-004**: Une boutique MUST pouvoir composer un pack de ses produits exportables, à un prix qu'elle fixe ; eBio MUST pouvoir composer un pack de produits de plusieurs boutiques, à un prix qu'il fixe.
- **FR-005**: Dans un pack eBio, chaque boutique MUST être rémunérée au prix de ses produits inclus ; l'écart avec le prix du pack MUST être porté par eBio.
- **FR-006**: Un pack MUST cesser d'être commandable dès qu'un de ses produits n'est plus disponible ou plus exportable.
- **FR-007**: L'espace « Terroir » MUST n'afficher que les produits et packs exportables, prix en euros (taux de la devise, module 009), et seulement aux clients dont le pays de livraison est la France ou la Belgique.

**Agences et départs**

- **FR-008**: Le back-office MUST permettre de gérer des agences partenaires : contacts, pays desservis, adresses de retrait par ville avec horaires, option de livraison à domicile par pays.
- **FR-009**: Le back-office MUST permettre de gérer des départs : agence, date de départ, date limite de dépôt, délai annoncé (min–max jours), prix au kilo par pays, minimum facturé, poids maximum par colis, supplément de livraison à domicile, statut (ouvert, complet, annulé, parti).
- **FR-010**: Un départ MUST être proposé aux clients seulement s'il est ouvert, dessert le pays du client, et si sa date limite de dépôt laisse le délai de collecte eBio (réglable, 3 jours par défaut).

**Commande et prix**

- **FR-011**: Au paiement, le système MUST estimer le poids du colis (somme des poids emballés + un poids d'emballage forfaitaire réglable) et proposer les départs possibles, le plus proche en premier et sélectionné par défaut.
- **FR-012**: Pour chaque départ proposé, le client MUST voir l'agence, la date de départ, la fenêtre d'arrivée estimée, le prix du transport (poids × prix au kilo, au moins le minimum facturé) et la date limite de collecte.
- **FR-013**: Le prix du transport, le départ et l'estimation MUST être figés au paiement.
- **FR-014**: Les droits et taxes à l'import MUST être inclus dans le prix au kilo de l'agence (tarif « dédouanement compris ») ; le client MUST voir la mention « droits et taxes inclus » et ne rien payer de plus au retrait. Une agence qui ne pratique pas ce tarif MUST NOT être proposée.
- **FR-015**: Le paiement MUST se faire par carte (et portefeuille eBio) ; le paiement en espèces MUST NOT être proposé.
- **FR-016**: La commission eBio sur les produits MUST s'appliquer comme aujourd'hui ; le transport MUST être reversé à l'agence partenaire par eBio, hors du circuit des boutiques.
- **FR-017**: Les boutiques MUST être payées de leurs produits dès leur remise à eBio (collecte confirmée par eBio), sans attendre l'arrivée du colis ; un remboursement ultérieur au client (colis perdu ou abîmé) MUST être pris en charge par eBio, sans reprise sur la boutique.

**Préparation et expédition**

- **FR-018**: Une boutique MUST recevoir la commande terroir comme une commande ordinaire, avec la date limite de remise à eBio, et confirmer la préparation puis la remise.
- **FR-019**: Le back-office MUST présenter, par départ, les commandes rattachées et la liste de collecte par boutique.
- **FR-020**: Le back-office MUST permettre de saisir le poids réel d'un colis ; un écart de plus de 15 % au-dessus de l'estimation MUST être signalé ; en v1, eBio absorbe l'écart.
- **FR-021**: Le back-office MUST produire la liste d'un départ (destinataire, ville, contenu, quantités, valeur déclarée, poids) imprimable.
- **FR-022**: Un produit manquant à la collecte MUST pouvoir être retiré d'un colis, avec remboursement du produit (et de la part de transport correspondante) au client.
- **FR-023**: Les commandes d'un départ annulé MUST pouvoir être réaffectées à un autre départ ; le client MUST être prévenu ; un surcoût de transport MUST être pris en charge par eBio.

**Suivi**

- **FR-024**: Le back-office MUST permettre d'appliquer une étape à tous les colis d'un départ, ou une étape / un message libre à un seul colis.
- **FR-025**: Chaque mise à jour MUST notifier le client concerné (push et e-mail) ; le client MUST voir dans l'app l'historique daté des étapes et messages.
- **FR-026**: L'étape « disponible au retrait » MUST afficher l'adresse et les horaires de retrait de l'agence dans la ville du client, modifiables par l'agent.
- **FR-027**: Un colis disponible au retrait depuis 14 jours MUST déclencher un rappel au client.
- **FR-028**: Un colis perdu ou abîmé MUST pouvoir être remboursé sans retour physique (produits et transport).

**Livraison à domicile**

- **FR-029**: Si l'agence du départ livre à domicile dans le pays du client, le client MUST pouvoir choisir cette option contre le supplément du départ, en saisissant son adresse ; sinon seule l'option retrait MUST être proposée.

### Key Entities

- **Produit exportable** : produit d'une boutique + poids emballé, dimensions, composition, conservation, statut de validation (en attente, validé, refusé + motif).
- **Pack terroir** : nom, photo, prix, auteur (boutique ou eBio), composition (produits et quantités), statut de validation.
- **Agence partenaire** : nom, contacts, pays desservis, points de retrait (ville, adresse, horaires), livraison à domicile par pays (oui/non).
- **Départ** : agence, date de départ, date limite de dépôt, délai annoncé, prix au kilo par pays (droits et taxes inclus), minimum facturé, poids maximum, supplément domicile, statut.
- **Commande terroir** : commande(s) des boutiques + départ choisi, poids estimé et réel, prix du transport figé (droits et taxes inclus), mode de réception (retrait / domicile), adresse.
- **Colis** : commande terroir, poids réel, étape courante, historique des étapes et messages (date, étape, texte, auteur).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un client en France ou en Belgique commande un pack terroir et voit le coût et la date d'arrivée estimés en moins de 3 minutes.
- **SC-002**: Pour 90 % des colis, le prix de transport payé par le client couvre le prix réellement facturé par l'agence (écart de poids inclus).
- **SC-003**: 90 % des colis arrivent dans la fenêtre d'arrivée affichée à la commande.
- **SC-004**: 100 % des changements d'étape d'un colis sont notifiés au client en moins de 5 minutes.
- **SC-005**: Un agent met à jour tous les colis d'un départ en une seule action, en moins d'une minute.
- **SC-006**: Six mois après le lancement, au moins 20 % des clients à l'étranger ayant commandé une fois ont recommandé.

## Assumptions

- eBio dispose d'un point de collecte / entrepôt à Cotonou, d'où il dépose les colis aux agences partenaires.
- Les agences partenaires livrent jusqu'à leurs points de retrait en France et en Belgique (et parfois à domicile), dédouanement compris dans leur prix au kilo ; eBio les paie directement, hors application, selon les accords.
- Le versement aux boutiques à la collecte remplace, pour les commandes terroir, le séquestre jusqu'à la livraison : eBio porte seul le risque de transport.
- Les dates et prix des départs sont saisis à la main par eBio, au rythme des agences ; aucune connexion automatique avec les agences en v1.
- La conformité réglementaire (UE : produits d'origine végétale, étiquetage, valeur de franchise) est vérifiée par eBio lors de la validation des produits ; les produits d'origine animale et les produits frais sont exclus en v1.
- L'affichage en euros réutilise le module devise (009) ; le montant encaissé est en FCFA, comme pour toute commande.
- Le client à l'étranger est un acheteur eBio ordinaire, dont le pays de livraison est la France ou la Belgique ; la connexion depuis l'étranger suit le module 009.
- Les remboursements suivent les règles existantes (portefeuille eBio).

## Out of Scope (v1)

- Pays autres que la France et la Belgique.
- Produits frais, périssables ou d'origine animale.
- Retours internationaux (remboursement sans retour physique).
- Stock eBio en propre.
- Connexion automatique aux systèmes des agences (suivi, tarifs).
- Commande pour un proche et portefeuille famille appliqués au terroir.
