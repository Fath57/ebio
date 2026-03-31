# Feature Specification: eBio Marketplace V1 — Plateforme Complète

**Feature Branch**: `001-ebio-marketplace-v1`
**Created**: 2026-03-23
**Status**: Draft
**Input**: Cahier des charges eBio v3.0 — Application mobile de mise en relation géolocalisée pour les produits biologiques et agricoles transformés

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Recherche géolocalisée de produits (Priority: P1)

Un acheteur ouvre eBio sans créer de compte. Après avoir autorisé la géolocalisation, il voit une barre de recherche proéminente et des suggestions populaires. Il saisit "huile de palme" et obtient une liste de fournisseurs triés par distance, chacun affichant le nom de la boutique, la photo du produit, le prix, la distance, la note étoiles, le mode disponible (Contacter ou Commander) et le badge "Validé eBio" si applicable. Il peut basculer entre une vue liste et une vue carte interactive. Il peut filtrer par distance (1/5/10 km ou personnalisé), catégorie, prix maximum, disponibilité, note minimum, mode disponible et badge Validé eBio. Il peut trier par distance, note ou prix croissant.

**Why this priority**: La recherche géolocalisée est le cœur du produit — le "Google Maps des produits bio locaux". Sans cette fonctionnalité, eBio n'a aucune proposition de valeur.

**Independent Test**: Un utilisateur non inscrit peut ouvrir l'application, autoriser la géolocalisation, saisir un nom de produit et voir des résultats de fournisseurs proches triés par distance en moins de 30 secondes.

**Acceptance Scenarios**:

1. **Given** un utilisateur au premier lancement, **When** il autorise la géolocalisation et saisit "huile de palme", **Then** il voit une liste de fournisseurs à proximité triés par distance croissante, chacun avec nom, photo, prix, distance, note et mode disponible.
2. **Given** des résultats de recherche affichés, **When** l'acheteur active le filtre "distance < 5 km" et "note ≥ 4 étoiles", **Then** seuls les fournisseurs correspondant à ces critères sont affichés.
3. **Given** des résultats de recherche en vue liste, **When** l'acheteur appuie sur "Carte", **Then** les mêmes résultats s'affichent comme marqueurs sur une carte interactive centrée sur sa position.
4. **Given** un acheteur naviguant par catégories via pictogrammes (Huiles, Céréales, Légumes, Semences, Compost, Autres), **When** il sélectionne une catégorie, **Then** les fournisseurs proches proposant cette catégorie s'affichent.
5. **Given** un acheteur sans connexion réseau, **When** il effectue une recherche, **Then** les résultats en cache local et les recherches récentes sont accessibles.

---

### User Story 2 — Inscription et profil fournisseur avec catalogue (Priority: P2)

Un fournisseur (d'intrants biologiques ou transformateur agricole) s'inscrit via son numéro de téléphone et un code OTP. Il remplit son profil : nom de boutique, type d'activité, photo, localisation GPS, numéro Mobile Money. Il fournit une pièce d'identité en photo et optionnellement des preuves d'activité. Son profil passe en statut "En attente de validation". En attendant, il prépare son catalogue : il ajoute des produits avec photos (3 max), nom, catégorie, prix unitaire + unité, variantes optionnelles, stock disponible, seuil d'alerte de rupture, description courte (texte ou note vocale), et statut (Actif / En rupture / Masqué). Il choisit son mode : Mise en relation ou Commande. Il configure ses horaires et, en Mode Commande, ses zones de livraison avec tarifs.

**Why this priority**: Sans fournisseurs inscrits et validés avec des catalogues remplis, il n'y a aucune offre à afficher dans les résultats de recherche. C'est le prérequis direct du P1.

**Independent Test**: Un fournisseur peut s'inscrire, configurer son profil, ajouter au moins un produit à son catalogue, et son profil est prêt pour la validation admin — le tout en moins de 10 minutes.

**Acceptance Scenarios**:

1. **Given** un nouvel utilisateur, **When** il choisit "Je suis fournisseur" et saisit son numéro de téléphone, **Then** il reçoit un OTP par SMS et peut accéder au formulaire d'inscription.
2. **Given** un fournisseur inscrit en attente de validation, **When** il ajoute un produit avec photo, nom, catégorie, prix et stock, **Then** le produit est sauvegardé dans son catalogue mais invisible dans les recherches publiques.
3. **Given** un fournisseur validé par l'admin, **When** un acheteur recherche un de ses produits à proximité, **Then** le fournisseur apparaît dans les résultats.
4. **Given** un fournisseur avec un produit dont le stock descend sous le seuil d'alerte, **When** le seuil est franchi, **Then** le fournisseur reçoit une notification push d'alerte de rupture.
5. **Given** un fournisseur en Mode Commande, **When** il configure ses zones de livraison sur la carte, **Then** seuls les acheteurs dans ces zones voient l'option de livraison.

---

### User Story 3 — Consultation fiche fournisseur et mise en relation (Priority: P3)

Un acheteur consulte la fiche d'un fournisseur après avoir vu ses résultats de recherche. La fiche affiche la photo de couverture, le nom, la localisation, la distance, la note globale et le nombre d'avis, les badges (Validé eBio, Top Vendeur, Certifié Bio), les produits disponibles avec photos et prix, et les horaires. L'acheteur peut appuyer sur "Y aller" pour ouvrir l'itinéraire dans l'application Maps native. En Mode Mise en relation, il peut contacter le fournisseur par chat eBio (avec un message d'amorce suggéré mentionnant le produit et la distance), WhatsApp (numéro pré-rempli) ou appel téléphonique. Le chat supporte texte, photo, note vocale et partage de localisation GPS.

