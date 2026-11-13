# Feature Specification: Module diaspora — Portefeuille famille

**Feature Branch**: `010-family-wallet`
**Created**: 2026-11-13
**Status**: Draft
**Input**: User description: "Module diaspora — « Portefeuille famille ». Un payeur (souvent à l'étranger, compte eBio existant) alimente un portefeuille que ses proches au Bénin dépensent uniquement sur eBio pour leurs courses. Objectif : « l'argent envoyé sert vraiment à nourrir la famille ». Périmètre v1 : ouverture, ajout de proches (depuis le carnet ou en créant un proche), invitation par SMS si le proche n'a pas de compte vérifié ; recharge par carte / Mobile Money ou depuis le portefeuille du payeur, en devise affichée et FCFA encaissés ; paiement des commandes des proches avec ce portefeuille, sans retrait ni transfert ; limites par défaut pour tous les proches, ou propres à un proche ; suivi des achats, notification à chaque achat, suspension et récupération du solde. Hors périmètre : panier récurrent, coffrets, retrait d'espèces."

## Clarifications

### Session 2026-11-13

- Q: Le proche peut-il compléter un solde insuffisant avec un autre moyen de paiement ? → A: Non, le portefeuille famille couvre toute la commande ou n'est pas utilisé.
- Q: Que devient le solde si le payeur supprime son compte ? → A: La suppression est refusée tant que le portefeuille famille n'est pas fermé ; à la fermeture, le solde rejoint son portefeuille personnel.
- Q: Un portefeuille par proche, ou un portefeuille pour plusieurs proches ? → A: Un seul portefeuille famille par payeur, partagé par plusieurs proches. Le payeur ajoute des proches depuis l'écran du portefeuille (carnet existant ou nouveau proche).
- Q: Comment se règlent les limites ? → A: Des limites par défaut s'appliquent à chaque proche du portefeuille ; le payeur peut fixer pour un proche des limites qui remplacent celles par défaut.

## Vocabulaire

- **Payeur** : la personne qui ouvre et recharge le portefeuille famille, souvent à l'étranger. A un compte eBio.
- **Portefeuille famille** : une réserve d'argent unique d'un payeur, dépensable seulement en commandes eBio par les proches qu'il y a ajoutés. Distinct du portefeuille personnel de chacun.
- **Membre** : un proche ajouté au portefeuille famille. A (ou aura) un compte eBio au numéro vérifié par SMS.
- **Limites par défaut** : les limites que le payeur fixe pour tous les membres.
- **Limites propres** : les limites que le payeur fixe pour un membre précis ; elles remplacent les limites par défaut pour ce membre.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ouvrir le portefeuille, ajouter des proches, recharger (Priority: P1)

Awa, à Paris, ouvre son portefeuille famille. Depuis l'écran du portefeuille, elle touche « Ajouter un proche » : elle choisit sa mère dans son carnet, puis crée sur place sa tante, qui n'y était pas. Elle recharge le portefeuille de 100 € par carte. Sa mère et sa tante sont prévenues qu'elles peuvent faire leurs courses avec.

**Why this priority**: Sans portefeuille, sans membres et sans argent, rien d'autre n'existe.

**Independent Test**: Un payeur ouvre son portefeuille, y ajoute un proche du carnet et un nouveau proche, le recharge par carte (sandbox) puis depuis son portefeuille personnel ; le solde apparaît chez le payeur et chez chaque membre, et chaque membre est prévenu.

**Acceptance Scenarios**:

