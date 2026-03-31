# Cahier des Charges – eBio
### Application mobile de mise en relation géolocalisée pour les produits biologiques et agricoles transformés

**Version** : 3.0
**Date** : Mars 2026

---

## 1. Contexte et justification

### 1.1 Contexte général

L'agriculture biologique et la transformation locale de produits agricoles constituent des leviers essentiels du développement économique en Afrique de l'Ouest, notamment au Bénin. Pourtant, les acteurs de cette filière font face à des contraintes structurelles persistantes :

- **Fragmentation du marché** : les offres sont dispersées géographiquement, sans visibilité consolidée
- **Faible accès aux débouchés** : les transformateurs peinent à atteindre les acheteurs au-delà de leur cercle immédiat
- **Multiplicité des intermédiaires** : chaque niveau d'intermédiation réduit la marge du producteur
- **Informalité des transactions** : absence de traçabilité et d'historique commercial fiable
- **Connectivité limitée** : couverture réseau intermittente en zones rurales
- **Faible culture numérique** : une partie significative des utilisateurs cibles est faiblement alphabétisée

### 1.2 Positionnement de eBio

**eBio est le "Google Maps des produits bio locaux".**

L'utilisateur ouvre l'app, recherche un produit (ex. : "huile de palme", "compost", "farine de manioc"), et voit immédiatement les fournisseurs proches de lui qui le vendent — avec leur distance, leur stock, leur note et leur mode de contact ou de commande.

Ce positionnement clair distingue eBio des marketplaces e-commerce classiques : **la géolocalisation et la proximité sont le cœur du produit**, pas une fonctionnalité secondaire.

### 1.3 Différenciation clé

| Critère | Solutions génériques | eBio |
|---|---|---|
| Recherche produit → fournisseurs proches | Non | ✅ Expérience centrale |
| Fonctionnement hors-ligne | Rare | ✅ Offline-first natif |
| Paiement Mobile Money (FedaPay) | Limité | ✅ Intégration native |
| Mode mise en relation OU commande directe | Non | ✅ Selon le fournisseur |
| Interface basse alphabétisation | Non | ✅ Pictogrammes, audio |
| Validation fournisseurs | Absente | ✅ Validation admin obligatoire |
| Réputation & confiance | Absente | ✅ Système de notation |

---

## 2. Objectifs du projet

### 2.1 Objectif général

Mettre en place une application mobile géolocalisée permettant à tout utilisateur de trouver instantanément les fournisseurs de produits biologiques et agricoles transformés disponibles près de lui, avec la possibilité de les contacter directement ou de commander en ligne selon le mode choisi par le fournisseur.

### 2.2 Objectifs spécifiques

**Côté acheteur :**
- Trouver un produit bio/agricole disponible à proximité en moins de 30 secondes
- Comparer les fournisseurs proches (prix, distance, note, disponibilité)
- Contacter directement un fournisseur ou passer commande selon le mode disponible

**Côté fournisseur :**
- Créer une vitrine numérique géolocalisée en moins de 10 minutes
- Recevoir des demandes de contact ou des commandes directes
- Gérer son catalogue, son stock et ses ventes depuis l'app

**Côté écosystème :**
- Réduire les intermédiaires et améliorer les marges des transformateurs
- Créer une communauté d'acteurs agricoles locaux structurée par filière
- Instaurer la confiance via la vérification des comptes et la réputation

### 2.3 Indicateurs de succès (KPIs)

| KPI | Cible M6 | Cible M12 |
|---|---|---|
| Fournisseurs validés et actifs | 200 | 800 |
| Acheteurs actifs mensuels (MAU) | 1 000 | 5 000 |
| Recherches produits / jour | 300 | 2 000 |
| Mises en relation / mois | 500 | 3 000 |
| Transactions in-app / mois | 200 | 1 500 |
| Taux de satisfaction moyen | > 3,8/5 | > 4,2/5 |
| Délai moyen pour trouver un fournisseur | < 45s | < 30s |

---

