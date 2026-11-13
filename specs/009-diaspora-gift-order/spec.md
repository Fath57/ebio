# Feature Specification: Module diaspora — Commander pour un proche

**Feature Branch**: `009-diaspora-gift-order`
**Created**: 2026-11-13
**Status**: Draft
**Input**: User description: "Module diaspora — « Commander pour un proche ». Un acheteur vivant à l'étranger (diaspora) passe une commande eBio livrée à un proche au pays. Périmètre v1 : (1) choix d'un destinataire proche au panier (nom, téléphone, position carte, adresse), carnet de proches réutilisables ; le proche reçoit un SMS avec le code de remise et un lien de suivi ; compte eBio optionnel pour le proche. (2) Affichage des prix en devise (EUR, USD, CAD) avec taux figé au moment de la commande, montant encaissé en FCFA ; paiement par carte bancaire via INTRAM. Inscription avec numéro de téléphone international, connexion e-mail/Google/Apple. (3) Preuve de livraison : photo + position GPS + heure, notifiée au payeur. Hors périmètre v1 : portefeuille famille, panier récurrent, coffrets d'occasion, expédition internationale."

## Clarifications

### Session 2026-11-13

- Q: Que devient l'argent du payeur après un échec de remise (proche absent, refus, adresse introuvable) ? → A: Remboursement moins les frais de livraison.
- Q: Sur quel support rembourser, puisqu'un remboursement par carte via INTRAM est toujours intégral ? → A: Sur le portefeuille eBio du payeur, utilisable pour ses commandes suivantes.
- Q: Source des taux USD/CAD et marge ? → A: Mise à jour automatique quotidienne, correction possible au back-office, marge de change réglable (2 % par défaut).
- Q: Le taux de l'euro est-il saisissable ? → A: Oui, les trois taux (EUR compris) se saisissent au back-office ; l'euro part de la parité 655,957 et n'est jamais mis à jour automatiquement.
- Q: Comment s'inscrit un utilisateur à l'étranger ? → A: L'application détecte automatiquement l'étranger et ne propose que Google, Apple ou e-mail, au choix de l'utilisateur ; le code SMS reste réservé aux numéros béninois, accessible par un lien « J'ai un numéro béninois ».

## Vocabulaire

- **Payeur** : la personne qui commande et paie, en général depuis l'étranger.
- **Proche** : la personne qui reçoit la livraison au pays. Ce n'est pas forcément un utilisateur d'eBio.
- **Commande pour un proche** : un passage en caisse dont l'adresse de livraison est celle d'un proche et non celle du payeur.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Faire livrer un panier à un proche (Priority: P1)

Awa vit à Paris. Elle ouvre eBio, remplit un panier dans une ou plusieurs boutiques de Cotonou, puis choisit au moment de passer en caisse « Livrer à un proche ». Elle saisit le nom et le téléphone de sa mère, place le point de livraison sur la carte et précise l'adresse. Elle paie par carte bancaire. Sa mère reçoit un SMS qui annonce le panier, son expéditrice, le créneau et un lien de suivi, puis un second SMS avec le code de remise quand le livreur part vers elle. Le livreur remet le panier contre ce code.

**Why this priority**: C'est la raison d'être du module. Sans elle, rien d'autre n'a de sens. Cette story réutilise presque entièrement le parcours de commande existant.

**Independent Test**: Un compte payeur passe une commande pour un proche (numéro béninois sans compte eBio) et paie par carte. Le proche reçoit le SMS d'annonce, puis le SMS du code au départ du livreur. Un livreur accepte la course, se rend au point du proche et valide la remise avec le code du SMS.

**Acceptance Scenarios**:

1. **Given** un panier valide et le choix « Livrer à un proche », **When** le payeur saisit le nom, le téléphone, le point sur la carte et l'adresse du proche, **Then** le devis de livraison est calculé à partir du point du proche et non de la position du payeur.
2. **Given** une commande pour un proche payée, **When** le paiement est confirmé, **Then** le proche reçoit un SMS avec le prénom du payeur, le nom de la boutique ou « plusieurs boutiques », le créneau et un lien de suivi ; le code de remise lui arrive par un second SMS quand le livreur part vers lui.
3. **Given** une commande pour un proche, **When** le livreur consulte la course, **Then** il voit le nom et le téléphone du proche (et non ceux du payeur) comme contact de livraison.
4. **Given** une commande pour un proche, **When** le livreur saisit le code du proche, **Then** la livraison passe à « livrée » comme pour une commande ordinaire.
5. **Given** un point de livraison hors zone desservie, **When** le payeur le place sur la carte, **Then** le passage en caisse est refusé avec le même message « hors zone » qu'une commande ordinaire.
6. **Given** une commande pour un proche, **When** le payeur choisit le mode de paiement, **Then** le paiement en espèces à la livraison n'est pas proposé.