**Why this priority**: La mise en relation est le mode par défaut accessible au plan Gratuit. C'est le premier mécanisme de conversion entre la recherche (P1) et la transaction réelle.

**Independent Test**: Un acheteur peut consulter la fiche complète d'un fournisseur, initier un chat avec un message d'amorce, et envoyer un message texte ou vocal — le tout sans créer de compte.

**Acceptance Scenarios**:

1. **Given** un acheteur sur les résultats de recherche, **When** il appuie sur une carte fournisseur, **Then** il voit la fiche fournisseur complète avec badges, produits, horaires et actions disponibles.
2. **Given** un fournisseur en Mode Mise en relation, **When** l'acheteur appuie sur "Contacter", **Then** les options Chat eBio, WhatsApp et Appel téléphonique sont proposées.
3. **Given** un chat eBio ouvert, **When** l'acheteur envoie un premier message, **Then** un message d'amorce suggéré est pré-rempli ("Bonjour, est-ce que votre [produit] est disponible ? Je suis à [distance] de chez vous.").
4. **Given** un acheteur sur la fiche fournisseur, **When** il appuie sur "Y aller", **Then** l'application Maps native s'ouvre avec l'itinéraire vers le fournisseur.
5. **Given** une mise en relation complétée, **When** l'acheteur déclare avoir effectué la transaction, **Then** il peut laisser un avis avec note étoiles et commentaire.

---

### User Story 4 — Commande et paiement Mobile Money via FedaPay (Priority: P4)

Un acheteur (inscrit et authentifié) choisit un fournisseur en Mode Commande. Il sélectionne un produit, sa quantité et sa variante, puis l'ajoute au panier. Il peut ajouter des produits de différents fournisseurs (panier multi-fournisseurs, paiements séparés). Au panier, il voit le récapitulatif par fournisseur, choisit le mode de récupération (retrait sur place ou livraison si disponible, avec créneau horaire), et le mode de paiement (Mobile Money via FedaPay ou paiement à la livraison). Pour le paiement FedaPay, il sélectionne son opérateur (MTN MoMo, Moov Money, etc.), confirme son numéro, reçoit une push notification de l'opérateur, confirme par PIN, et les fonds sont placés en escrow. Le fournisseur reçoit une notification. Il accepte, refuse ou propose une modification. La commande passe par les statuts : Passée → Acceptée → En préparation → Prête/En livraison → Livrée. À la confirmation de livraison par les deux parties, les fonds sont libérés vers le fournisseur (moins la commission eBio). Un reçu est généré automatiquement.

**Why this priority**: La commande avec paiement in-app est le principal levier de monétisation (commission 2,5–4%). Elle est réservée aux plans Essentiel et supérieurs.

**Independent Test**: Un acheteur inscrit peut ajouter un produit au panier, procéder au paiement Mobile Money, et le fournisseur peut accepter la commande — la transaction complète de bout en bout.

**Acceptance Scenarios**:

1. **Given** un fournisseur en Mode Commande avec des produits en stock, **When** un acheteur ajoute un produit au panier et confirme, **Then** le récapitulatif affiche le produit, la quantité, le prix et les options de récupération.
2. **Given** un panier confirmé avec paiement FedaPay, **When** l'acheteur sélectionne son opérateur et confirme le paiement via PIN, **Then** les fonds sont captés et la commande passe au statut "Passée" avec notification push au fournisseur.
3. **Given** une commande passée et payée, **When** le fournisseur accepte, **Then** le stock est automatiquement décrémenté et la commande passe au statut "Acceptée".
4. **Given** une commande au statut "Livrée" confirmée par les deux parties, **When** le délai de litige (48h) est passé sans contestation, **Then** les fonds sont libérés vers le fournisseur moins la commission eBio, et un reçu est généré.
5. **Given** une commande livrée, **When** l'acheteur ouvre un litige dans les 48h, **Then** les fonds restent en escrow et un administrateur reçoit une notification pour médiation.