1. **Given** un payeur sans portefeuille famille, **When** il l'ouvre, **Then** un portefeuille unique, vide et sans membre, est créé pour lui ; il ne peut pas en ouvrir un second.
2. **Given** l'écran du portefeuille, **When** le payeur touche « Ajouter un proche », **Then** il peut choisir un proche de son carnet, ou en créer un nouveau (nom, téléphone `+229`, adresse et point facultatifs, choix possible dans les contacts du téléphone) qui rejoint aussi son carnet.
3. **Given** un membre ajouté dont le numéro correspond à un compte eBio vérifié par SMS, **When** il est ajouté, **Then** il est actif et prévenu par SMS et notification.
4. **Given** un portefeuille, **When** le payeur le recharge par carte ou Mobile Money, **Then** le montant encaissé en FCFA est crédité dès la confirmation du paiement, et chaque membre actif est prévenu.
5. **Given** un portefeuille personnel du payeur suffisamment approvisionné, **When** le payeur recharge depuis celui-ci, **Then** le montant passe immédiatement de l'un à l'autre.
6. **Given** un payeur dont la devise d'affichage est l'euro, **When** il choisit un montant de recharge, **Then** il voit le montant en euros et le montant FCFA réellement encaissé.
7. **Given** un proche déjà membre, **When** le payeur l'ajoute de nouveau, **Then** c'est refusé.

---

### User Story 2 - Un membre paie ses courses avec le portefeuille famille (Priority: P1)

La mère d'Awa fait ses courses. Au passage en caisse, elle choisit « Portefeuille famille (Awa) — 15 000 FCFA disponibles pour vous ce mois-ci ». La commande est payée, sans Mobile Money ni espèces.

**Why this priority**: C'est la promesse faite au payeur : l'argent sert aux courses de la famille.

**Independent Test**: Un membre, connecté, passe une commande payée intégralement par le portefeuille famille ; le solde du portefeuille baisse du montant, la commande suit son cours normal et la boutique est payée comme pour toute commande.

**Acceptance Scenarios**:

1. **Given** un membre actif d'un portefeuille famille actif, **When** il passe commande, **Then** le moyen de paiement « Portefeuille famille » lui est proposé avec le prénom du payeur et le montant qu'il peut encore dépenser (le plus petit entre le solde du portefeuille et ce que ses limites lui laissent).
2. **Given** une commande payée par le portefeuille famille, **When** elle est confirmée, **Then** le solde est débité du total et la commande est traitée comme une commande payée en ligne (boutique, livraison, séquestre, versement inchangés).
3. **Given** un membre de plusieurs portefeuilles famille (plusieurs payeurs), **When** il passe commande, **Then** il choisit lequel utiliser.
4. **Given** un membre, **When** il cherche à retirer de l'argent, à le transférer ou à le verser sur son portefeuille personnel, **Then** aucune de ces actions n'existe.
5. **Given** une commande payée par le portefeuille famille puis annulée ou en échec de livraison, **When** le remboursement a lieu, **Then** il revient sur le portefeuille famille, et le montant redevient dépensable par ce membre dans le mois.
6. **Given** un montant dépensable inférieur au total du panier, **When** le membre passe en caisse, **Then** le portefeuille famille n'est pas proposé ; le membre voit le montant dont il dispose et peut réduire son panier ou payer entièrement par un autre moyen. Il n'y a pas de paiement partagé.
7. **Given** deux membres qui commandent au même moment, **When** le solde ne couvre que l'une des deux commandes, **Then** une seule est payée par le portefeuille ; l'autre est refusée avec un message clair.

---

### User Story 3 - Limites par défaut et limites propres à un proche (Priority: P1)

Awa fixe des limites par défaut : 40 000 FCFA par mois et 15 000 FCFA par commande pour chaque proche. Sa mère ayant plus de besoins, Awa lui donne des limites propres : 80 000 FCFA par mois. Sa tante garde les limites par défaut.

**Why this priority**: Avec plusieurs proches sur un même solde, sans limite, le premier qui commande peut tout dépenser. Les limites rendent le partage praticable.

**Independent Test**: Avec des limites par défaut de 10 000 FCFA par mois et des limites propres de 20 000 FCFA pour un membre, le premier membre est refusé au-delà de 10 000 FCFA, le second au-delà de 20 000 FCFA, et les deux retrouvent leur plafond le mois suivant.

**Acceptance Scenarios**:

