# Feature Specification: Avis et notes par produit

**Feature Branch**: `007-product-reviews`
**Created**: 2026-09-22
**Status**: Draft
**Input**: User description: "Avis et notes par produit. Un acheteur note chaque produit qu'il a reçu, et la fiche produit affiche les avis de ce produit seul."

## Vue d'ensemble

Les avis de la plateforme portent aujourd'hui sur la **boutique**, jamais sur ce qu'on achète. Un acheteur qui commande des tomates, du miel et un savon chez le même maraîcher laisse **un seul avis** pour les trois, noté sur quatre critères pensés pour un vendeur : qualité, délai, communication, conformité.

Conséquence directe sur la fiche produit : elle affiche la note du **fournisseur**. Un maraîcher irréprochable tire vers le haut un produit médiocre, et rien ne permet de les distinguer. Sur une place de marché alimentaire, c'est un angle mort : on achète un produit, pas une moyenne de boutique.

La cible : **un avis par produit reçu, une note lisible sur la fiche**. La note de la boutique quitte la fiche produit — la fiche fournisseur affiche déjà ses propres avis, et deux notes voisines sur un même écran empêchent de savoir laquelle lire.

Le parcours ne s'allonge pas. La notation des produits devient une étape du parcours de notation qui existe déjà après une livraison ; aucune nouvelle invite, aucune nouvelle entrée de navigation.

## Clarifications

### Session 2026-09-22

- Q: La fiche produit affiche-t-elle aussi la note de la boutique ? → A: Non. Le produit seul. La fiche fournisseur porte déjà ses avis.
- Q: Quels critères pour un produit ? → A: Une note unique de 1 à 5, plus un commentaire facultatif. Les quatre critères de la boutique ne transposent pas — « délai » et « communication » ne veulent rien dire pour une tomate.
- Q: Qui peut noter ? → A: Uniquement l'acheteur d'une ligne de commande livrée, une fois par ligne.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Noter les produits reçus (Priority: P1)

Après une livraison, l'acheteur ouvre le parcours de notation depuis sa commande. Il note la boutique, puis le livreur, puis arrive sur la liste des produits qu'il vient de recevoir : une ligne par produit, cinq étoiles. Il touche trois étoiles sur les tomates ; un champ de commentaire apparaît alors sous cette ligne, qu'il peut remplir ou ignorer. Il laisse les autres produits sans note et valide.

**Why this priority**: Sans avis déposés, il n'y a rien à afficher. C'est la seule histoire qui doit exister pour que la fonctionnalité ait un sens, et elle se suffit à elle-même : les avis s'accumulent même si l'affichage arrive plus tard.

**Independent Test**: Passer une commande jusqu'à la livraison, ouvrir la notation, noter un produit sur deux, valider. Vérifier que l'avis est enregistré pour le bon produit et la bonne ligne de commande, et que le produit non noté n'en a pas.

**Acceptance Scenarios**:

1. **Given** une commande livrée contenant trois produits, **When** l'acheteur ouvre le parcours de notation, **Then** il voit une ligne par produit reçu, chacune avec cinq étoiles vides.
2. **Given** l'étape produits affichée, **When** l'acheteur touche une étoile sur une ligne, **Then** un champ de commentaire facultatif apparaît sous cette ligne seulement.
3. **Given** l'acheteur n'a noté aucun produit, **When** il valide l'étape, **Then** le parcours se termine normalement et aucun avis produit n'est créé.
4. **Given** l'acheteur a déjà noté un produit d'une commande, **When** il rouvre le parcours pour cette même commande, **Then** sa note précédente est affichée et il ne peut pas en déposer une seconde pour la même ligne.
5. **Given** une commande qui n'est pas au statut livré, **When** on tente de déposer un avis produit, **Then** la plateforme le refuse.

---

### User Story 2 - Lire la note d'un produit avant d'acheter (Priority: P1)

Un acheteur ouvre une fiche produit. Sous le prix, il voit une ligne compacte : la note moyenne et le nombre d'avis. Plus bas, une section « Avis » lui montre la moyenne, la répartition des notes de 1 à 5 étoiles, et les deux ou trois avis les plus récents.

**Why this priority**: C'est la raison d'être de la fonctionnalité côté acheteur. Sans cette lecture, les avis collectés ne servent à personne.

**Independent Test**: Ouvrir une fiche produit ayant reçu des avis et vérifier que la note affichée est celle du produit, que la boutique n'apparaît plus comme note, et que les avis listés portent bien sur ce produit.

**Acceptance Scenarios**:

1. **Given** un produit ayant reçu au moins trois avis, **When** l'acheteur ouvre sa fiche, **Then** la note moyenne et le nombre d'avis s'affichent près du prix.
2. **Given** un produit ayant reçu moins de trois avis, **When** l'acheteur ouvre sa fiche, **Then** aucune moyenne n'est affichée ; les avis déposés restent consultables.
3. **Given** un produit sans aucun avis, **When** l'acheteur ouvre sa fiche, **Then** la section invite à être le premier à donner son avis, sans afficher de note nulle ni de zéro étoile.
4. **Given** n'importe quelle fiche produit, **When** l'acheteur la consulte, **Then** la note de la boutique n'y figure plus.
5. **Given** un acheteur sur une connexion lente, **When** il ouvre une fiche produit, **Then** la note et le nombre d'avis s'affichent avec le reste de la fiche, sans attendre le chargement des textes d'avis.