---

### User Story 5 — Validation fournisseurs et administration (Priority: P5)

Un administrateur accède au dashboard web. Il voit les KPIs globaux (utilisateurs actifs, recherches/jour, transactions, CA plateforme). Il gère la file de validation des fournisseurs : pour chaque dossier, il consulte les informations saisies et les pièces jointes, puis il valide, rejette avec motif, ou demande un complément. Chaque décision déclenche une notification automatique au fournisseur. L'administrateur gère aussi les contenus signalés (produits, avis, messages communautaires), les comptes suspects, le catalogue global (catégories de produits, zones géographiques), les transactions FedaPay, les litiges, les exports CSV, les taux de commission par catégorie, les plans d'abonnement et les messages système.

**Why this priority**: Sans validation admin, aucun fournisseur ne peut être visible — c'est le verrou de confiance qui différencie eBio. Le dashboard est indispensable pour la modération et le suivi opérationnel.

**Independent Test**: Un administrateur peut se connecter au dashboard web, consulter un dossier fournisseur en attente, le valider, et vérifier que le fournisseur reçoit une notification et devient visible dans les recherches.

**Acceptance Scenarios**:

1. **Given** un fournisseur en attente de validation, **When** l'administrateur ouvre son dossier, **Then** il voit toutes les informations saisies et les pièces justificatives.
2. **Given** un dossier fournisseur complet, **When** l'administrateur clique sur "Valider", **Then** le fournisseur passe en statut actif, reçoit une notification SMS, et ses produits deviennent visibles dans les recherches.
3. **Given** un dossier incomplet, **When** l'administrateur clique sur "Demander complément" avec un message, **Then** le fournisseur reçoit une notification avec le détail de ce qui manque.
4. **Given** un contenu signalé par la communauté, **When** l'administrateur l'examine, **Then** il peut le supprimer, avertir l'auteur ou ignorer le signalement.
5. **Given** le dashboard, **When** l'administrateur consulte les KPIs, **Then** il voit les métriques à jour : utilisateurs actifs, recherches/jour, transactions, CA, taux de satisfaction.

---

### User Story 6 — Notation, réputation et badges de confiance (Priority: P6)

Après une transaction (commande livrée ou mise en relation déclarée complétée), l'acheteur peut noter le fournisseur sur 4 critères : qualité produit, respect des délais, communication, conformité à la description. La note globale est pondérée avec les 90 derniers jours qui pèsent davantage. Les badges sont attribués automatiquement : "Validé eBio" (vérification admin), "Top Vendeur" (note ≥ 4,5 + volume élevé), "Certifié Bio" (document de certification validé). Le système détecte les comptes multiples (même téléphone, même appareil) et permet le signalement communautaire des avis suspects.

**Why this priority**: La confiance est essentielle dans un marché informel. Les badges et la notation crédibilisent les fournisseurs et incitent à la qualité.

**Independent Test**: Un acheteur ayant complété une transaction peut noter le fournisseur, et cette note est visible sur la fiche fournisseur et impacte sa note globale.

**Acceptance Scenarios**:

1. **Given** une commande confirmée comme livrée, **When** l'acheteur accède à l'écran de notation, **Then** il peut noter sur les 4 critères (qualité, délais, communication, conformité) et laisser un commentaire.
2. **Given** un fournisseur avec note moyenne ≥ 4,5 et un volume de transactions élevé, **When** le système recalcule les badges, **Then** le badge "Top Vendeur" est attribué automatiquement.
3. **Given** un avis signalé par un autre utilisateur, **When** un administrateur examine le signalement, **Then** il peut supprimer l'avis ou le maintenir.
4. **Given** deux comptes créés depuis le même appareil, **When** le système détecte cette anomalie, **Then** une alerte est envoyée à l'administrateur.

---

### User Story 7 — Tableau de bord fournisseur et gestion des commandes (Priority: P7)

Un fournisseur validé accède à son tableau de bord avec un résumé : commandes en attente, messages non lus, stock critique. Il consulte ses analytics : chiffre d'affaires hebdomadaire et mensuel, produits les plus consultés et commandés, carte de localisation des acheteurs, note moyenne, derniers avis, revenus en attente (escrow). En Mode Commande, il gère ses commandes entrantes : consulter le détail (produits, quantités, mode de récupération, acheteur), accepter, refuser, proposer une modification, et mettre à jour le statut de livraison.