1. **Given** des limites par défaut, **When** un membre sans limites propres commande, **Then** les limites par défaut s'appliquent à lui seul : chaque membre a son propre plafond mensuel, décompté sur ses seules commandes.
2. **Given** des limites propres pour un membre, **When** il commande, **Then** ses limites propres s'appliquent à la place des limites par défaut ; une limite propre non renseignée reprend la valeur par défaut.
3. **Given** un plafond mensuel, **When** une commande ferait dépasser ce plafond sur le mois civil en cours, **Then** le portefeuille n'est pas proposé, avec le montant encore dépensable ce mois-ci.
4. **Given** un maximum par commande, **When** le total d'une commande le dépasse, **Then** le portefeuille n'est pas proposé, avec la limite affichée.
5. **Given** une liste de catégories autorisées (par défaut ou propre), **When** le panier contient un produit d'une autre catégorie, **Then** le portefeuille n'est pas proposé, et les produits concernés sont signalés.
6. **Given** des limites modifiées, **When** elles sont enregistrées, **Then** elles s'appliquent aux commandes suivantes, jamais aux commandes déjà payées.
7. **Given** aucune limite, **When** un membre commande, **Then** seul le solde du portefeuille limite l'usage.
8. **Given** des limites propres, **When** le payeur les retire, **Then** le membre revient aux limites par défaut.

---

### User Story 4 - Le payeur suit les achats (Priority: P1)

À chaque commande d'un membre, Awa reçoit une notification « Maman a commandé chez Ferme Bio Tori : 6 800 FCFA ». Dans l'app, elle voit le solde, ce que chaque proche a dépensé ce mois-ci, et l'historique des achats.

**Why this priority**: La transparence est ce qui distingue ce service d'un transfert d'argent.

**Independent Test**: Après une recharge et des achats de deux membres, le payeur voit le solde exact, la dépense du mois par membre, l'historique filtrable par membre, et a reçu une notification par achat.

**Acceptance Scenarios**:

1. **Given** un achat d'un membre payé par le portefeuille, **When** la commande est confirmée, **Then** le payeur reçoit une notification push avec le surnom du membre, la boutique et le montant.
2. **Given** le portefeuille, **When** le payeur l'ouvre, **Then** il voit le solde (dans sa devise et en FCFA), la liste des membres avec, pour chacun, la dépense du mois et ses limites, et l'historique : recharges, achats (membre, produits, boutique, montant), remboursements.
3. **Given** l'historique, **When** le payeur choisit un membre, **Then** seules les opérations de ce membre s'affichent.
4. **Given** un achat, **When** le payeur consulte son détail, **Then** il ne voit ni l'adresse précise ni les échanges entre le membre et la boutique.
5. **Given** un membre, **When** il ouvre le portefeuille famille, **Then** il voit ce qu'il peut encore dépenser, ses limites et ses propres achats, mais ni le solde total ni les achats des autres membres.

---

### User Story 5 - Gérer les membres, suspendre, fermer (Priority: P2)

Awa met en pause l'accès de sa tante, partie en voyage, sans toucher à celui de sa mère. Plus tard, elle retire sa tante du portefeuille. Un jour, elle ferme le portefeuille : le solde restant revient sur son portefeuille eBio.

**Why this priority**: Le payeur doit garder la main sur son argent et sur qui le dépense.

**Independent Test**: Le payeur suspend un membre (qui ne peut plus payer), le réactive, le retire, suspend tout le portefeuille, puis le ferme ; le solde est crédité sur son portefeuille personnel.

**Acceptance Scenarios**:

