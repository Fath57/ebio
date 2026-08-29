# Feature Specification: Séparation en 3 applications mobiles (Client, Fournisseur, Livreur)

**Feature Branch**: `005-split-three-apps`
**Created**: 2026-08-24
**Status**: Draft
**Input**: User description: "Séparation de l'app mobile eBio en 3 applications distinctes : (1) eBio Client pour les utilisateurs finaux (app existante allégée du mode fournisseur), (2) eBio Fournisseur pour la gestion boutique/produits/commandes (extraction du mode fournisseur actuel), (3) eBio Livreur, nouvelle app pour le profil livreur (réception et gestion des livraisons, itinéraires, statuts de commande, preuve de livraison). Le backend reste unique ; ajout du rôle livreur. Extraction du code commun pour éviter la triple maintenance. Chaque app aura son propre package name Android et sa fiche Play Store."

## Vue d'ensemble

L'application mobile eBio actuelle mélange deux profils (acheteur et fournisseur) via un commutateur de mode, et un troisième profil (livreur) doit être ajouté. Cette complexité croissante dégrade l'expérience de chaque profil et alourdit la maintenance. La solution : trois applications dédiées, chacune centrée sur un seul métier, s'appuyant sur la même plateforme et les mêmes comptes.

- **eBio** (Client) — l'application existante, recentrée sur l'expérience d'achat : découverte, commande, suivi de livraison. Les utilisateurs actuels la conservent par simple mise à jour.
- **eBio Fournisseur** — nouvelle application reprenant l'intégralité du mode fournisseur actuel : boutique, produits, commandes, statistiques.
- **eBio Livreur** — nouvelle application pour les livreurs : réception des courses, itinéraires, mise à jour des statuts, preuve de livraison.

## Clarifications

### Session 2026-08-24

- Q: Rattachement des livreurs ? → R: Flotte eBio mutualisée — livreurs indépendants validés par l'admin, livrant pour tous les fournisseurs.
- Q: Attribution des courses ? → R: Diffusion aux livreurs disponibles à proximité, le premier qui accepte prend la course.
- Q: Rémunération des livreurs ? → R: Hors périmètre v1 ; l'historique des courses servira de base à une feature ultérieure.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Le livreur réalise une livraison de bout en bout (Priority: P1)

Un livreur inscrit et validé ouvre l'app eBio Livreur, se déclare disponible, reçoit une course (commande prête chez un fournisseur), l'accepte, consulte l'itinéraire vers le point de retrait puis vers le client, met à jour le statut à chaque étape (récupérée → en livraison → livrée) et enregistre une preuve de livraison. Le client et le fournisseur sont informés de chaque étape.

**Why this priority**: C'est la seule capacité entièrement nouvelle de la fonctionnalité — la valeur métier centrale (livraison structurée et traçable) n'existe pas aujourd'hui. Sans elle, la séparation des apps n'est qu'un réagencement.

**Independent Test**: Créer un compte livreur validé, générer une commande prête à livrer, dérouler le cycle complet depuis l'app Livreur et vérifier que les statuts et notifications arrivent côté client et fournisseur.

**Acceptance Scenarios**:

1. **Given** un livreur validé et disponible, **When** une course lui est proposée et qu'il l'accepte, **Then** la course apparaît dans sa liste active avec les adresses de retrait et de livraison, et le fournisseur voit que la commande est prise en charge.
2. **Given** une course acceptée, **When** le livreur marque la commande « récupérée » puis « livrée » avec preuve de livraison, **Then** le client reçoit une notification à chaque changement d'étape et l'historique de la commande reflète chaque horodatage.
3. **Given** un livreur non validé (inscription en attente), **When** il se connecte à l'app Livreur, **Then** il voit un écran d'attente de validation et ne peut recevoir aucune course.
4. **Given** un livreur avec une course active, **When** il passe hors ligne ou perd le réseau, **Then** ses mises à jour de statut sont conservées localement et synchronisées dès le retour du réseau.

---

### User Story 2 - Le fournisseur gère son activité depuis une app dédiée (Priority: P2)