**Why this priority**: Le tableau de bord est nécessaire pour que le fournisseur puisse gérer son activité au quotidien. Sans lui, le Mode Commande ne fonctionne pas opérationnellement.

**Independent Test**: Un fournisseur peut se connecter, voir ses commandes en attente, accepter une commande, et consulter son chiffre d'affaires du mois.

**Acceptance Scenarios**:

1. **Given** un fournisseur connecté, **When** il accède à son tableau de bord, **Then** il voit le nombre de commandes en attente, messages non lus et produits en stock critique.
2. **Given** une commande entrante, **When** le fournisseur l'accepte, **Then** le stock est mis à jour automatiquement et l'acheteur reçoit une notification.
3. **Given** un fournisseur avec des transactions ce mois, **When** il consulte ses analytics, **Then** il voit son CA mensuel, ses produits les plus populaires et sa note moyenne.

---

### User Story 8 — Réseau communautaire par filière et région (Priority: P8)

Les utilisateurs (acheteurs et fournisseurs) accèdent à des groupes organisés par filière (Huiles, Céréales, Légumes, Semences, Compost, Élevage) et par zone géographique (département, commune). Ils peuvent publier des annonces produit, poser des questions techniques, partager des alertes marché ou des formations. Les publications peuvent être partagées vers Facebook, WhatsApp Business et TikTok. La modération combine le signalement communautaire et la modération admin.

**Why this priority**: La communauté fidélise les utilisateurs et crée un effet réseau au-delà des transactions pures. Elle peut fonctionner indépendamment des fonctionnalités transactionnelles.

**Independent Test**: Un utilisateur peut rejoindre un groupe de filière, publier une annonce, et d'autres membres du groupe peuvent la voir et y répondre.

**Acceptance Scenarios**:

1. **Given** un utilisateur inscrit, **When** il accède à l'onglet Communauté, **Then** il voit la liste des groupes par filière et par zone géographique.
2. **Given** un membre d'un groupe, **When** il publie une annonce produit, **Then** tous les membres du groupe voient la publication dans leur fil.
3. **Given** un contenu inapproprié, **When** un membre le signale, **Then** le contenu est marqué pour modération admin.
4. **Given** une publication, **When** l'auteur choisit de la partager sur WhatsApp, **Then** un lien de partage est généré et la conversation WhatsApp s'ouvre.

---

### User Story 9 — Modules de formation audio/vidéo (Priority: P9)

Les utilisateurs accèdent à des modules de formation organisés par thématique : bonnes pratiques de transformation, fixation du prix, utilisation d'eBio, accès au crédit. Les formats incluent des vidéos courtes portrait (60 secondes, style TikTok), de l'audio seul et des séquences illustrées. À la fin de chaque module, un quiz pictographique valide l'apprentissage et un badge de complétion est attribué. Les contenus sont téléchargeables pour un accès hors-ligne.

**Why this priority**: La formation renforce l'écosystème et l'adoption à long terme, mais n'est pas critique pour le lancement. Elle peut être ajoutée post-MVP initial.

**Independent Test**: Un utilisateur peut parcourir les modules, regarder une vidéo, répondre au quiz et recevoir un badge de complétion — le tout hors-ligne après téléchargement.

**Acceptance Scenarios**:

1. **Given** un utilisateur connecté, **When** il accède à l'onglet Formation, **Then** il voit les modules classés par thématique avec une indication de durée et de format.
2. **Given** un module vidéo, **When** l'utilisateur le télécharge puis passe hors-ligne, **Then** il peut visionner la vidéo sans connexion.
3. **Given** un module complété, **When** l'utilisateur répond correctement au quiz pictographique, **Then** un badge de complétion est attribué à son profil.

---

### User Story 10 — Abonnements fournisseur et monétisation (Priority: P10)

Le système gère 4 plans d'abonnement : Gratuit (5 produits max, Mode Mise en relation uniquement), Essentiel (2 000 FCFA/mois, 20 produits, Mode Commande), Pro (5 000 FCFA/mois, produits illimités, analytics avancés, badge Pro, 0% commission sur 10 premières commandes/mois), Coopérative (10 000 FCFA/mois, multi-comptes 5 membres, tableau de bord groupé). Les commissions sont prélevées automatiquement à la libération des fonds (4% alimentaire, 3% intrants, 2,5% semences). Les publicités locales ciblées (marqueurs sponsorisés sur la carte, annonces communautaires, notifications promotionnelles max 1/semaine) et les services à valeur ajoutée (assistance inscription, validation accélérée, boost de visibilité) complètent la monétisation.