1. **Given** un membre actif, **When** le payeur le suspend, **Then** ce membre ne peut plus payer avec le portefeuille ; les autres membres le peuvent toujours ; il est prévenu.
2. **Given** un membre, **When** le payeur le retire du portefeuille, **Then** il perd l'accès, ses achats passés restent dans l'historique, et il reste dans le carnet du payeur.
3. **Given** un portefeuille, **When** le payeur le suspend en entier, **Then** aucun membre ne peut plus l'utiliser jusqu'à sa réactivation.
4. **Given** un portefeuille avec un solde, **When** le payeur le ferme, **Then** le solde non dépensé est crédité sur son portefeuille personnel, et le portefeuille ne peut plus être rechargé ni utilisé.
5. **Given** une commande payée par le portefeuille et encore en cours, **When** le payeur le ferme, **Then** la fermeture est acceptée ; un remboursement ultérieur de cette commande va sur le portefeuille personnel du payeur.

---

### User Story 6 - Inviter un proche qui n'a pas encore de compte (Priority: P2)

La tante d'Awa n'utilise pas eBio. Awa l'ajoute quand même. La tante reçoit un SMS : « Awa vous a ajoutée à son portefeuille famille eBio. Installez eBio avec ce numéro pour faire vos courses : <lien> ».

**Why this priority**: Beaucoup de proches n'ont pas encore l'app ; sans invitation, le portefeuille ne sert qu'aux clients existants.

**Independent Test**: Un payeur ajoute un numéro sans compte ; un SMS d'invitation part ; la personne crée un compte par code SMS avec ce numéro et retrouve l'accès au portefeuille.

**Acceptance Scenarios**:

1. **Given** un proche sans compte vérifié, **When** le payeur l'ajoute, **Then** il devient membre « en attente » et un SMS d'invitation part.
2. **Given** un membre en attente, **When** une personne crée un compte et vérifie ce numéro par SMS, **Then** l'accès lui est rattaché et devient actif.
3. **Given** un membre en attente depuis 30 jours, **When** le délai passe, **Then** le payeur est prévenu et peut renvoyer l'invitation ou retirer le membre.
4. **Given** un numéro saisi dans un profil sans vérification par SMS, **When** il correspond, **Then** l'accès n'est pas rattaché.

---

### Edge Cases

- **Solde épuisé par un membre** : les autres membres ne peuvent plus payer non plus ; les limites par membre sont là pour l'éviter, et le payeur est prévenu quand le solde passe sous un seuil (FR-026).
- **Recharge échouée ou abandonnée** : rien n'est crédité ; le payeur peut réessayer.
- **Membre qui change de numéro** : l'accès reste rattaché à son compte, pas au numéro.
- **Compte d'un membre suspendu par eBio** : ce membre ne peut pas utiliser le portefeuille ; les autres le peuvent.
- **Payeur qui supprime son compte** : refusé tant que le portefeuille famille n'est pas fermé (FR-031).
- **Payeur membre de son propre portefeuille** : refusé.
- **Plusieurs payeurs pour un même proche** : chacun a son propre portefeuille ; le proche choisit au passage en caisse ; limites et suivi restent propres à chaque payeur.
- **Membre retiré puis ré-ajouté** : il retrouve les limites par défaut ; sa dépense du mois en cours compte toujours.
- **Promotion ou code promo** : s'applique comme sur toute commande ; seul le montant final est débité et compté dans les limites.

## Requirements *(mandatory)*

### Functional Requirements

**Portefeuille et membres**

- **FR-001**: Un payeur MUST pouvoir ouvrir un seul portefeuille famille.
- **FR-002**: Depuis l'écran du portefeuille, le payeur MUST pouvoir ajouter un membre choisi dans son carnet de proches, ou créer un nouveau proche (qui rejoint aussi le carnet), avec le choix possible dans les contacts du téléphone.
- **FR-003**: Un proche MUST être membre au plus une fois d'un même portefeuille ; le payeur MUST NOT pouvoir être membre de son propre portefeuille.
- **FR-004**: Un membre MUST être rattaché au compte dont le numéro vérifié par SMS correspond à son numéro ; jamais à un numéro saisi sans vérification.
- **FR-005**: Sans compte vérifié correspondant, le membre MUST être « en attente », un SMS d'invitation MUST être envoyé, et le rattachement MUST se faire automatiquement à la vérification du numéro.
- **FR-006**: Le payeur MUST pouvoir suspendre, réactiver et retirer un membre ; un membre retiré MUST rester dans le carnet et ses achats passés dans l'historique.