Un fournisseur installe eBio Fournisseur, se connecte avec son compte existant et retrouve toutes ses fonctions actuelles (boutique, produits, commandes, statistiques) sans passer par un commutateur de mode. Lorsqu'une commande est prête, il déclenche la mise en livraison.

**Why this priority**: Les fournisseurs sont le côté offre de la marketplace ; leur app doit être opérationnelle pour que le flux de livraison (US1) ait un point de départ. Elle réutilise l'existant, le risque est donc moindre que US1.

**Independent Test**: Se connecter à l'app Fournisseur avec un compte fournisseur existant et vérifier la parité fonctionnelle complète avec le mode fournisseur de l'app actuelle, y compris le passage d'une commande au statut « prête à livrer ».

**Acceptance Scenarios**:

1. **Given** un compte fournisseur existant, **When** il se connecte à l'app Fournisseur, **Then** il accède directement à son tableau de bord sans sélection de mode et retrouve toutes les fonctions du mode fournisseur actuel.
2. **Given** un utilisateur sans profil fournisseur, **When** il se connecte à l'app Fournisseur, **Then** il est guidé vers la création d'un profil fournisseur (ou informé que cette app ne le concerne pas).
3. **Given** une commande payée en préparation, **When** le fournisseur la marque « prête à livrer », **Then** le processus d'attribution à un livreur démarre.

---

### User Story 3 - Le client commande et suit sa livraison dans une app allégée (Priority: P3)

Un utilisateur final met à jour son app eBio existante : le mode fournisseur a disparu, l'expérience est recentrée sur l'achat. Après une commande, il suit l'avancement de la livraison étape par étape (préparée, prise en charge, en route, livrée) et est notifié à chaque changement.

**Why this priority**: L'app client existe déjà et fonctionne ; le retrait du mode fournisseur et l'ajout du suivi de livraison sont des évolutions, pas des créations. Elle dépend des étapes produites par US1/US2 pour afficher le suivi.

**Independent Test**: Mettre à jour l'app client, vérifier l'absence de tout point d'entrée fournisseur, passer une commande et suivre les étapes de livraison alimentées par les actions du livreur.

**Acceptance Scenarios**:

1. **Given** un utilisateur de l'app actuelle avec profil fournisseur, **When** il met à jour vers la nouvelle version client, **Then** le commutateur de mode a disparu et un message l'oriente vers l'app eBio Fournisseur.
2. **Given** une commande en cours de livraison, **When** le livreur met à jour le statut, **Then** le client voit la nouvelle étape dans le suivi de commande et reçoit une notification.

---

### User Story 4 - L'administrateur valide et supervise les livreurs (Priority: P4)