---

### User Story 3 - Consulter tous les avis d'un produit (Priority: P2)

Depuis la section « Avis » de la fiche, l'acheteur touche « Voir les 23 avis » et arrive sur un écran dédié qui liste les avis du produit, du plus récent au plus ancien, en chargeant la suite à mesure qu'il descend.

**Why this priority**: Utile dès qu'un produit dépasse quelques avis, mais la fiche seule délivre déjà l'essentiel de la valeur.

**Independent Test**: Sur un produit ayant plus d'avis qu'une page, ouvrir l'écran complet, descendre, vérifier que la page suivante se charge et qu'aucun avis n'est dupliqué ni omis.

**Acceptance Scenarios**:

1. **Given** un produit ayant plus d'avis qu'une page, **When** l'acheteur atteint le bas de la liste, **Then** la page suivante se charge et s'ajoute à la suite.
2. **Given** l'écran des avis d'un produit, **When** il s'affiche, **Then** chaque avis montre la note, le commentaire s'il existe, et la date.

---

### User Story 4 - Signaler et modérer un avis (Priority: P3)

Un acheteur signale un avis qu'il juge abusif. Un membre du back-office retrouve le signalement, lit l'avis, et le masque si nécessaire. Un avis masqué disparaît des listes et cesse de compter dans la moyenne.

**Why this priority**: Indispensable à terme, mais aucun avis abusif ne peut exister avant que des avis existent. Peut suivre la mise en production des trois premières histoires.

**Independent Test**: Signaler un avis depuis l'application, le retrouver dans le back-office, le masquer, puis vérifier qu'il a quitté la liste publique et que la moyenne du produit a été recalculée sans lui.

**Acceptance Scenarios**:

1. **Given** un avis publié, **When** un acheteur le signale, **Then** le signalement est enregistré et l'avis reste visible en attendant la décision.
2. **Given** un avis masqué par la modération, **When** un acheteur consulte la fiche, **Then** l'avis n'apparaît plus et la moyenne ne le compte plus.

---

### Edge Cases

- **Produit retiré ou boutique suspendue** : les avis déposés survivent mais ne sont consultables que là où le produit l'est. Un produit masqué reste inaccessible, avis compris.
- **Produit supprimé définitivement** : ses avis partent avec lui. Ils ne portent sur rien d'autre.
- **Commande annulée après notation** : l'avis est retiré du calcul. Noter suppose avoir reçu.
- **Même produit commandé deux fois** : deux lignes de commande distinctes, donc deux avis possibles, un par livraison. C'est voulu : la qualité d'un produit frais varie d'une livraison à l'autre.
- **Produit livré partiellement ou refusé** : seules les lignes effectivement livrées sont proposées à la notation.
- **Note déposée sans commentaire** : cas normal et majoritaire ; la moyenne la compte comme n'importe quelle autre.
- **Commentaire sans note** : impossible. Le champ n'apparaît qu'après une étoile touchée.
- **Produit ancien sans avis** : la fiche n'affiche ni note ni zéro ; elle invite à être le premier.
- **Tri par note avec des produits non notés** : les produits sans moyenne publiée passent après ceux qui en ont une, puis se départagent comme aujourd'hui.
- **Avis très anciens** : la moyenne pondère les avis récents plus fortement, comme le fait déjà celle des boutiques.

## Requirements *(mandatory)*

### Functional Requirements

**Dépôt d'un avis**

- **FR-001**: La plateforme MUST permettre à un acheteur de déposer une note de 1 à 5 sur un produit qu'il a reçu.
- **FR-002**: La plateforme MUST rattacher chaque avis à la ligne de commande qui l'autorise, et MUST refuser un second avis sur cette même ligne.
- **FR-003**: La plateforme MUST refuser tout avis portant sur une commande qui n'est pas livrée.
- **FR-004**: La plateforme MUST accepter un commentaire facultatif accompagnant la note, et MUST refuser un commentaire sans note.
- **FR-005**: La plateforme MUST proposer la notation des produits comme une étape du parcours de notation existant après livraison, et MUST NOT créer d'autre point d'entrée.
- **FR-006**: L'acheteur MUST pouvoir terminer le parcours sans noter aucun produit.
- **FR-007**: La plateforme MUST n'appliquer les quatre critères existants qu'à la boutique ; un avis produit MUST porter une note unique.

**Lecture**