**Recharge**

- **FR-007**: Le payeur MUST pouvoir recharger par carte bancaire ou Mobile Money (encaissement en FCFA), ou par virement immédiat depuis son portefeuille personnel.
- **FR-008**: Le montant de recharge MUST être affiché dans la devise du payeur et en FCFA, avec la même mention de taux qu'au passage en caisse.
- **FR-009**: Une recharge MUST être créditée seulement après confirmation du paiement, une seule fois.
- **FR-010**: Une recharge MUST être d'au moins 1 000 FCFA et d'au plus 500 000 FCFA.
- **FR-011**: Chaque membre actif MUST être prévenu d'une recharge par notification (et SMS), avec le prénom du payeur ; le montant indiqué est ce qu'il peut dépenser, pas le solde total.

**Dépense**

- **FR-012**: Au passage en caisse, un membre actif MUST se voir proposer chaque portefeuille famille actif dont il est membre, avec le prénom du payeur et son montant dépensable : le plus petit entre le solde du portefeuille et ce que ses limites lui laissent.
- **FR-013**: Le portefeuille famille MUST couvrir toute la commande ; un paiement partagé avec un autre moyen MUST NOT exister.
- **FR-014**: Un paiement par portefeuille famille MUST débiter le solde de façon atomique ; le solde MUST NOT devenir négatif, y compris quand plusieurs membres paient en même temps.
- **FR-015**: Une commande payée par portefeuille famille MUST suivre le même circuit qu'une commande payée en ligne (boutique, livraison, séquestre, versement, commission).
- **FR-016**: Le portefeuille famille MUST NOT permettre de retrait d'espèces, de transfert vers un autre compte, ni de versement vers le portefeuille personnel d'un membre.
- **FR-017**: Le remboursement d'une commande payée par portefeuille famille MUST revenir sur ce portefeuille s'il est ouvert, sur le portefeuille personnel du payeur sinon ; le montant remboursé MUST être retiré de la dépense du mois du membre.

**Limites**

- **FR-018**: Le payeur MUST pouvoir fixer des limites par défaut : plafond de dépense par mois civil et par membre, maximum par commande, catégories autorisées ; chacune est facultative.
- **FR-019**: Le payeur MUST pouvoir fixer pour un membre des limites propres, qui remplacent les limites par défaut pour ce membre ; une limite propre non renseignée MUST reprendre la valeur par défaut.
- **FR-020**: Le plafond mensuel MUST se compter sur les seuls achats du membre concerné, remboursements déduits.
- **FR-021**: Une commande qui enfreint une limite MUST se voir refuser le portefeuille, avec la raison et le reste dépensable en clair.
- **FR-022**: Les limites MUST s'appliquer au moment du paiement ; un changement MUST NOT affecter une commande déjà payée.

**Suivi**

- **FR-023**: Le payeur MUST recevoir une notification push à chaque achat payé par le portefeuille, avec le surnom du membre, la boutique et le montant.
- **FR-024**: Le payeur MUST voir le solde (dans sa devise et en FCFA), la liste des membres avec leur statut, leurs limites en vigueur et leur dépense du mois, et l'historique (recharges, achats avec membre, produits et boutique, remboursements), filtrable par membre.
- **FR-025**: Un membre MUST voir son montant dépensable, ses limites et ses propres achats ; il MUST NOT voir le solde total ni les achats des autres membres.
- **FR-026**: Le payeur MUST être prévenu quand le solde passe sous un seuil qu'il choisit (par défaut 5 000 FCFA).
- **FR-027**: Le payeur MUST NOT voir l'adresse précise de livraison d'un membre ni ses messages avec les boutiques.

**Contrôle du payeur**