**Why this priority**: La monétisation est essentielle à la viabilité du projet mais peut être progressive. Le plan Gratuit suffit au lancement pour acquérir des fournisseurs.

**Independent Test**: Un fournisseur peut souscrire au plan Essentiel via Mobile Money et accéder immédiatement au Mode Commande avec 20 produits max.

**Acceptance Scenarios**:

1. **Given** un fournisseur au plan Gratuit, **When** il tente d'activer le Mode Commande, **Then** il est invité à souscrire au plan Essentiel ou supérieur.
2. **Given** un fournisseur au plan Pro, **When** il publie un 21e produit, **Then** le produit est accepté (produits illimités).
3. **Given** une commande livrée et confirmée, **When** les fonds sont libérés, **Then** la commission correspondant à la catégorie du produit est automatiquement prélevée.
4. **Given** un fournisseur, **When** il achète un boost de visibilité, **Then** son produit apparaît en tête des résultats pour 7 jours dans sa zone.

---

### Edge Cases

- **Géolocalisation refusée** : l'utilisateur peut saisir manuellement une adresse ou un quartier, mais une bannière persistante l'incite à activer le GPS.
- **Aucun fournisseur à proximité** : un message bienveillant est affiché avec suggestion d'élargir le rayon de recherche ou d'activer une alerte de disponibilité.
- **Paiement FedaPay échoué** (timeout, solde insuffisant) : la commande reste au statut "En attente de paiement" pendant 30 minutes, puis est annulée automatiquement avec notification.
- **Fournisseur ne répond pas à une commande sous 24h** : la commande est automatiquement annulée, l'acheteur est remboursé, et le fournisseur reçoit un avertissement.
- **Conflit offline** : si un produit a été modifié par le fournisseur pendant que l'acheteur était hors-ligne, la version serveur prévaut et l'acheteur est informé au moment de la commande.
- **Double commande** : si un acheteur soumet deux commandes identiques en moins de 2 minutes, la seconde est bloquée avec confirmation requise.
- **Stock épuisé entre recherche et commande** : l'acheteur est informé que le produit n'est plus disponible au moment de l'ajout au panier.
- **Fournisseur désactivé entre recherche et consultation** : un message "Ce fournisseur n'est plus disponible" est affiché.
- **Fournisseur suspendu avec commandes en cours** : les commandes actives sont honorées jusqu'à leur terme (livraison + libération escrow), aucune nouvelle commande n'est acceptée, le profil est masqué des recherches.
- **Litige après libération des fonds** : impossible après le délai de 48h — l'acheteur est orienté vers le support.
- **Connexion intermittente (2G/3G)** : les actions critiques (commande, paiement) sont mises en file d'attente et exécutées à la reconnexion.

## Clarifications

### Session 2026-03-23

- Q: Que se passe-t-il si aucune des deux parties ne confirme la livraison — combien de temps les fonds restent-ils en escrow ? → A: Auto-libération après 7 jours sans confirmation, avec rappels à J+3 et J+6.
- Q: Quel est le seuil de volume pour le badge "Top Vendeur" ? → A: ≥ 20 transactions complétées sur les 90 derniers jours (en plus de note ≥ 4,5).
- Q: Comment les administrateurs s'authentifient-ils au dashboard web ? → A: Email + mot de passe + OTP SMS obligatoire (2FA).
- Q: Que se passe-t-il si un fournisseur est suspendu alors qu'il a des commandes en cours ? → A: Suspension progressive — commandes en cours honorées, nouvelles commandes bloquées, profil masqué des recherches.
- Q: Quel est le rayon de recherche par défaut à l'ouverture ? → A: 10 km fixe, adapté au contexte rural/péri-urbain du Bénin.

### Session 2026-03-23 (architecture mobile)

- Q: Application mobile unique ou séparée par rôle (acheteur / fournisseur) ? → A: App unique avec switch de rôle — acheteur par défaut, activation fournisseur dans le profil.
- Q: Périmètre web pour les acheteurs et fournisseurs ? → A: Mobile-only pour acheteurs. Fournisseurs ont accès mobile + web (web-spa). Dashboard admin web uniquement.
- Q: Périmètre fonctionnel du web fournisseur vs mobile fournisseur ? → A: Web = gestion (catalogue, commandes, analytics, paramètres). Mobile = tout (inscription, chat, notifications push, gestion). L'inscription et le chat restent mobile-only.
- Q: Stratégie de partage de code entre mobile et web fournisseur ? → A: SDK OpenAPI + validators partagés via packages. Composants UI séparés par app (React Native vs React web).
- Q: Protocole temps réel pour le chat et les mises à jour de stock ? → A: WebSockets (bidirectionnel, NestJS natif) — un canal unique couvrant chat et mises à jour stock temps réel.