- **FR-008**: La fiche produit MUST afficher la note moyenne et le nombre d'avis du produit.
- **FR-009**: La fiche produit MUST NOT afficher la note de la boutique.
- **FR-010**: La plateforme MUST masquer la moyenne d'un produit tant qu'il compte moins de trois avis, tout en laissant ces avis consultables.
- **FR-011**: La fiche produit MUST présenter la répartition des notes de 1 à 5 étoiles et les avis les plus récents.
- **FR-012**: La plateforme MUST offrir un écran listant tous les avis d'un produit, du plus récent au plus ancien, chargé par pages.
- **FR-013**: La note et le nombre d'avis MUST apparaître en même temps que le reste de la fiche produit, sans attente propre.
- **FR-014**: L'ouverture d'une fiche produit MUST NOT coûter le temps de récupérer les textes des avis ; ceux-ci n'arrivent que lorsque l'acheteur atteint la section qui les présente.

**Agrégat et classement**

- **FR-015**: La plateforme MUST tenir à jour la moyenne et le nombre d'avis de chaque produit à chaque dépôt, masquage ou retrait d'avis.
- **FR-016**: La moyenne d'un produit MUST pondérer les avis récents plus fortement que les anciens, selon la même règle que celle des boutiques.
- **FR-017**: Le tri des résultats de recherche par note MUST s'appuyer sur la note du produit, et MUST classer après eux les produits sans moyenne publiée.

**Modération**

- **FR-018**: Un acheteur MUST pouvoir signaler un avis.
- **FR-019**: Le back-office MUST permettre de consulter les avis signalés et de masquer un avis.
- **FR-020**: Un avis masqué MUST disparaître des listes publiques et MUST cesser de compter dans la moyenne.
- **FR-021**: Le dépôt d'un avis produit MUST passer par les mêmes contrôles anti-fraude que les avis de boutique.

**Continuité**

- **FR-022**: Les avis de boutique existants MUST continuer de fonctionner sans changement, y compris sur la fiche fournisseur.
- **FR-023**: L'application fournisseur MUST NOT être affectée.

### Key Entities

- **Avis produit** : une note de 1 à 5 et un commentaire facultatif, déposés par un acheteur sur un produit, rattachés à la ligne de commande qui les autorise. Porte sa date et son état de visibilité.
- **Ligne de commande** : ce qui prouve l'achat. Elle relie un acheteur, un produit et une livraison, et n'autorise qu'un seul avis.
- **Produit** : porte désormais sa propre moyenne et son nombre d'avis publiés, au même titre qu'une boutique porte les siens.
- **Signalement** : l'indication par un acheteur qu'un avis lui paraît abusif, en attente d'une décision de modération.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un acheteur note les produits d'une commande en moins de 30 secondes, sans quitter le parcours de notation.
- **SC-002**: Au moins 25 % des commandes livrées donnent lieu à au moins un avis produit dans le mois suivant la mise en production.
- **SC-003**: La fiche produit s'affiche dans le même temps qu'avant la fonctionnalité, note comprise — l'ajout ne coûte aucune attente supplémentaire.
- **SC-004**: Sur une connexion mobile lente, la note d'un produit est lisible avant que les textes d'avis n'aient été demandés.
- **SC-005**: Aucun avis ne peut être déposé par quelqu'un n'ayant pas reçu le produit : sur un échantillon d'avis publiés, 100 % correspondent à une ligne de commande livrée.
- **SC-006**: Un avis signalé est traité par la modération en moins de 48 heures.
- **SC-007**: Les notes de boutique restent inchangées après la mise en production : aucune moyenne de fournisseur ne varie du fait de cette fonctionnalité.

## Assumptions

- **Pas de modification ni de suppression d'un avis par son auteur.** Les avis de boutique ne le permettent pas aujourd'hui ; le produit suit la même règle, et la modération reste la voie de recours.
- **Aucun délai limite pour noter.** Les avis de boutique n'en ont pas ; imposer une échéance ici créerait une asymétrie inexpliquée.
- **Le parcours de notation reste unique et facultatif.** Il n'est ni bloquant ni répété : l'acheteur qui l'ignore n'est pas relancé au-delà du bouton présent sur sa commande livrée.
- **Le seuil de trois avis est repris tel quel** de celui des boutiques, pour qu'un produit à un seul avis enthousiaste n'écrase pas le classement.
- **L'identité de l'auteur d'un avis** est affichée comme elle l'est déjà pour les avis de boutique, sans changement de règle.
- **Les avis sont rédigés en français** et ne font l'objet d'aucune traduction.

## Hors périmètre

Écarté délibérément, pour que la fonctionnalité n'alourdisse ni l'application ni l'exploitation :

- **Photos dans les avis** — stockage, modération à faire, et temps d'envoi sur un réseau mobile qu'on vient d'optimiser.
- **Réponse du vendeur à un avis** — ce serait une messagerie déguisée, et la plateforme en a déjà une.
- **Écran « mes avis »** pour l'acheteur.
- **Notation sans achat** depuis la fiche produit — porte ouverte aux faux avis.
- **Toute nouvelle entrée de navigation** : la commande livrée et la fiche produit sont les seuls chemins.
- **Traduction, classement des avis par utilité, votes « avis utile ».**