## 3. Périmètre du projet

### 3.1 Inclus dans la V1

- Application mobile React Native (Android prioritaire, iOS)
- Recherche produit géolocalisée (cœur du produit)
- Carte interactive avec fournisseurs proches
- Profil fournisseur avec catalogue produits
- Deux modes selon le fournisseur :
  - **Mode Mise en relation** : chat intégré + contact WhatsApp/SMS
  - **Mode Commande** : panier, commande, paiement FedaPay
- Validation manuelle des comptes fournisseurs par l'admin
- Système de notation et réputation
- Réseau communautaire par filière/région
- Modules de formation audio/vidéo
- Interface d'administration web

### 3.2 Hors périmètre V1 (roadmap V2+)

- Logistique déléguée (livraison par tiers partenaires)
- IA de recommandation personnalisée
- Marketplace B2B (ventes en gros entre transformateurs)
- Support multilingue complet (Fon, Yoruba)
- Extension géographique (Togo, Côte d'Ivoire)

---

## 4. Parties prenantes

| Partie prenante | Rôle | Attentes principales |
|---|---|---|
| Acheteurs (ménages, commerces, restaurants) | Utilisateurs principaux | Trouver vite, prix clairs, confiance |
| Fournisseurs d'intrants biologiques | Offreurs | Visibilité locale, commandes, paiement rapide |
| Transformateurs agricoles | Offreurs | Clients de proximité, gestion simplifiée |
| Administrateurs plateforme | Validateurs / gestionnaires | Modération, validation, statistiques |
| FedaPay | Partenaire paiement | Intégration technique, conformité |
| Partenaires institutionnels | Financeurs/validateurs | Impact mesurable |
| Équipe technique | Développeurs | Spécifications claires, architecture solide |

---

## 5. Parcours utilisateurs (UX)

### 5.1 Principes de design UX globaux

1. **La recherche produit est le point d'entrée principal** — pas la carte, pas le catalogue : l'utilisateur cherche *ce qu'il veut*, pas *qui le vend*
2. **Mobile-first strict** : interface conçue pour un écran 5–6 pouces en réseau 2G/3G limité
3. **Pictogrammes & couleurs** : les actions clés sont identifiables sans lecture
4. **Feedback immédiat** : chaque action déclenche un retour visuel ou sonore
5. **Progression sauvegardée** : les formulaires longs sauvegardent automatiquement chaque étape
6. **Mode hors-ligne transparent** : indicateur clair de ce qui est disponible offline
7. **Onboarding en 3 écrans maximum** : l'utilisateur peut chercher un produit sans créer de compte

---

### 5.2 Parcours Acheteur — flux principal

#### Étape 0 — Premier lancement

```
Splash screen eBio
    → Écran 1 : "Trouvez des produits bio près de chez vous" [illustration]
    → Écran 2 : Autorisation de géolocalisation (obligatoire pour l'expérience)
    → Écran 3 : Barre de recherche proéminente + suggestions populaires

NB : pas de création de compte obligatoire pour chercher et contacter.
     Le compte est requis uniquement pour commander (Mode Commande).
```

#### Étape 1 — Recherche d'un produit

```
Barre de recherche (toujours visible en haut)
    → Saisie texte : "huile de palme"
    → Suggestions en temps réel (depuis catalogue local + historique)
    → Ou sélection par catégorie (pictogrammes) :
      Huiles / Céréales / Légumes / Semences / Compost / Autres

Résultats :
    → Liste des fournisseurs triés par distance croissante
    → Chaque carte fournisseur affiche :
        - Nom de la boutique
        - Photo du produit
        - Prix affiché
        - Distance (ex. "1,2 km")
        - Note (étoiles)
        - Mode disponible : [📞 Contacter] ou [🛒 Commander]
        - Badge "Validé eBio" si compte vérifié
    → Switch vue : Liste ↔ Carte
```

#### Étape 2 — Consultation d'un fournisseur

```
Tap sur une carte fournisseur
    → Fiche fournisseur :
        - Photo de couverture + logo/photo profil
        - Nom, localisation (quartier/village), distance
        - Note globale + nombre d'avis
        - Badge "Validé eBio" + badges spéciaux (Top vendeur, Certifié bio)
        - Produits disponibles (grille avec photos, prix, stock)
        - Horaires d'ouverture
        - Modes de contact/commande disponibles
    → Actions :
        - [📍 Y aller]    → ouverture dans Maps natif
        - [💬 Contacter]  → chat eBio ou WhatsApp (Mode Mise en relation)
        - [🛒 Commander]  → panier (Mode Commande)
```

#### Étape 3a — Mode Mise en relation

```
Bouton [Contacter]
    → Options proposées :
        - Chat eBio (si fournisseur actif)
        - WhatsApp (numéro pré-rempli + message type)
        - Appel téléphonique
    → Si Chat eBio :
        - Message d'amorce suggéré :
          "Bonjour, est-ce que votre [produit] est disponible ?
           Je suis à [distance] de chez vous."
        - Fil de conversation standard (texte, photo, note vocale)
    → Pas de paiement in-app dans ce mode
    → L'acheteur peut laisser un avis après la transaction (déclaratif)
```

#### Étape 3b — Mode Commande

```
Bouton [Commander]
    → Sélection quantité + variante (si applicable)
    → Ajout au panier
    → Possibilité de continuer à explorer d'autres fournisseurs
      (panier multi-fournisseurs, paiements séparés)

Panier
    → Récapitulatif produits par fournisseur
    → Choix mode récupération : Retrait sur place / Livraison (si disponible)
    → Si livraison : sélection de créneau horaire
    → Choix paiement : Mobile Money via FedaPay / Paiement à la livraison

Paiement FedaPay
    → Sélection opérateur : MTN MoMo / Moov Money / autres via FedaPay
    → Saisie/confirmation du numéro Mobile Money
    → Push notification sur le téléphone de l'acheteur
    → Confirmation par code PIN dans l'app Mobile Money
    → Webhook FedaPay → mise à jour statut commande
    → Fonds en escrow jusqu'à confirmation de livraison

Confirmation
    → Écran de confirmation avec numéro de commande
    → Notification SMS + push au fournisseur
    → Accès au suivi de commande
```

#### Étape 4 — Suivi de commande (Mode Commande uniquement)

```
Notification "Commande acceptée par [Fournisseur]"
    → Timeline de suivi :
        [✅ Passée] → [✅ Acceptée] → [⏳ En préparation]
        → [⏳ Prête / En livraison] → [✅ Livrée]
    → Chat direct avec le fournisseur depuis cet écran
    → Confirmation de réception → débloque le paiement (escrow libéré)
    → Invitation à noter la commande (1–5 étoiles + commentaire)
```

---

### 5.3 Parcours Fournisseur

#### Étape 1 — Inscription et demande de validation

```
Bouton "Je suis fournisseur"
    → Numéro de téléphone + OTP SMS
    → Informations du compte :
        - Nom de la boutique
        - Type : Fournisseur d'intrants / Transformateur
        - Photo de la boutique / du lieu de vente
        - Localisation : GPS automatique ou marquage manuel sur carte
        - Numéro Mobile Money (FedaPay) pour recevoir les paiements
    → Pièces justificatives (photo) :
        - Pièce d'identité
        - Preuve d'activité (optionnel : registre de commerce, certification bio)
    → Soumission → statut "En attente de validation"
    → Notification SMS dès validation par l'admin (sous 48h)

NB : le fournisseur peut préparer son catalogue en attente de validation,
     mais son profil n'est pas visible dans les recherches.
```

#### Étape 2 — Configuration du profil et du catalogue

```
Tableau de bord fournisseur
    → Choix du mode :
        [📞 Mode Mise en relation] → les acheteurs contactent, pas de commande in-app
        [🛒 Mode Commande]         → commandes et paiements gérés dans eBio
        (modifiable à tout moment)

    → Ajout de produits :
        - Photos (3 max, guide de cadrage intégré)
        - Nom + catégorie (pictogrammes)
        - Prix unitaire + unité (kg, litre, sachet…)
        - Variantes optionnelles (ex. 0,5L / 1L / 5L)
        - Stock disponible + seuil d'alerte de rupture
        - Description courte (texte ou note vocale)
        - Statut : Actif / En rupture / Masqué

    → Paramètres boutique :
        - Horaires d'ouverture
        - Zones de livraison (si Mode Commande) : délimitation sur carte
        - Tarif de livraison par zone
        - Messages de réponse rapide pré-rédigés
```

#### Étape 3 — Gestion quotidienne

```
Tableau de bord (vue accueil fournisseur)
    → Résumé : commandes en attente / messages non lus / stock critique
    → Notifications entrantes :
        - Nouveau message (Mode Mise en relation)
        - Nouvelle commande (Mode Commande)

Gestion d'une commande entrante (Mode Commande)
    → Détail : produits, quantités, mode de récupération, acheteur
    → Actions : [✅ Accepter] [❌ Refuser] [✏️ Proposer modification]
    → Si acceptée : mise à jour automatique du stock
    → Progression du statut jusqu'à la livraison
    → Confirmation de livraison → libération du paiement FedaPay

Analytics
    → CA hebdomadaire / mensuel
    → Produits les plus consultés et les plus commandés
    → Carte de localisation des acheteurs
    → Note moyenne + derniers avis reçus
    → Revenus en attente (escrow)
```

---

### 5.4 Parcours Administrateur (interface web)

```
Dashboard global
    → KPIs : utilisateurs actifs, recherches/jour, transactions, CA plateforme
    → File de validation des fournisseurs
        - Dossier : infos saisies + pièces jointes
        - Actions : [Valider] [Rejeter avec motif] [Demander complément]
        - Notification automatique au fournisseur à chaque décision
    → Modération
        - Contenus signalés (produits, avis, messages communautaires)
        - Comptes suspects
    → Catalogue global
        - Gestion des catégories de produits
        - Gestion des zones géographiques (communes, départements)
    → Transactions
        - Suivi des paiements FedaPay
        - Gestion des litiges
        - Export CSV/Excel
    → Paramétrage
        - Taux de commission par catégorie
        - Plans d'abonnement
        - Messages système (SMS, notifications push)
```

---

### 5.5 Cartographie des écrans

| Écran | Acheteur | Fournisseur | Admin |
|---|---|---|---|
| Recherche produit | ✅ Principal | — | — |
| Carte interactive | ✅ Explorer | ✅ Ma position | ✅ Vue globale |
| Fiche fournisseur | ✅ Consulter | ✅ Gérer | ✅ Modérer |
| Catalogue produits | ✅ Parcourir | ✅ Gérer | ✅ Modérer |
| Panier / Commande | ✅ (Mode Commande) | ✅ Recevoir | ✅ Superviser |
| Chat | ✅ | ✅ | ✅ Lecture |
| Communauté | ✅ | ✅ | ✅ Modérer |
| Formation | ✅ | ✅ | ✅ Gérer |
| Analytics | — | ✅ Ses données | ✅ Global |
| Validation dossiers | — | — | ✅ |

---

## 6. Description fonctionnelle détaillée

### 6.1 Authentification et gestion des comptes

- **Acheteur** : inscription optionnelle (obligatoire uniquement pour le Mode Commande)
- **Fournisseur** : inscription obligatoire + validation admin avant visibilité
- Authentification par numéro de téléphone + OTP SMS
- Connexion biométrique (empreinte) après première session
- Récupération de compte par SMS
- Gestion de session JWT avec refresh token automatique

### 6.2 Moteur de recherche géolocalisée (cœur du produit)

- **Recherche textuelle** avec autocomplétion (produit, catégorie, nom de boutique)
- **Recherche vocale** (accessibilité pour faible alphabétisation)
- **Filtres disponibles** :
  - Distance (1 km / 5 km / 10 km / Personnalisé)
  - Catégorie de produit
  - Prix maximum
  - Disponibilité (en stock uniquement)
  - Note minimum (ex. ≥ 4 étoiles)
  - Mode disponible (Mise en relation / Commande)
  - Badge "Validé eBio" uniquement
- **Tri des résultats** : par distance (défaut), par note, par prix croissant
- **Résultats en temps réel** : mise à jour des stocks sans rechargement de page
- **Recherches récentes** : historique local (offline)

### 6.3 Carte interactive

- **Technologie** : MapLibre GL + tuiles OpenStreetMap (gratuites, offline-capable)
- **Marqueurs fournisseurs** : icônes colorées par catégorie, badge "Validé"
- **Interaction** :
  - Tap sur marqueur → mini-fiche (nom, note, distance, produit + prix)
  - Swipe up → fiche fournisseur complète
  - Clustering automatique en vue dézoomée
- **Couches optionnelles** : promotions en cours, zones de livraison
- **Tuiles hors-ligne** téléchargeables par zone (rayon 20 km)

### 6.4 Profil fournisseur et catalogue

- **Variantes produit** : plusieurs conditionnements par produit (0,5L / 1L / 5L)
- **Prix promotionnel** : prix barré avec date d'expiration
- **Gestion du stock** : mise à jour manuelle ou automatique (Mode Commande)
- **Alerte de rupture** : notification push au fournisseur sous le seuil défini
- **Alerte de disponibilité** : notification push à l'acheteur à la remise en stock
- **Horaires** : fermeture exceptionnelle avec marquage "Fermé" sur la carte

### 6.5 Chat intégré

- **Types de messages** : texte, photo, note vocale, localisation GPS partagée
- **Indicateurs** : "vu", heure d'envoi
- **Templates de réponse rapide** : "Oui, disponible", "Rupture de stock", "Venez me voir"
- **Message d'amorce automatique** : pré-rempli avec le produit recherché et la distance
- **Archivage** : conservation 6 mois pour les conversations liées à une commande
- **Partage WhatsApp** : bouton pour continuer la conversation hors eBio

### 6.6 Commande et paiement FedaPay

**Flux de paiement complet :**

```
1.  Acheteur confirme la commande
2.  Sélection opérateur Mobile Money (MTN, Moov, Orange via FedaPay)
3.  Confirmation du numéro Mobile Money enregistré
4.  Initiation du paiement via API FedaPay
5.  Push de confirmation sur le téléphone de l'acheteur
6.  Confirmation par code PIN dans l'app Mobile Money
7.  Webhook FedaPay → eBio : paiement confirmé
8.  Fonds placés en escrow eBio
9.  Notification fournisseur : "Nouvelle commande payée"
10. Livraison confirmée par les deux parties
11. Libération des fonds vers le compte FedaPay du fournisseur (- commission eBio)
12. Reçu PDF généré automatiquement + envoyé par WhatsApp/SMS
```

**Gestion des litiges :**
- Acheteur peut ouvrir un litige sous 48h après confirmation de livraison
- Médiation par l'admin avec accès aux logs de transaction
- Remboursement automatisé si litige validé

### 6.7 Système de réputation et confiance

**Notation après transaction :**
- Mode Commande : uniquement après confirmation de livraison
- Mode Mise en relation : déclaratif (l'acheteur déclare avoir reçu)
- Critères : Qualité produit / Respect des délais / Communication / Conformité description
- Note globale pondérée (dernières 90 jours pèsent plus)

**Badges de confiance :**
- ✅ **Validé eBio** : compte vérifié manuellement par l'admin
- 🏆 **Top Vendeur** : note ≥ 4,5 + volume de transactions élevé
- 🌱 **Certifié Bio** : document de certification fourni et validé

**Protection anti-manipulation :**
- Détection de comptes multiples (même numéro de téléphone, même appareil)
- Signalement communautaire des avis suspects

### 6.8 Réseau communautaire

- **Groupes de filière** : Huiles, Céréales, Légumes, Semences, Compost, Élevage…
- **Groupes géographiques** : par département, commune
- **Types de publications** : annonce produit, question technique, alerte marché, partage de formation
- **Modération** : signalement communautaire + modération admin
- **Partage social** : Facebook, WhatsApp Business, TikTok

### 6.9 Module Formation

- **Formats** : vidéos courtes portrait 60s (TikTok-style), audio seul, séquences illustrées
- **Thématiques V1** : bonnes pratiques de transformation, fixation du prix, utilisation eBio, accès au crédit
- **Engagement** : badge de complétion, quiz pictographique post-module
- **Téléchargement offline** : contenus disponibles sans connexion

---

## 7. Modèle économique et monétisation

### 7.1 Positionnement tarifaire

eBio adopte un modèle **freemium + commission transactionnelle**. L'accès de base est gratuit pour maximiser l'adoption ; la monétisation croît naturellement avec l'usage.

### 7.2 Sources de revenus

#### 7.2.1 Commission sur transactions (revenu principal)

Prélevée automatiquement à la libération des fonds FedaPay :

| Catégorie | Taux de commission |
|---|---|
| Produits transformés alimentaires | 4% |
| Intrants biologiques | 3% |
| Semences certifiées | 2,5% |

#### 7.2.2 Abonnements fournisseur Premium

| Plan | Prix / mois (FCFA) | Avantages |
|---|---|---|
| **Gratuit** | 0 | 5 produits max, visibilité standard, Mode Mise en relation uniquement |
| **Essentiel** | 2 000 | 20 produits, Mode Commande activé, mise en avant dans les résultats |
| **Pro** | 5 000 | Produits illimités, analytics avancés, badge Pro, 0% commission sur les 10 premières commandes/mois |
| **Coopérative** | 10 000 | Multi-comptes (5 membres max), tableau de bord groupé, tarif préférentiel |

> Le Mode Commande (paiement in-app) est réservé aux plans Essentiel et supérieurs,
> ce qui crée une incitation naturelle à la montée en gamme.

#### 7.2.3 Publicité locale ciblée

- **Marqueurs sponsorisés** sur la carte (halo coloré + position prioritaire)
- **Annonces dans le fil communautaire** (label "Sponsorisé" visible)
- **Notifications promotionnelles** (max 1/semaine, ciblées par zone et filière)
- **Tarif** : à partir de 1 500 FCFA/semaine

#### 7.2.4 Services à valeur ajoutée

| Service | Prix |
|---|---|
| Assistance à l'inscription (agent terrain) | 2 500 FCFA one-shot |
| Validation accélérée (2h au lieu de 48h) | 500 FCFA |
| Rapport analytics PDF mensuel | 1 000 FCFA/rapport |
| Boost de visibilité (produit en tête des résultats 7j) | 1 000 FCFA |

#### 7.2.5 Partenariats institutionnels

- **Licence whitelabel** pour ONG ou projets de développement
- **API données anonymisées** pour institutions de recherche ou partenaires financiers
- **Réponse à appels à projets** : AFD, USAID, FAO

### 7.3 Projections financières indicatives

| Période | Fournisseurs actifs | Transactions/mois | Panier moyen | Volume | Revenus commissions | Revenus abonnements | Total |
|---|---|---|---|---|---|---|---|
| M3 | 80 | 150 | 8 000 FCFA | 1 200 000 | 48 000 | 80 000 | **128 000 FCFA** |
| M6 | 250 | 600 | 9 000 FCFA | 5 400 000 | 216 000 | 300 000 | **516 000 FCFA** |
| M12 | 700 | 2 200 | 10 000 FCFA | 22 000 000 | 880 000 | 800 000 | **~1 700 000 FCFA** |

*Taux de commission moyen retenu : 4%. Hypothèses conservatrices.*

### 7.4 Stratégie d'acquisition

**Phase 0 — Amorçage (avant lancement public)**
Recruter 30 fournisseurs pilotes dans 2–3 zones géographiques cibles via contact direct et agents terrain. Objectif : assurer une densité d'offre suffisante dès le J1.

**Phase 1 — Lancement**
Campagnes WhatsApp ciblées, partenariats avec coopératives agricoles locales, présence sur marchés hebdomadaires, radio locale.

**Phase 2 — Croissance**
Programme de parrainage fournisseur (recrute un fournisseur → 1 mois d'abonnement offert). Contenu organique TikTok/Facebook sur les fournisseurs partenaires.

**Phase 3 — Expansion**
Extension à d'autres départements du Bénin, puis pays voisins (Togo, Côte d'Ivoire) via FedaPay qui couvre l'UEMOA.

### 7.5 Équité et solidarité

- Taux révisés annuellement avec les représentants des fournisseurs
- Réduction de 30% sur les abonnements pour les coopératives et groupements de femmes
- Fonds de solidarité : 0,5% des transactions réservé pour les petits transformateurs isolés

---

## 8. Exigences techniques

### 8.1 Stack technique

| Couche | Technologie | Justification |
|---|---|---|
| Mobile | React Native | iOS + Android depuis une seule codebase |
| Web admin | Next.js | SSR, performance, dashboard admin |
| Backend API | NestJS | Architecture modulaire, WebSockets natifs |
| Base de données | PostgreSQL + PostGIS | Données relationnelles + requêtes géospatiales |
| Cache / Sessions | Redis | File de messages, tokens, rate limiting |
| Stockage fichiers | Cloudflare R2 | S3-compatible, CDN global, coût réduit |
| Cartographie | MapLibre GL + OSM | Gratuit, offline-capable, personnalisable |
| Paiement | FedaPay | Mobile Money UEMOA, Bénin-natif |
| Notifications push | Firebase Cloud Messaging | Android + iOS |
| SMS / OTP | Africa's Talking ou Orange SMS API | Couverture Bénin |
| Déploiement | Docker + Dokku | Infrastructure maîtrisée, scalable progressivement |
| Monitoring | Prometheus + Grafana + Sentry | Métriques + erreurs applicatives |

### 8.2 Offline-first

- Interface de base fonctionnelle sans connexion (catalogue en cache, recherches récentes, panier)
- Synchronisation automatique à la reconnexion avec gestion des conflits
- Actions différées marquées "En attente de connexion"
- Tuiles cartographiques téléchargeables par zone (rayon 20 km) via MapLibre offline

### 8.3 Performance cibles

| Métrique | Cible |
|---|---|
| Temps de chargement initial (3G) | < 3s |
| Temps d'affichage des résultats de recherche | < 1,5s |
| Taille APK | < 30 Mo |
| Images produits (WebP, compressées client) | < 200 Ko |
| Disponibilité plateforme | > 99,5% |

### 8.4 Sécurité

- Authentification JWT avec rotation des refresh tokens
- Chiffrement des données sensibles en base (numéros de téléphone, montants)
- HTTPS obligatoire sur toutes les communications
- Conformité PCI-DSS déléguée à FedaPay (prestataire certifié)
- Journalisation des accès admin et des modifications sensibles
- Rate limiting sur les endpoints d'authentification et de paiement

### 8.5 Géospatial

- **PostGIS** activé sur PostgreSQL pour les requêtes de proximité (`ST_DWithin`, `ST_Distance`)
- Index géospatial sur les positions des fournisseurs
- Recalcul de position fournisseur à chaque mise à jour de profil ou ouverture de l'app

---

## 9. Livrables attendus

| Livrable | Description |
|---|---|
| App Android (APK/AAB) | Build signé, prêt pour le Play Store |
| App iOS | Build TestFlight / App Store |
| API Backend | Documentée via Swagger/OpenAPI |
| Dashboard Admin Web | Next.js, gestion complète |
| Base de données | Schéma versionné (migrations) + seed de données test |
| Documentation technique | Architecture, API, procédures de déploiement |
| Manuel utilisateur | Guides illustrés Acheteur / Fournisseur |
| Rapport de tests | Unitaires, intégration, UAT terrain |
| Plan de déploiement | Procédures de mise en production sur Dokku |

---

## 10. Planning

| Phase | Durée | Activités clés |
|---|---|---|
| **Analyse & Design** | 3 semaines | Ateliers utilisateurs, wireframes React Native, maquettes Figma, validation |
| **Sprint 1 – Fondations** | 3 semaines | Auth OTP, profils, infrastructure Dokku, CI/CD, PostGIS |
| **Sprint 2 – Recherche & Carte** | 3 semaines | Moteur de recherche géolocalisée, MapLibre, catalogue fournisseur |
| **Sprint 3 – Mise en relation** | 2 semaines | Chat intégré, WhatsApp/SMS, Mode Mise en relation complet |
| **Sprint 4 – Commande & FedaPay** | 3 semaines | Panier, flux de commande, intégration FedaPay, escrow |
| **Sprint 5 – Validation admin & réputation** | 2 semaines | Dashboard admin, file de validation, notation |
| **Sprint 6 – Communauté & Formation** | 2 semaines | Groupes, publications, modules audio/vidéo |
| **Tests & UAT terrain** | 3 semaines | Tests techniques + tests avec fournisseurs pilotes et acheteurs réels |
| **Déploiement & Formation** | 2 semaines | Mise en production, formation des agents terrain |

**Durée totale estimée : 5 à 6 mois**

---

## 11. Risques et mesures d'atténuation

| Risque | Probabilité | Impact | Mesure |
|---|---|---|---|
| Faible densité d'offre au lancement | Élevée | Critique | Recrutement de 30 fournisseurs pilotes avant ouverture publique |
| Délai de validation admin trop long | Moyenne | Élevé | SLA 48h + validation accélérée payante + tableau de bord dédié admin |
| Problèmes d'intégration FedaPay | Moyenne | Élevé | Tests dès Sprint 4, fallback paiement à la livraison |
| Connectivité insuffisante en zone rurale | Élevée | Élevé | Architecture offline-first stricte dès Sprint 1 |
| Fraudes / faux comptes fournisseurs | Moyenne | Moyen | Validation manuelle + signalement communautaire |
| Faible alphabétisation | Élevée | Moyen | Pictogrammes, recherche vocale, agents terrain |
| Dérapage du planning | Moyenne | Moyen | Sprints courts, MVP limité, V2 documentée séparément |

---

## 12. Annexes

### Annexe A — Glossaire

| Terme | Définition |
|---|---|
| Mode Mise en relation | Le fournisseur n'accepte pas les commandes in-app ; l'acheteur le contacte par chat/WhatsApp/téléphone |
| Mode Commande | Le fournisseur accepte les commandes et paiements directement dans eBio |
| Escrow | Mécanisme de séquestre : le paiement est retenu jusqu'à confirmation de livraison |
| FedaPay | Agrégateur de paiement Mobile Money couvrant l'UEMOA (MTN, Moov, Orange…) |
| PostGIS | Extension PostgreSQL pour les requêtes géospatiales (distance, proximité) |
| Offline-first | L'application fonctionne sans connexion et se synchronise à la reconnexion |
| OTP | Code à usage unique envoyé par SMS pour l'authentification |
| PWA | Progressive Web App : application web installable sur mobile |

### Annexe B — Intégrations tierces

| Service | Usage |
|---|---|
| FedaPay | Paiement Mobile Money UEMOA (MTN, Moov, Orange…) |
| Africa's Talking / Orange SMS API | OTP et notifications SMS |
| WhatsApp Business API | Partage de reçus, contact fournisseur |
| MapLibre + OpenStreetMap | Cartographie offline gratuite |
| Cloudflare R2 | Stockage photos et vidéos |
| Firebase Cloud Messaging | Notifications push Android + iOS |
| Sentry | Monitoring des erreurs applicatives |

---

*Document eBio — Version 3.0 — Mars 2026*
*À réviser après atelier de validation avec les parties prenantes.*