## Requirements *(mandatory)*

### Functional Requirements

**Authentification et comptes**
- **FR-001**: Le système DOIT permettre l'inscription par numéro de téléphone + OTP SMS.
- **FR-002**: Le système DOIT supporter la connexion biométrique (empreinte) après la première session.
- **FR-003**: L'inscription acheteur DOIT être optionnelle pour la recherche et la mise en relation, obligatoire pour le Mode Commande.
- **FR-003b**: L'application mobile DOIT être une app unique avec le rôle acheteur par défaut. L'activation du rôle fournisseur se fait depuis le profil utilisateur. Un même utilisateur peut être à la fois acheteur et fournisseur.
- **FR-003c**: L'expérience acheteur est exclusivement mobile. Les fournisseurs disposent d'un accès mobile (dans la même app) ET d'une interface web (web-spa). Le dashboard admin est exclusivement web.
- **FR-003d**: L'interface web fournisseur couvre : gestion du catalogue produits, gestion des commandes entrantes, analytics et paramètres boutique. L'inscription fournisseur (OTP, pièces justificatives, GPS) et le chat restent exclusivement mobiles.
- **FR-004**: L'inscription fournisseur DOIT inclure la soumission de pièces justificatives (pièce d'identité, preuve d'activité optionnelle).
- **FR-005**: Le système DOIT gérer les sessions via JWT avec rotation automatique des refresh tokens.
- **FR-005b**: Les administrateurs DOIVENT s'authentifier via email + mot de passe + OTP SMS obligatoire (2FA). L'authentification OTP seule n'est pas suffisante pour l'accès au dashboard admin.

**Recherche géolocalisée**
- **FR-006**: Le système DOIT fournir une recherche textuelle avec autocomplétion sur les noms de produits, catégories et noms de boutiques.
- **FR-007**: Le système DOIT supporter la recherche vocale pour les utilisateurs à faible alphabétisation.
- **FR-008**: Le système DOIT proposer 7 filtres : distance (défaut 10 km), catégorie, prix maximum, disponibilité, note minimum, mode disponible, badge Validé eBio.
- **FR-009**: Le système DOIT trier les résultats par distance (défaut), note ou prix croissant.
- **FR-010**: Le système DOIT mettre à jour les stocks en temps réel dans les résultats sans rechargement, via WebSockets.
- **FR-011**: Le système DOIT sauvegarder l'historique des recherches récentes localement (accessible offline).

**Carte interactive**
- **FR-012**: Le système DOIT afficher les fournisseurs sur une carte interactive avec marqueurs colorés par catégorie.
- **FR-013**: Le système DOIT supporter le clustering automatique des marqueurs en vue dézoomée.
- **FR-014**: Le système DOIT permettre le téléchargement de tuiles cartographiques par zone (rayon 20 km) pour usage hors-ligne.

**Profil fournisseur et catalogue**
- **FR-015**: Le système DOIT permettre au fournisseur de choisir entre Mode Mise en relation et Mode Commande, modifiable à tout moment.
- **FR-016**: Le système DOIT supporter les variantes produit (plusieurs conditionnements par produit).
- **FR-017**: Le système DOIT supporter les prix promotionnels avec prix barré et date d'expiration.
- **FR-018**: Le système DOIT déclencher des alertes de rupture de stock par notification push au fournisseur.
- **FR-019**: Le système DOIT déclencher des alertes de disponibilité par notification push à l'acheteur lors de la remise en stock.
- **FR-020**: Le fournisseur DOIT pouvoir préparer son catalogue en attente de validation, sans visibilité publique.

**Chat et mise en relation**
- **FR-021**: Le système DOIT supporter les messages texte, photo, note vocale et partage de localisation GPS dans le chat, délivré en temps réel via WebSockets avec reconnexion automatique.
- **FR-022**: Le système DOIT afficher les indicateurs "vu" et l'heure d'envoi dans le chat.
- **FR-023**: Le système DOIT pré-remplir un message d'amorce mentionnant le produit recherché et la distance.
- **FR-024**: Le système DOIT proposer des templates de réponse rapide pour les fournisseurs.
- **FR-025**: Le système DOIT conserver les conversations liées à une commande pendant 6 mois.
- **FR-026**: Le système DOIT permettre de continuer une conversation par WhatsApp via un bouton de partage.