---

### User Story 2 - Preuve de livraison envoyée au payeur (Priority: P1)

Quand le livreur remet le panier, il prend une photo de la remise. L'application enregistre l'heure et la position. Awa reçoit aussitôt une notification et un e-mail : « Panier remis à Maman à 10 h 42 », avec la photo.

**Why this priority**: Le payeur est à des milliers de kilomètres. Sans preuve, il n'a aucune raison de faire confiance. C'est ce qui distingue ce service d'un simple transfert d'argent.

**Independent Test**: Sur une commande pour un proche, le livreur ne peut pas clôturer sans photo. Une fois la remise validée, le payeur reçoit la notification et l'e-mail avec la photo, l'heure et l'indication que la position correspond au point de livraison.

**Acceptance Scenarios**:

1. **Given** une commande pour un proche en cours de livraison, **When** le livreur valide la remise, **Then** le code du proche **et** une photo sont tous deux exigés (sur une commande ordinaire, l'un ou l'autre suffit comme aujourd'hui).
2. **Given** la remise validée, **When** la preuve est enregistrée, **Then** elle comporte la photo, l'heure de remise et la position du livreur au moment de la remise.
3. **Given** la preuve enregistrée, **When** elle est envoyée au payeur, **Then** il reçoit une notification push et un e-mail contenant la photo, le nom du proche et l'heure locale du payeur **et** l'heure locale du pays de livraison.
4. **Given** une position de remise éloignée de plus de 300 m du point de livraison, **When** la preuve est enregistrée, **Then** elle est marquée « position éloignée » pour le support, sans bloquer la remise.
5. **Given** une commande pour un proche livrée, **When** le payeur ouvre la commande dans l'application, **Then** il retrouve la photo, l'heure et le statut de la remise.

---

### User Story 3 - Voir les prix et payer depuis l'étranger (Priority: P2)

Awa choisit d'afficher les prix en euros. Tous les prix du catalogue, du panier et du récapitulatif s'affichent en euros, avec le montant en FCFA en petit. Au moment de payer, le taux est figé : le montant en euros qu'elle a vu est celui de sa commande. Elle paie par carte bancaire.

**Why this priority**: Rendre le service lisible et payable depuis l'étranger. La story 1 fonctionne déjà avec des prix en FCFA et un paiement par carte, d'où la priorité 2.

**Independent Test**: Un payeur règle sa devise sur USD, compare un prix catalogue au montant FCFA, passe une commande et vérifie que le récapitulatif de la commande garde le taux et le montant en USD du moment de la commande, même après un changement de taux.

**Acceptance Scenarios**:

1. **Given** un utilisateur, **When** il choisit sa devise d'affichage (FCFA, EUR, USD ou CAD), **Then** les prix du catalogue, du panier et du récapitulatif s'affichent dans cette devise, accompagnés du montant en FCFA.
2. **Given** un passage en caisse, **When** le paiement est lancé, **Then** le taux appliqué et le montant en devise sont enregistrés sur la commande et ne changent plus.
3. **Given** une commande passée en devise, **When** le payeur consulte l'historique, **Then** il voit le montant en devise au taux de la commande et le montant FCFA réellement encaissé.
4. **Given** une commande pour un proche, **When** le payeur choisit le mode de paiement, **Then** la carte bancaire est proposée en premier.
5. **Given** une commande quelconque, **When** elle est encaissée, **Then** le montant encaissé, la commission et le versement à la boutique restent calculés en FCFA, comme aujourd'hui.

---

### User Story 4 - Carnet de proches (Priority: P2)

Awa commande pour sa mère chaque mois et parfois pour son frère. Ses proches sont enregistrés : au passage en caisse, elle choisit « Maman » dans une liste et tout est prérempli.

**Why this priority**: Le confort de la deuxième commande. Sans carnet, chaque commande reprend la saisie complète, ce qui freine la fidélité.

**Independent Test**: Après une première commande pour un proche, le payeur retrouve ce proche dans son carnet, le modifie, en ajoute un second, en supprime un, et repasse commande en choisissant un proche existant.

**Acceptance Scenarios**:

1. **Given** une première commande pour un nouveau proche, **When** elle est passée, **Then** le proche est proposé à l'enregistrement dans le carnet avec un surnom (« Maman »).
2. **Given** un carnet non vide, **When** le payeur choisit « Livrer à un proche », **Then** il peut choisir un proche existant ; nom, téléphone, point et adresse sont préremplis et modifiables pour cette commande.
3. **Given** un proche du carnet, **When** le payeur le modifie ou le supprime, **Then** les commandes déjà passées gardent les informations du moment de la commande.

---

### User Story 5 - Le proche suit son panier et, s'il le souhaite, crée un compte (Priority: P3)

La mère d'Awa ouvre le lien du SMS : elle voit sans se connecter le contenu du panier, le créneau, l'avancement de la livraison et le livreur sur la carte. Plus tard, elle installe eBio avec le même numéro de téléphone : elle retrouve les paniers qu'on lui a envoyés et peut noter les produits et le livreur.

**Why this priority**: Le SMS et le code suffisent à la remise. Le suivi et le compte du proche améliorent l'expérience et peuvent recruter de nouveaux clients, mais ils ne sont pas indispensables au premier lancement.

**Independent Test**: Ouvrir le lien de suivi sans compte affiche l'état de la commande. Créer un compte avec le numéro du proche fait apparaître la commande dans une rubrique « Paniers reçus », où la notation est possible après livraison.

**Acceptance Scenarios**:

1. **Given** le lien de suivi reçu par SMS, **When** le proche l'ouvre sans être connecté, **Then** il voit le contenu du panier, le créneau, l'état de la livraison et, pendant la course, la position du livreur.
2. **Given** le lien de suivi, **When** il est ouvert, **Then** il n'affiche ni prix, ni moyen de paiement, ni coordonnées du payeur au-delà de son prénom.
3. **Given** une commande livrée depuis plus de 7 jours, **When** le lien est ouvert, **Then** il indique seulement que le panier a été livré, sans position ni détail.
4. **Given** un proche qui crée ou possède un compte vérifié avec le numéro de téléphone de la commande, **When** il se connecte, **Then** il voit la commande dans « Paniers reçus » et peut noter les produits et le livreur après la remise.
5. **Given** un proche connecté, **When** il consulte un panier reçu, **Then** il ne peut ni l'annuler, ni le modifier, ni voir le montant payé.

---

### User Story 6 - S'inscrire depuis l'étranger (Priority: P2)

Awa n'a pas de numéro béninois. Quand elle ouvre eBio à Paris, l'application détecte qu'elle est à l'étranger : l'écran d'inscription lui propose Google, Apple et e-mail, présentés comme aujourd'hui, sans l'inscription par code SMS. Elle choisit Google, puis renseigne son numéro français à titre de contact. Elle reçoit les notifications de ses commandes par push et par e-mail.

**Why this priority**: Aujourd'hui l'inscription par téléphone n'accepte que les numéros béninois. Sans cette story, une partie de la diaspora ne peut pas créer de compte. L'inscription par e-mail, Google et Apple existe déjà, d'où la priorité 2 et non 1.

**Independent Test**: Ouvrir l'application depuis un appareil réglé sur un pays étranger et constater que l'inscription propose Google, Apple et e-mail sans code SMS ; créer le compte avec Google et le numéro +33, passer une commande pour un proche et recevoir toutes les notifications sans aucun SMS envoyé au payeur.

**Acceptance Scenarios**:

1. **Given** un nouvel utilisateur, **When** il renseigne un numéro de téléphone d'un autre pays que le Bénin, **Then** le numéro est accepté au format international.
2. **Given** un payeur avec un numéro hors Bénin, **When** un événement de commande se produit, **Then** il est prévenu par push et par e-mail ; aucun SMS ne lui est envoyé.
3. **Given** un utilisateur détecté à l'étranger, **When** il arrive sur l'écran d'inscription ou de connexion, **Then** seuls Google, Apple (sur iPhone) et e-mail sont proposés, présentés comme aujourd'hui ; l'inscription par code SMS n'apparaît pas.
4. **Given** un utilisateur détecté à l'étranger qui a pourtant un numéro béninois (voyage, itinérance), **When** il choisit « J'ai un numéro béninois », **Then** l'inscription par code SMS lui est proposée.
5. **Given** un utilisateur détecté au Bénin, **When** il arrive sur l'écran d'inscription, **Then** l'écran reste celui d'aujourd'hui.
6. **Given** la saisie d'un numéro étranger dans l'inscription par code SMS (détection en défaut), **When** l'utilisateur valide, **Then** l'envoi du code est refusé et l'application propose Google, Apple ou e-mail.
7. **Given** une inscription par e-mail, **When** l'adresse n'est pas encore confirmée, **Then** le compte ne peut pas passer commande.

---

### Edge Cases

- **Proche injoignable ou absent** : le livreur appelle le proche ; sans réponse, il déclare l'échec « client absent » comme aujourd'hui. Le payeur est prévenu immédiatement par push et e-mail. La commande est annulée et le payeur remboursé sur son portefeuille eBio du montant payé moins les frais de livraison, qui rémunèrent le déplacement du livreur (FR-037).
- **Proche qui refuse le panier** : même traitement qu'un proche absent, avec le motif « refus ». Les produits frais retournent à la boutique.
- **Payeur qui annule** : mêmes règles d'annulation qu'une commande ordinaire. Le proche reçoit un SMS d'annulation s'il avait déjà reçu le SMS d'annonce.
- **SMS non distribué au proche** : le payeur voit le code de remise dans sa commande et peut le transmettre lui-même (WhatsApp, appel). Un bouton permet de renvoyer le SMS, limité à 3 envois par commande.
- **Taux de change modifié pendant le paiement** : le taux est figé au lancement du paiement ; un paiement abandonné puis relancé après expiration recalcule le taux et le montant affiché.
- **Paiement par carte refusé** : même parcours d'échec qu'un paiement ordinaire ; aucun SMS n'est envoyé au proche tant que le paiement n'est pas confirmé.
- **Proche qui est aussi le payeur** (numéro identique) : la commande est traitée comme une commande ordinaire.
- **Panier multi-boutiques** : un seul SMS au proche pour l'ensemble du passage en caisse, un seul code de remise par livraison comme aujourd'hui ; si les livraisons partent séparément, chaque remise produit sa propre preuve et sa propre notification.
- **Livreur sans réseau à la remise** : la photo et la position sont prises sur place et envoyées dès le retour du réseau ; l'heure enregistrée est celle de la prise de vue.
- **Photo montrant une personne** : la photo peut montrer le proche ; elle n'est visible que du payeur, du livreur et du back-office, et n'est jamais publique.

## Requirements *(mandatory)*

### Functional Requirements

**Commande pour un proche**

- **FR-001**: Au passage en caisse, le payeur MUST pouvoir choisir entre « Me livrer » et « Livrer à un proche ».
- **FR-002**: Pour une livraison à un proche, le système MUST exiger le nom du proche, son téléphone, un point de livraison sur la carte et une précision d'adresse en texte libre.
- **FR-003**: Le téléphone du proche MUST être un numéro d'un pays où eBio livre (Bénin en v1).
- **FR-004**: Le devis de livraison, le contrôle de zone et la diffusion de la course aux livreurs MUST utiliser le point du proche.
- **FR-005**: Le livreur MUST voir le nom et le téléphone du proche comme contact de livraison, ainsi que le prénom du payeur.
- **FR-006**: Le paiement en espèces à la livraison MUST être indisponible sur une commande pour un proche.
- **FR-007**: Les informations du proche MUST être figées sur la commande au moment du passage en caisse.

**Information du proche**

- **FR-008**: Dès le paiement confirmé, le système MUST envoyer au proche un SMS d'annonce contenant le prénom du payeur, le créneau de livraison et un lien de suivi.
- **FR-009**: Quand le livreur a récupéré la commande et part vers le proche, le système MUST envoyer au proche un SMS contenant le code de remise ; il MUST aussi lui envoyer un SMS en cas d'annulation. (Le code n'existe qu'à partir de ce moment.)
- **FR-010**: Le payeur MUST voir le code de remise dans sa commande et pouvoir renvoyer le SMS au proche, au plus 3 fois par commande.
- **FR-011**: Le lien de suivi MUST être consultable sans compte, contenir un identifiant non devinable, et afficher le contenu du panier, le créneau, l'état et la position du livreur pendant la course, sans aucun prix ni coordonnée du payeur autre que son prénom.
- **FR-012**: Le lien de suivi MUST cesser d'afficher la position et le détail 7 jours après la livraison ou l'annulation.

**Preuve de livraison**

- **FR-013**: Sur une commande pour un proche, la validation de la remise MUST exiger le code du proche **et** une photo prise au moment de la remise.
- **FR-014**: La preuve MUST enregistrer la photo, l'heure de prise de vue et la position du livreur.
- **FR-015**: Une preuve dont la position est à plus de 300 m du point de livraison MUST être signalée au back-office, sans bloquer la remise.
- **FR-016**: À la remise, le payeur MUST recevoir une notification push et un e-mail contenant la photo, le nom du proche et l'heure de remise exprimée dans son fuseau et dans celui du pays de livraison.
- **FR-017**: La photo de remise MUST être accessible seulement au payeur, au livreur concerné et au personnel du back-office habilité, et conservée 90 jours après la livraison.
- **FR-018**: En cas d'échec de remise (proche absent, refus, adresse introuvable), le payeur MUST être prévenu immédiatement par push et e-mail avec le motif.
- **FR-037**: Après un échec de remise sur une commande pour un proche, la commande MUST être annulée et le payeur remboursé du montant payé moins les frais de livraison, crédité sur son portefeuille eBio (et non sur sa carte, où seul un remboursement intégral est possible) ; le livreur MUST être rémunéré pour la course comme une livraison effectuée, et les produits retournent à la boutique.

**Devise et paiement**

- **FR-019**: Chaque utilisateur MUST pouvoir choisir une devise d'affichage parmi FCFA, EUR, USD et CAD ; par défaut, FCFA.
- **FR-020**: Quand la devise n'est pas le FCFA, chaque prix MUST s'afficher dans la devise choisie, accompagné du montant en FCFA.
- **FR-021**: Les taux EUR, USD et CAD MUST tous pouvoir être saisis à la main au back-office. Le taux EUR vaut par défaut la parité officielle (1 € = 655,957 FCFA) et n'est jamais modifié automatiquement. Les taux USD et CAD MUST en plus être mis à jour automatiquement une fois par jour depuis une source de taux de référence ; une saisie manuelle reste en vigueur jusqu'à la mise à jour suivante.
- **FR-021a**: Le back-office MUST permettre de régler une marge de change (en pourcentage, 2 % par défaut, 0 % autorisé) appliquée au taux affiché pour EUR, USD et CAD ; le taux figé sur la commande inclut cette marge.
- **FR-021b**: Si la mise à jour automatique échoue, le dernier taux connu MUST rester en vigueur et le back-office MUST être alerté quand un taux a plus de 72 heures.
- **FR-022**: Au lancement du paiement, le système MUST figer sur le passage en caisse la devise, le taux et le montant en devise.
- **FR-023**: L'encaissement, les commissions, les versements aux boutiques et la rémunération des livreurs MUST rester calculés et réglés en FCFA.
- **FR-024**: Le paiement par carte bancaire MUST être proposé pour toute commande et placé en premier pour une commande pour un proche.

**Carnet de proches**

- **FR-025**: Le payeur MUST pouvoir enregistrer, consulter, modifier et supprimer des proches (surnom, nom, téléphone, point, adresse).
- **FR-026**: Après une commande pour un nouveau proche, le système MUST proposer de l'enregistrer dans le carnet.
- **FR-027**: Choisir un proche du carnet MUST préremplir le formulaire, modifiable pour la commande en cours sans obligation de mettre à jour le carnet.
- **FR-028**: Un payeur MUST pouvoir enregistrer au plus 20 proches.

**Compte du proche**

- **FR-029**: Un utilisateur dont le numéro de téléphone vérifié correspond à celui du proche d'une commande MUST voir cette commande dans une rubrique « Paniers reçus ».
- **FR-030**: Le proche connecté MUST pouvoir noter les produits et le livreur d'un panier reçu après la remise, dans les mêmes conditions qu'un acheteur.
- **FR-031**: Le proche MUST NOT voir le montant payé, ni pouvoir annuler ou modifier un panier reçu.

**Inscription internationale**

- **FR-032**: Le profil MUST accepter un numéro de téléphone de n'importe quel pays, au format international, comme simple moyen de contact.
- **FR-033**: Un utilisateur dont le numéro n'est pas béninois MUST recevoir ses notifications par push et par e-mail, jamais par SMS.
- **FR-034**: L'inscription et la connexion par code SMS MUST rester réservées aux numéros béninois ; un numéro étranger saisi dans ce parcours MUST être refusé avec une proposition de Google, Apple ou e-mail.
- **FR-034a**: L'application MUST détecter automatiquement si l'utilisateur se trouve hors du Bénin, à partir du pays de l'appareil et du réseau, sans demander d'autorisation supplémentaire.
- **FR-034b**: Pour un utilisateur détecté hors du Bénin, l'écran d'inscription et de connexion MUST proposer uniquement Google, Apple (sur iPhone) et e-mail, présentés comme aujourd'hui sans mise en avant de l'un d'eux, avec un lien discret « J'ai un numéro béninois » qui rouvre l'inscription par code SMS.
- **FR-034c**: Une inscription par e-mail MUST être confirmée par lien avant toute commande ; les comptes Google et Apple sont considérés comme déjà vérifiés.

**Back-office**

- **FR-035**: Le back-office MUST distinguer les commandes pour un proche, afficher le payeur et le proche, la devise et le taux, et la preuve de remise.
- **FR-036**: Le back-office MUST lister les preuves signalées « position éloignée ».

### Key Entities

- **Proche enregistré** : un destinataire du carnet d'un payeur — surnom, nom, téléphone, point de livraison, adresse. Appartient à un seul payeur.
- **Destinataire de commande** : la copie figée des informations du proche sur un passage en caisse — nom, téléphone, point, adresse, lien éventuel vers le proche du carnet et vers le compte du proche s'il existe.
- **Lien de suivi** : identifiant non devinable rattaché à un passage en caisse, avec sa date d'expiration du détail.
- **Preuve de remise** : sur une livraison — photo, heure de prise de vue, position, distance au point de livraison, signalement éventuel.
- **Conversion de prix** : sur un passage en caisse — devise, taux, montant en devise, montant FCFA encaissé.
- **Taux de change** : taux de référence de chaque devise par rapport au FCFA, sa date de mise à jour, son origine (automatique ou corrigé à la main), et la marge de change en vigueur.
- **Préférence de devise** : la devise d'affichage choisie par un utilisateur.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un payeur qui a déjà un panier passe une commande pour un nouveau proche en moins de 3 minutes, et pour un proche du carnet en moins d'une minute.
- **SC-002**: 95 % des proches reçoivent le SMS d'annonce moins de 2 minutes après la confirmation du paiement.
- **SC-003**: 100 % des commandes pour un proche livrées ont une preuve avec photo, heure et position.
- **SC-004**: 95 % des payeurs reçoivent la notification de remise moins d'une minute après la validation par le livreur (hors absence de réseau du livreur).
- **SC-005**: Pour une commande donnée, le montant en devise affiché au récapitulatif est identique à celui enregistré sur la commande dans 100 % des cas.
- **SC-006**: Le taux d'échec de remise des commandes pour un proche ne dépasse pas celui des commandes ordinaires.
- **SC-007**: Trois mois après le lancement, au moins 30 % des payeurs ayant commandé pour un proche ont repassé une commande pour un proche.
- **SC-008**: Au moins 95 % des utilisateurs qui ouvrent l'application hors du Bénin voient directement l'écran Google / Apple / e-mail, et un utilisateur à l'étranger crée son compte en moins d'une minute avec Google ou Apple.

## Assumptions

- La v1 ne livre qu'au Bénin, dans les zones déjà desservies ; le proche a donc un numéro béninois.
- INTRAM accepte les cartes Visa et Mastercard émises hors UEMOA et encaisse en FCFA ; la conversion côté carte est faite par la banque du payeur. Le montant prélevé sur la carte peut donc différer légèrement du montant en devise affiché ; un message le précise au paiement.
- Le paiement d'une commande pour un proche est intégral avant expédition ; il suit le circuit de versement aux boutiques existant (séquestre, délai de versement).
- N'importe quel compte acheteur peut commander pour un proche ; aucun statut « diaspora » particulier n'est nécessaire.
- Le panier unifié multi-boutiques, le devis de livraison serveur, le code de remise, le suivi en direct et les motifs d'échec de livraison existants sont réutilisés tels quels.
- Les promotions et codes promo s'appliquent comme sur une commande ordinaire.
- Les SMS au proche passent par le fournisseur SMS actuel.
- Les e-mails au payeur sont envoyés en français.

## Out of Scope (v1)

- Portefeuille famille rechargé par la diaspora.
- Panier récurrent.
- Coffrets d'occasion et message personnalisé.
- Expédition de produits vers l'étranger.
- Livraison hors du Bénin.
- Paiement directement en devise (sans conversion par la banque du payeur).