Un candidat livreur s'inscrit depuis l'app Livreur en fournissant ses informations (identité, moyen de transport, zone d'activité). Un administrateur examine la candidature depuis le back-office web, l'approuve ou la refuse. L'administrateur peut ensuite suspendre un livreur et consulter son activité.

**Why this priority**: Nécessaire pour un fonctionnement contrôlé en production, mais un contournement manuel (validation directe en interne) permet de démarrer les tests des US1-3 sans elle.

**Independent Test**: Soumettre une candidature livreur, la valider depuis le back-office, vérifier que le livreur passe de l'écran d'attente à l'accès complet.

**Acceptance Scenarios**:

1. **Given** une candidature livreur soumise, **When** l'administrateur l'approuve, **Then** le livreur est notifié et obtient l'accès aux courses.
2. **Given** un livreur actif, **When** l'administrateur le suspend, **Then** le livreur ne reçoit plus de courses et en est informé à sa prochaine ouverture de l'app.

---

### Edge Cases

- Aucun livreur disponible lorsqu'une commande est prête : la commande reste visible comme « en attente de livreur » chez le fournisseur, avec possibilité de relancer l'attribution ou de gérer la remise autrement.
- Le livreur accepte une course puis ne la démarre pas dans un délai raisonnable : la course doit pouvoir être réattribuée.
- Le client est absent à la livraison : le livreur peut signaler un échec de livraison avec motif ; le statut et les notifications le reflètent.
- Commande annulée (client ou fournisseur) après attribution : le livreur est notifié immédiatement et la course disparaît de sa liste active.
- Un même compte cumule plusieurs profils (client + fournisseur + livreur) : chaque app ne montre que son périmètre ; les données du compte restent cohérentes partout.
- Un utilisateur installe une app qui ne correspond pas à son profil : message clair d'orientation vers la bonne app, pas d'impasse.
- Anciens utilisateurs qui ne mettent pas à jour l'app existante : l'ancien mode fournisseur embarqué doit continuer de fonctionner (ou se dégrader proprement avec un message) pendant la période de transition.

## Requirements *(mandatory)*

### Functional Requirements

**Séparation des applications**

- **FR-001**: La plateforme DOIT être distribuée sous trois applications mobiles distinctes — eBio (Client), eBio Fournisseur, eBio Livreur — chacune avec sa propre identité (nom, icône, fiche Play Store, identifiant de package Android).
- **FR-002**: L'application Client DOIT être une mise à jour de l'application existante (mêmes utilisateurs, même identifiant de package), débarrassée de tout le périmètre fournisseur.
- **FR-003**: L'application Fournisseur DOIT offrir la parité fonctionnelle complète avec le mode fournisseur de l'app actuelle (boutique, produits, commandes, avis, statistiques, profil).
- **FR-004**: Un même compte utilisateur DOIT pouvoir se connecter aux trois applications ; chaque application n'expose que les fonctions de son profil.
- **FR-005**: Chaque application DOIT orienter clairement un utilisateur dont le profil ne correspond pas (ex. simple client sur l'app Livreur) vers l'application ou le parcours adapté.
- **FR-006**: Les trois applications DOIVENT conserver une expérience visuelle et des parcours cohérents entre elles (même langage visuel, mêmes conventions).

**Profil et compte livreur**

- **FR-007**: Un candidat livreur DOIT pouvoir s'inscrire depuis l'app Livreur en fournissant les informations requises (identité, contact, moyen de transport, zone d'activité).
- **FR-008**: Une candidature livreur DOIT être validée par un administrateur avant tout accès aux courses ; le candidat voit l'état de sa candidature (en attente, approuvée, refusée avec motif).
- **FR-009**: L'administrateur DOIT pouvoir approuver, refuser, suspendre et réactiver un livreur depuis le back-office web, et consulter son historique de livraisons.
- **FR-010**: Le livreur DOIT pouvoir se déclarer disponible ou indisponible ; seuls les livreurs disponibles reçoivent des courses. Les livreurs forment une flotte mutualisée eBio : indépendants, validés par l'administrateur, ils peuvent livrer pour n'importe quel fournisseur de la plateforme.

**Cycle de livraison**

- **FR-011**: Lorsqu'un fournisseur marque une commande « prête à livrer », le système DOIT diffuser la course aux livreurs disponibles à proximité du point de retrait ; le premier livreur qui accepte se voit attribuer la course, et la proposition est retirée pour les autres.
- **FR-012**: Le livreur DOIT voir pour chaque course : les points de retrait et de livraison, le contenu résumé de la commande, les coordonnées de contact utiles, et pouvoir lancer un itinéraire vers chaque point.
- **FR-013**: Le livreur DOIT faire progresser la course selon des étapes traçables (acceptée → récupérée → en livraison → livrée / échec), chaque étape étant horodatée et visible du client et du fournisseur.
- **FR-014**: La livraison DOIT être clôturée par une preuve de livraison (au minimum photo ou code de confirmation remis par le client).
- **FR-015**: Le client et le fournisseur DOIVENT être notifiés à chaque changement d'étape de la livraison ; le client suit l'avancement depuis le détail de sa commande.
- **FR-016**: Une course non démarrée dans un délai défini après acceptation DOIT pouvoir être réattribuée ; une commande annulée après attribution DOIT notifier le livreur et retirer la course.
- **FR-017**: Le livreur DOIT pouvoir signaler un échec de livraison avec motif (client absent, adresse introuvable…) ; la commande passe dans un état dédié visible du fournisseur.
- **FR-018**: Les mises à jour de statut effectuées hors connexion DOIVENT être conservées et synchronisées au retour du réseau.
- **FR-019**: Le livreur DOIT accéder à l'historique de ses livraisons (terminées et échouées) avec leurs détails.

**Transition et distribution**

- **FR-020**: Les fournisseurs existants DOIVENT être informés dans l'app actuelle de la disponibilité de l'app Fournisseur et guidés pour la migration ; pendant la période de transition, l'ancien mode fournisseur reste fonctionnel pour les versions non mises à jour.
- **FR-021**: Les deux nouvelles applications DOIVENT être publiées sur le Play Store avec leurs fiches complètes (descriptions, visuels, formulaires de conformité) et suivre le processus de test requis avant production.

### Key Entities

- **Livreur** : profil rattaché à un compte utilisateur ; informations d'identité et de contact, moyen de transport, zone d'activité, état de la candidature (en attente / approuvé / refusé / suspendu), disponibilité (en ligne / hors ligne).
- **Course (livraison)** : unité de travail du livreur, liée à une commande ; points de retrait et de livraison, livreur attribué, étape courante, horodatages de chaque étape, preuve de livraison, motif d'échec éventuel.
- **Étape de livraison** : progression traçable de la course (proposée, acceptée, récupérée, en livraison, livrée, échec, réattribuée) alimentant le suivi client/fournisseur et l'historique.
- **Candidature livreur** : demande d'accès au profil livreur, avec pièces et informations soumises, décision de l'administrateur et motif éventuel de refus.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un livreur validé peut réaliser sa première livraison complète (acceptation → preuve de livraison) sans assistance, en moins de 10 minutes de prise en main de l'app.
- **SC-002**: 100 % des commandes livrées via un livreur disposent d'un historique d'étapes horodaté complet et d'une preuve de livraison.
- **SC-003**: Un fournisseur existant retrouve toutes ses fonctions habituelles dans l'app Fournisseur dès la première connexion, sans étape de configuration supplémentaire (parité fonctionnelle vérifiée à 100 % sur la liste des fonctions du mode actuel).
- **SC-004**: Le client est informé de chaque changement d'étape de sa livraison en moins d'une minute après l'action du livreur.
- **SC-005**: Aucun utilisateur multi-profils ne rencontre d'incohérence de données entre les trois applications (même compte, mêmes commandes, même wallet).
- **SC-006**: Les trois applications sont publiées et installables depuis le Play Store, chacune sous sa propre fiche.
- **SC-007**: À périmètre client équivalent, l'app Client mise à jour ne présente aucune régression sur les parcours d'achat existants (commande, paiement, avis, notifications).

## Assumptions

- **Plateforme** : Android uniquement pour cette phase (comme l'app actuelle) ; iOS hors périmètre.
- **App existante = app Client** : l'application publiée aujourd'hui conserve son identifiant et devient l'app Client par mise à jour ; seules les apps Fournisseur et Livreur sont de nouvelles fiches Play Store.
- **Rémunération des livreurs** : décision confirmée — la gestion des gains et paiements des livreurs (tarification des courses, reversements) est hors périmètre de cette version ; l'historique horodaté des livraisons effectuées sert de base à une future feature de rémunération.
- **Suivi temps réel** : le suivi client se fait par étapes (statuts + notifications), sans géolocalisation du livreur en temps réel sur carte dans cette version.
- **Web fournisseur** : le dashboard web fournisseur/admin existant reste inchangé dans son périmètre ; le back-office admin s'enrichit uniquement de la gestion des livreurs.
- **Comptes** : aucun nouveau système de compte ; les trois apps utilisent les comptes et l'authentification existants de la plateforme.
- **Transition** : une période de coexistence est acceptée pendant laquelle l'ancienne version (avec mode fournisseur) et les nouvelles apps fonctionnent simultanément.