**Commande et paiement**
- **FR-027**: Le système DOIT supporter un panier multi-fournisseurs avec paiements séparés par fournisseur.
- **FR-028**: Le système DOIT proposer deux modes de récupération : retrait sur place et livraison (si disponible) avec sélection de créneau.
- **FR-029**: Le système DOIT intégrer FedaPay pour le paiement Mobile Money (MTN MoMo, Moov Money et autres opérateurs couverts).
- **FR-030**: Le système DOIT placer les fonds en escrow jusqu'à confirmation de livraison par les deux parties. Si aucune des deux parties ne confirme la livraison, les fonds sont automatiquement libérés vers le fournisseur après 7 jours, avec des rappels de confirmation envoyés à J+3 et J+6.
- **FR-031**: Le système DOIT libérer les fonds vers le fournisseur après confirmation, moins la commission eBio.
- **FR-032**: Le système DOIT générer un reçu automatiquement et l'envoyer par WhatsApp/SMS.
- **FR-033**: Le système DOIT permettre l'ouverture d'un litige sous 48h après confirmation de livraison, avec médiation admin.
- **FR-034**: Le système DOIT supporter le fallback "paiement à la livraison" en cas d'échec FedaPay.

**Notation et réputation**
- **FR-035**: Le système DOIT permettre la notation sur 4 critères (qualité, délais, communication, conformité) après transaction.
- **FR-036**: Le système DOIT pondérer la note globale en favorisant les 90 derniers jours.
- **FR-037**: Le système DOIT attribuer automatiquement les badges Validé eBio, Top Vendeur (note ≥ 4,5 ET ≥ 20 transactions complétées sur les 90 derniers jours) et Certifié Bio selon les critères définis.
- **FR-038**: Le système DOIT détecter les comptes multiples (même numéro, même appareil) et alerter l'admin.

**Administration**
- **FR-039**: Le système DOIT fournir un dashboard web avec KPIs en temps réel.
- **FR-040**: Le système DOIT fournir une file de validation fournisseur avec actions Valider / Rejeter / Demander complément.
- **FR-041**: Le système DOIT fournir un outil de modération pour les contenus signalés.
- **FR-041b**: La suspension d'un fournisseur DOIT être progressive : les commandes en cours sont honorées jusqu'à leur terme, aucune nouvelle commande n'est acceptée, et le profil est masqué des recherches. Les fonds en escrow suivent leur cycle normal.
- **FR-042**: Le système DOIT permettre le paramétrage des taux de commission par catégorie et des plans d'abonnement.
- **FR-043**: Le système DOIT permettre l'export des transactions en CSV/Excel.

**Communauté**
- **FR-044**: Le système DOIT organiser les groupes par filière et par zone géographique.
- **FR-045**: Le système DOIT supporter 4 types de publications : annonce produit, question technique, alerte marché, partage de formation.
- **FR-046**: Le système DOIT permettre le partage social vers Facebook, WhatsApp Business et TikTok.

**Formation**
- **FR-047**: Le système DOIT supporter 3 formats de contenu : vidéo portrait 60s, audio seul, séquences illustrées.
- **FR-048**: Le système DOIT attribuer un badge de complétion après validation du quiz pictographique.
- **FR-049**: Le système DOIT permettre le téléchargement des contenus de formation pour consultation hors-ligne.

**Offline-first**
- **FR-050**: Le système DOIT fonctionner sans connexion : catalogue en cache, recherches récentes, panier.
- **FR-051**: Le système DOIT synchroniser automatiquement à la reconnexion avec gestion des conflits (version serveur prioritaire).
- **FR-052**: Le système DOIT marquer les actions différées "En attente de connexion".

**Abonnements et monétisation**
- **FR-053**: Le système DOIT gérer 4 plans d'abonnement (Gratuit, Essentiel, Pro, Coopérative) avec les limites associées.
- **FR-054**: Le système DOIT prélever automatiquement les commissions à la libération des fonds selon la catégorie (4% alimentaire, 3% intrants, 2,5% semences).
- **FR-055**: Le système DOIT restreindre le Mode Commande aux plans Essentiel et supérieurs.

**Notifications**
- **FR-056**: Le système DOIT envoyer des notifications push et SMS pour les événements critiques (commande, validation, livraison, litige).
- **FR-057**: Le système DOIT limiter les notifications promotionnelles à 1 par semaine maximum, ciblées par zone et filière.

### Key Entities