- **FR-028**: Le payeur MUST pouvoir suspendre et réactiver tout le portefeuille ; les membres MUST être prévenus.
- **FR-029**: Le payeur MUST pouvoir fermer le portefeuille ; le solde non dépensé MUST être crédité sur son portefeuille personnel, immédiatement et une seule fois.
- **FR-030**: Un membre en attente depuis 30 jours MUST faire l'objet d'une notification au payeur, qui peut renvoyer l'invitation ou retirer le membre.
- **FR-031**: La suppression du compte du payeur MUST être refusée tant que son portefeuille famille n'est pas fermé, avec un message qui l'invite à le fermer d'abord.

**Back-office**

- **FR-032**: Le back-office MUST lister les portefeuilles famille (payeur, nombre de membres, statut, solde) avec leurs membres et leur historique, et intégrer leurs soldes aux comptes de la plateforme existants.
- **FR-033**: Le back-office MUST pouvoir suspendre un portefeuille ou un membre (fraude, litige), avec trace d'audit.

### Key Entities

- **Portefeuille famille** : payeur (unique), statut (actif, suspendu, fermé), solde, seuil d'alerte, limites par défaut.
- **Membre** : portefeuille, proche du carnet, compte rattaché (ou en attente), statut (en attente, actif, suspendu, retiré), limites propres facultatives.
- **Limites** : plafond mensuel, maximum par commande, catégories autorisées — chacune facultative, au niveau du portefeuille (par défaut) ou d'un membre (propre).
- **Opération** : recharge, achat, remboursement, restitution au payeur ; montant FCFA, solde après, membre et commande liés le cas échéant.
- **Recharge** : montant FCFA, devise et taux affichés au payeur, moyen (carte / Mobile Money / portefeuille personnel), statut de paiement.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un payeur ouvre son portefeuille, ajoute deux proches et le recharge en moins de 3 minutes.
- **SC-002**: 95 % des recharges confirmées sont utilisables par les membres en moins d'une minute.
- **SC-003**: 100 % des achats payés par portefeuille famille déclenchent une notification au payeur en moins d'une minute.
- **SC-004**: Aucun solde ne devient négatif et aucun membre ne dépasse ses limites, y compris sous commandes simultanées de plusieurs membres.
- **SC-005**: Le solde d'un portefeuille est égal, à tout instant, à ses recharges moins les achats, plus les remboursements, moins les restitutions.
- **SC-006**: Trois mois après le lancement, au moins 40 % des portefeuilles ouverts ont été rechargés au moins deux fois, et au moins 30 % comptent deux membres ou plus.

## Assumptions

- Le portefeuille famille est un **crédit d'achat prépayé utilisable uniquement sur eBio** (réseau fermé), comme le portefeuille personnel existant : il n'est jamais converti en espèces pour un membre. **Point à valider par un conseil juridique avant lancement** : le statut réglementaire (BCEAO) de fonds détenus pour le compte d'un tiers.
- Le payeur peut toujours récupérer le solde non dépensé : l'argent reste le sien tant qu'il n'est pas dépensé.
- Les membres ont, ou créent, un compte eBio vérifié par SMS (Bénin).
- Le carnet de proches (module 009) est la liste dans laquelle le payeur choisit ; ajouter un nouveau proche depuis le portefeuille l'ajoute aussi au carnet.
- Les remboursements suivent les règles existantes ; seule leur destination change.
- Les recharges réutilisent le circuit de recharge existant (INTRAM, page hébergée, confirmation par sondage).
- Les montants sont stockés et débités en FCFA ; la devise ne sert qu'à l'affichage.
- Pas de SMS vers un numéro hors Bénin (règle existante).

## Out of Scope (v1)

- Panier récurrent, coffrets d'occasion.
- Retrait d'espèces, transfert entre portefeuilles, versement vers le portefeuille personnel d'un membre.
- Plusieurs portefeuilles famille pour un même payeur.
- Recharge automatique périodique.
- Plafond global de dépense de toute la famille sur le mois (au-delà du solde lui-même).