- **Acheteur** : utilisateur qui cherche et achète des produits. Attributs : téléphone, nom, localisation, historique de recherches, commandes, avis laissés.
- **Fournisseur** : utilisateur qui vend des produits. Attributs : nom de boutique, type (intrants / transformateur), localisation GPS, numéro Mobile Money, pièces justificatives, statut de validation, mode (Mise en relation / Commande), plan d'abonnement, note globale, badges.
- **Produit** : article proposé par un fournisseur. Attributs : nom, catégorie, photos (max 3), prix unitaire, unité, variantes, stock, seuil d'alerte, description, statut, prix promotionnel.
- **Commande** : transaction entre un acheteur et un fournisseur. Attributs : produits, quantités, montant total, mode de récupération, statut (Passée → Acceptée → En préparation → Prête → Livrée), paiement associé, litige éventuel.
- **Paiement** : transaction financière via FedaPay. Attributs : montant, opérateur, statut (en attente → capté → escrow → libéré / remboursé), commission prélevée, reçu.
- **Conversation** : fil de chat entre acheteur et fournisseur. Attributs : messages (texte, photo, vocal, localisation), horodatage, statut lecture, commande associée.
- **Avis** : notation d'un fournisseur par un acheteur. Attributs : 4 notes par critère, commentaire, date, type de transaction associée.
- **Groupe communautaire** : espace de discussion. Attributs : nom, type (filière / géographique), membres, publications.
- **Module de formation** : contenu pédagogique. Attributs : titre, thématique, format (vidéo / audio / illustré), durée, quiz associé, fichier téléchargeable.
- **Plan d'abonnement** : formule de service pour les fournisseurs. Attributs : nom, prix mensuel, limites (nombre de produits, modes disponibles, fonctionnalités).
- **Badge** : indicateur de confiance. Types : Validé eBio, Top Vendeur, Certifié Bio, badge de complétion formation.

### Assumptions

- L'OTP SMS est le seul mécanisme d'authentification (pas d'email/mot de passe) car la cible utilise principalement le téléphone mobile.
- FedaPay couvre tous les opérateurs Mobile Money nécessaires au Bénin (MTN MoMo, Moov Money).
- La zone géographique de lancement est le Bénin, avec possibilité d'extension UEMOA via FedaPay.
- L'architecture mobile suit le pattern feature-driven (features directory) identique à l'architecture web. La logique métier et les types sont partagés via `packages/openapi-generator` (SDK + validators). Les composants UI sont séparés : React Native dans `apps/mobile`, React web dans `apps/web-spa`.
- Le recrutement de 30 fournisseurs pilotes est géré hors application avant le lancement public.
- Les contenus de formation sont produits par l'équipe eBio ou des partenaires, pas par les utilisateurs.
- Les tarifs de livraison sont définis par le fournisseur, pas calculés dynamiquement par eBio.
- Le délai de validation fournisseur est un SLA de 48h, sauf validation accélérée payante (2h).
- La conformité PCI-DSS est entièrement déléguée à FedaPay — eBio ne stocke aucune donnée de carte ou de compte Mobile Money.
- Les données de conversation sont conservées 6 mois pour les conversations liées à une commande, durée de rétention standard pour les autres.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un acheteur peut trouver un fournisseur de produit bio disponible à proximité en moins de 30 secondes depuis l'ouverture de l'application.
- **SC-002**: Un fournisseur peut créer sa vitrine numérique complète (profil + au moins 3 produits) en moins de 10 minutes.
- **SC-003**: Le système supporte 5 000 acheteurs actifs mensuels et 800 fournisseurs actifs simultanément sans dégradation perceptible.
- **SC-004**: L'application initiale se charge en moins de 3 secondes sur une connexion 3G.
- **SC-005**: Les résultats de recherche s'affichent en moins de 1,5 seconde.
- **SC-006**: L'application reste fonctionnelle (recherche, catalogue, panier) sans connexion réseau.
- **SC-007**: Le taux de satisfaction moyen des acheteurs dépasse 3,8/5 à 6 mois et 4,2/5 à 12 mois.
- **SC-008**: Le délai moyen pour trouver un fournisseur est inférieur à 45 secondes à 6 mois et 30 secondes à 12 mois.
- **SC-009**: Le taux de validation fournisseur par l'admin respecte le SLA de 48h dans 95% des cas.
- **SC-010**: 200 mises en relation et 100 transactions in-app sont complétées dans les 3 premiers mois.
- **SC-011**: La taille de l'application installée ne dépasse pas 30 Mo.
- **SC-012**: La plateforme maintient une disponibilité supérieure à 99,5%.
