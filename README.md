<p align="center">
  <strong>eBio</strong> — Trouvez des produits bio près de chez vous
</p>

# eBio Marketplace

Marketplace géolocalisé de produits biologiques pour l'Afrique de l'Ouest.

## Table des matières

- [Vue d'ensemble](#vue-densemble)
- [Stack technique](#stack-technique)
- [Structure du projet](#structure-du-projet)
- [Prérequis](#prérequis)
- [Installation rapide](#installation-rapide)
- [Installation manuelle](#installation-manuelle)
- [Services Docker](#services-docker)
- [Variables d'environnement](#variables-denvironnement)
- [Commandes utiles](#commandes-utiles)
- [Développement](#développement)
- [Déploiement (Dokku)](#déploiement-dokku)
- [Documentation complémentaire](#documentation-complémentaire)

---

## Vue d'ensemble

Ce projet utilise une architecture **monorepo**. Les avantages :

- Développement full-stack sans changer de contexte, un seul PR par feature complète
- Déploiement simplifié : pas besoin de synchroniser plusieurs dépôts
- Typage end-to-end fort, refactoring facilité
- Outillage unifié (linter, build, tests)

## Stack technique

| Couche | Technologies |
|--------|-------------|
| **Backend** | NestJS, MikroORM 6, PostgreSQL + PostGIS, Redis, Better Auth |
| **Frontend Web** | React 19, Vite, TailwindCSS 4, Radix UI, TanStack (Query, Table, Form), React Router v7 |
| **Mobile** | React Native / Expo |
| **Packages partagés** | UI (shadcn/ui), OpenAPI Generator (SDK typé), i18n (FR/EN) |
| **Infra dev** | Docker Compose (PostgreSQL, Redis, MailDev, MinIO) |
| **Infra prod** | Dokku, Let's Encrypt, Nginx |

## Structure du projet

```
ebio/
├── apps/
│   ├── api/                  # Backend NestJS (REST API, port 3000)
│   ├── web-spa/              # Frontend React SPA fournisseur/admin (port 5173)
│   ├── mobile/               # App React Native/Expo pour acheteurs
│   └── documentation/        # Documentation Astro (Starlight)
├── packages/
│   ├── ui/                   # Composants réutilisables (shadcn/ui)
│   ├── openapi-generator/    # SDK typé généré depuis l'API
│   └── i18n/                 # Traductions FR/EN
├── docker-compose.yml        # Services de développement
├── pnpm-workspace.yaml       # Configuration monorepo
└── .env.example              # Variables d'environnement racine
```

## Prérequis

Avant de commencer, assurez-vous d'avoir installé :

| Outil | Version requise | Installation |
|-------|----------------|-------------|
| **Node.js** | 24.13.0 | `fnm install 24.13.0` ou [nodejs.org](https://nodejs.org/) |
| **pnpm** | 10.28.2 | `npm install -g pnpm@10.28.2` |
| **Docker** | Dernière version | [docker.com](https://www.docker.com/) |
| **Docker Compose** | Dernière version | Inclus avec Docker Desktop |
| **Git** | Dernière version | [git-scm.com](https://git-scm.com/) |

Vérifiez vos versions :

```bash
node -v    # v24.13.0
pnpm -v    # 10.28.2
docker -v  # Docker version 2x.x.x
```

---

## Installation rapide

La méthode la plus simple pour démarrer :

```bash
# 1. Cloner le dépôt
git clone <url-du-repo>
cd ebio

# 2. Installer la bonne version de Node
fnm use 24.13.0

# 3. Installer les dépendances
pnpm install

# 4. Lancer le script de configuration interactif
pnpm rock
```

Le script `pnpm rock` va :
- Copier les fichiers `.env.example` vers `.env`
- Vous demander la configuration de la base de données et des ports
- Démarrer les services Docker (PostgreSQL, Redis, MailDev, MinIO)
- Optionnellement exécuter les migrations et le seeding

```bash
# 5. Lancer l'application en mode développement
pnpm dev
```

L'application sera accessible sur :
- **API** : http://localhost:3000
- **Documentation API (Scalar)** : http://localhost:3000/api/docs
- **Web SPA** : http://localhost:5173
- **MailDev** : http://localhost:1080

---

## Installation manuelle

Si vous préférez configurer manuellement :

### 1. Copier les fichiers d'environnement

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web-spa/.env.example apps/web-spa/.env
cp packages/openapi-generator/.env.example packages/openapi-generator/.env
```

### 2. Adapter les variables d'environnement

Éditez `.env` à la racine pour configurer les ports de Docker Compose, puis `apps/api/.env` pour la configuration de l'API. Voir la section [Variables d'environnement](#variables-denvironnement).

### 3. Démarrer les services Docker

```bash
pnpm docker:up
```

Attendez que PostgreSQL soit prêt (vérifiable avec `pnpm docker:logs`).

### 4. Initialiser la base de données

Deux options selon votre besoin :

```bash
# Option A : Schéma frais depuis les entités (recommandé pour le premier lancement)
cd apps/api
pnpm db:fresh

# Option B : Schéma frais + données de démonstration
cd apps/api
pnpm db:fresh:seed
```

### 5. Générer le client OpenAPI

```bash
# Lancer l'API d'abord (dans un terminal séparé)
cd apps/api && pnpm dev

# Puis générer le SDK typé
pnpm generate
```

### 6. Lancer le développement

```bash
# Depuis la racine du projet
pnpm dev
```

---

## Services Docker

Le fichier `docker-compose.yml` fournit 4 services pour le développement :

| Service | Image | Port(s) | Description |
|---------|-------|---------|-------------|
| **PostgreSQL** | `postgis/postgis:16-3.4-alpine` | `${DATABASE_PORT}:5432` (défaut: 5111) | Base de données avec support géospatial PostGIS |
| **Redis** | `redis:7-alpine` | `${REDIS_PORT}:6379` (défaut: 6379) | Cache, sessions, rate limiting, adaptateur WebSocket |
| **MailDev** | `netoun/mail-server-dev` | SMTP: `${SMTP_PORT}:1025`, Web: `${SMTP_PORT_WEB}:1080` | Serveur SMTP de développement avec interface web |
| **MinIO** | `minio/minio:latest` | S3: `${MINIO_PORT}:9000`, Console: `${MINIO_CONSOLE_PORT}:9001` | Stockage S3-compatible (dev uniquement) |

### Commandes Docker

```bash
pnpm docker:up      # Démarrer les services
pnpm docker:down    # Arrêter les services
pnpm docker:logs    # Voir les logs en temps réel
```

---

## Variables d'environnement

### Racine (`.env`)

Utilisé par Docker Compose pour configurer les ports et credentials des services.

| Variable | Défaut | Description |
|----------|--------|-------------|
| `DATABASE_PORT` | `5111` | Port PostgreSQL exposé |
| `DATABASE_USER` | `postgres` | Utilisateur PostgreSQL |
| `DATABASE_PASSWORD` | `postgres` | Mot de passe PostgreSQL |
| `DATABASE_NAME` | `ebio_dev` | Nom de la base de données |
| `REDIS_PORT` | `6379` | Port Redis exposé |
| `SMTP_PORT` | `1025` | Port SMTP MailDev |
| `SMTP_PORT_WEB` | `1080` | Port interface web MailDev |

### API (`apps/api/.env`)

| Variable | Requis | Description |
|----------|--------|-------------|
| `API_PORT` | Oui | Port de l'API (défaut: `3000`) |
| `API_BASE_URL` | Oui | URL publique de l'API |
| `DATABASE_HOST` | Oui | Hôte PostgreSQL |
| `DATABASE_PORT` | Oui | Port PostgreSQL |
| `DATABASE_USER` | Oui | Utilisateur PostgreSQL |
| `DATABASE_PASSWORD` | Oui | Mot de passe PostgreSQL |
| `DATABASE_NAME` | Oui | Nom de la base |
| `BETTER_AUTH_SECRET` | Oui | Secret pour Better Auth (min 32 chars) |
| `TRUSTED_ORIGINS` | Oui | Origines autorisées CORS (séparées par virgule) |
| `CLIENTS_WEB_APP_URL` | Oui | URL du SPA web |
| `CLIENTS_WEB_SSR_URL` | Oui | URL du SSR web |
| `REDIS_URL` | Non | URL Redis (défaut: `redis://localhost:6379`) |
| `EMAIL_HOST` | Non | Hôte SMTP |
| `EMAIL_PORT` | Non | Port SMTP |
| `EMAIL_FROM` | Non | Adresse expéditeur |
| `S3_ENDPOINT` | Non | Endpoint S3/MinIO |
| `FEDAPAY_API_KEY` | Non | Clé API FedaPay |
| `STRIPE_SECRET_KEY` | Non | Clé secrète Stripe |
| `FCM_PROJECT_ID` | Non | Project ID Firebase (notifications push) |
| `SENTRY_DSN` | Non | DSN Sentry (monitoring) |

### Web SPA (`apps/web-spa/.env`)

| Variable | Requis | Description |
|----------|--------|-------------|
| `VITE_API_URL` | Oui | URL de l'API backend (ex: `http://localhost:3000`) |

> **Note** : Seules les variables préfixées par `VITE_` sont accessibles côté client.

---

## Commandes utiles

### Développement

| Commande | Description |
|----------|-------------|
| `pnpm dev` | Lancer toutes les apps en mode développement |
| `pnpm build` | Builder toutes les apps pour la production |
| `pnpm lint` | Vérifier le code avec ESLint |
| `pnpm lint:fix` | Corriger automatiquement les erreurs de lint |
| `pnpm typecheck` | Vérifier le typage TypeScript |
| `pnpm test` | Lancer les tests |
| `pnpm generate` | Générer le client OpenAPI typé |

### Base de données

Toutes ces commandes s'exécutent depuis `apps/api/` :

| Commande | Description |
|----------|-------------|
| `pnpm db:fresh` | Supprimer et recréer le schéma depuis les entités |
| `pnpm db:fresh:seed` | Schéma frais + données de seed |
| `pnpm db:migrate:create` | Créer une nouvelle migration |
| `pnpm db:migrate:up` | Exécuter les migrations en attente |
| `pnpm db:migrate:down` | Annuler la dernière migration |
| `pnpm db:migrate:fresh` | Fresh via migrations (sans seed) |
| `pnpm db:migrate:seed` | Fresh via migrations + seed |
| `pnpm db:sync` | Synchroniser le schéma depuis les entités (non destructif) |

### Documentation interne

```bash
pnpm docs-only   # Lancer le serveur de documentation Astro
```

---

## Développement

### Applications

| App | Framework | Cible | README |
|-----|-----------|-------|--------|
| **api** | NestJS | Backend REST API | [apps/api/README.md](apps/api/README.md) |
| **web-spa** | React + Vite | Dashboard fournisseur/admin | [apps/web-spa/README.md](apps/web-spa/README.md) |
| **mobile** | React Native / Expo | App acheteur | `apps/mobile/` |

### Packages partagés

| Package | Description |
|---------|-------------|
| **ui** | Composants réutilisables basés sur shadcn/ui (Radix + TailwindCSS) |
| **openapi-generator** | Types, validateurs et SDK générés depuis le schéma OpenAPI de l'API |
| **i18n** | Traductions internationales (Français, English) |

### Workflow de développement typique

```bash
# 1. Créer une branche feature
git checkout -b feature/ma-feature

# 2. Lancer les services et le dev
pnpm docker:up
pnpm dev

# 3. Modifier l'API → régénérer le SDK
pnpm generate

# 4. Vérifier avant de commit
pnpm lint
pnpm typecheck
pnpm test

# 5. Commit et push
git add .
git commit -m "feat: description de la feature"
git push origin feature/ma-feature
```

### Hooks Git

Le projet utilise **Husky** avec un hook `pre-push` qui exécute automatiquement :
1. `pnpm lint` — vérification du code
2. `pnpm typecheck` — vérification des types
3. `pnpm test` — exécution des tests

Le push sera bloqué si l'une de ces étapes échoue.

---

## Déploiement (Dokku)

L'application est déployée sur un serveur **Dokku** avec 2 apps distinctes.

### Architecture de déploiement

```
┌─────────────────────────────────────────────────────────────┐
│                    Serveur Dokku                            │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐                        │
│  │   ebio-api   │  │   ebio-web   │                        │
│  │  (NestJS)    │  │   (Nginx)    │                        │
│  │  Port 3000   │  │   Port 80    │                        │
│  └──────┬───────┘  └──────────────┘                        │
│         │                                                   │
│  ┌──────┴───────┐  ┌──────────────┐                        │
│  │  PostgreSQL  │  │    Redis     │                        │
│  │  + PostGIS   │  │              │                        │
│  └──────────────┘  └──────────────┘                        │
│                                                             │
│  Nginx reverse proxy + Let's Encrypt SSL                    │
└─────────────────────────────────────────────────────────────┘
```

### Prérequis serveur

- Serveur Linux avec **Dokku >= 0.31** installé
- Plugins Dokku : `postgres`, `redis`, `letsencrypt`
- Votre clé SSH publique ajoutée à Dokku : `dokku ssh-keys:add <nom> <chemin-cle.pub>`

### Premier déploiement (étape par étape)

#### 1. Créer les apps Dokku

```bash
ssh <votre-serveur> "
  dokku apps:create ebio-api
  dokku apps:create ebio-web
"
```

#### 2. Créer les services

```bash
ssh <votre-serveur> "
  # PostgreSQL avec PostGIS
  dokku postgres:create ebio-postgres --image postgis/postgis --image-version 16-3.4-alpine

  # Redis
  dokku redis:create ebio-redis
"
```

> **Note** : Si la création Redis échoue avec une erreur `404: Not Found` dans le fichier de config, corrigez l'URL dans le plugin :
> ```bash
> sudo sed -i 's|antirez/redis|redis/redis|' /var/lib/dokku/plugins/available/redis/functions
> ```
> Puis recréez le service.

#### 3. Linker les services à l'API

```bash
ssh <votre-serveur> "
  dokku postgres:link ebio-postgres ebio-api
  dokku redis:link ebio-redis ebio-api
"
```

Cela injecte automatiquement `DATABASE_URL` et `REDIS_URL` dans l'app.

#### 4. Activer PostGIS sur la base

```bash
ssh <votre-serveur> "
  dokku postgres:connect ebio-postgres <<< 'CREATE EXTENSION IF NOT EXISTS postgis;'
"
```

#### 5. Configurer les builders Dockerfile

```bash
ssh <votre-serveur> "
  # API
  dokku builder:set ebio-api selected dockerfile
  dokku builder-dockerfile:set ebio-api dockerfile-path apps/api/Dockerfile
  dokku ports:set ebio-api http:80:3000

  # Web SPA
  dokku builder:set ebio-web selected dockerfile
  dokku builder-dockerfile:set ebio-web dockerfile-path apps/web-spa/Dockerfile
  dokku ports:set ebio-web http:80:80
"
```

#### 6. Configurer les domaines

```bash
IP=$(ssh <votre-serveur> "hostname -I" | awk '{print $1}')

ssh <votre-serveur> "
  dokku domains:enable ebio-api
  dokku domains:set ebio-api ebio-api.${IP}.sslip.io

  dokku domains:enable ebio-web
  dokku domains:set ebio-web ebio-web.${IP}.sslip.io
"
```

> **Domaine personnalisé** : Remplacez `ebio-api.${IP}.sslip.io` par votre vrai domaine (ex: `api.ebio.bj`).

#### 7. Configurer les variables d'environnement

Récupérez d'abord le mot de passe de la base :

```bash
ssh <votre-serveur> "dokku postgres:info ebio-postgres --dsn"
# Sortie : postgres://postgres:<MOT_DE_PASSE>@dokku-postgres-ebio-postgres:5432/ebio_postgres
```

Puis configurez l'API :

```bash
ssh <votre-serveur> "
  dokku config:set --no-restart ebio-api \
    API_PORT=3000 \
    API_BASE_URL=https://ebio-api.<IP>.sslip.io \
    CLIENTS_WEB_APP_URL=https://ebio-web.<IP>.sslip.io \
    CLIENTS_WEB_SSR_URL=https://ebio-web.<IP>.sslip.io \
    TRUSTED_ORIGINS=https://ebio-api.<IP>.sslip.io,https://ebio-web.<IP>.sslip.io \
    BETTER_AUTH_SECRET=\$(openssl rand -base64 32) \
    NODE_ENV=production \
    DATABASE_HOST=dokku-postgres-ebio-postgres \
    DATABASE_PORT=5432 \
    DATABASE_USER=postgres \
    DATABASE_PASSWORD=<MOT_DE_PASSE> \
    DATABASE_NAME=ebio_postgres \
    EMAIL_HOST=smtp.gmail.com \
    EMAIL_PORT=587 \
    EMAIL_SECURE=true \
    EMAIL_USER=<votre-email> \
    EMAIL_PASSWORD=<votre-mot-de-passe-app> \
    EMAIL_FROM=<adresse-expediteur>
"
```

Configurez le Web SPA (build arg pour Vite) :

```bash
ssh <votre-serveur> "
  dokku config:set --no-restart ebio-web \
    VITE_API_URL=https://ebio-api.<IP>.sslip.io

  dokku docker-options:add ebio-web build \
    '--build-arg VITE_API_URL=https://ebio-api.<IP>.sslip.io'
"
```

#### 8. Ajouter les git remotes et déployer

```bash
# Depuis votre machine locale, à la racine du projet
git remote add dokku-api dokku@<IP>:ebio-api
git remote add dokku-web dokku@<IP>:ebio-web

# Déployer l'API
git push dokku-api <votre-branche>:main

# Déployer le Web SPA
git push dokku-web <votre-branche>:main
```

> **Note** : Si le hook `pre-push` bloque le déploiement (lint errors), utilisez `--no-verify` pour les remotes Dokku uniquement.

#### 9. Initialiser la base de données

```bash
ssh <votre-serveur> "
  # Synchroniser le schéma depuis les entités
  dokku run ebio-api npx mikro-orm schema:update --run

  # Seeder les rôles et permissions
  dokku run ebio-api npx mikro-orm seeder:run --class=RbacSeeder

  # Seeder les données de base (catégories, plans d'abonnement)
  dokku run ebio-api npx mikro-orm seeder:run --class=EbioSeeder

  # (Optionnel) Seeder les données de démonstration complètes
  dokku run ebio-api npx mikro-orm seeder:run
"
```

#### 10. Activer HTTPS (Let's Encrypt)

```bash
ssh <votre-serveur> "
  dokku letsencrypt:set ebio-api email <votre-email>
  dokku letsencrypt:enable ebio-api

  dokku letsencrypt:set ebio-web email <votre-email>
  dokku letsencrypt:enable ebio-web
"
```

### Redéploiement

Pour mettre à jour l'application après des modifications :

```bash
# Commiter vos changements
git add .
git commit -m "feat: description"

# Redéployer (une ou les deux apps selon les changements)
git push dokku-api <votre-branche>:main    # API
git push dokku-web <votre-branche>:main    # Web SPA
```

> **Important** : Si vous modifiez les entités MikroORM, synchronisez le schéma après le déploiement :
> ```bash
> ssh <votre-serveur> "dokku run ebio-api npx mikro-orm schema:update --run"
> ```

### Commandes Dokku utiles

| Commande | Description |
|----------|-------------|
| `dokku logs ebio-api -t` | Voir les logs en temps réel |
| `dokku ps:report ebio-api` | Voir le statut de l'app |
| `dokku config:show ebio-api` | Voir les variables d'environnement |
| `dokku config:set ebio-api KEY=value` | Ajouter/modifier une variable |
| `dokku run ebio-api <commande>` | Exécuter une commande dans le container |
| `dokku postgres:connect ebio-postgres` | Se connecter au shell PostgreSQL |
| `dokku enter ebio-api web` | Ouvrir un shell dans le container en cours |
| `dokku ps:restart ebio-api` | Redémarrer l'app |
| `dokku ps:scale ebio-api web=2` | Scaler horizontalement |

### Ajouter un domaine personnalisé

```bash
ssh <votre-serveur> "
  # Ajouter le domaine
  dokku domains:add ebio-api api.ebio.bj
  dokku domains:add ebio-web app.ebio.bj

  # Mettre à jour les variables
  dokku config:set ebio-api \
    API_BASE_URL=https://api.ebio.bj \
    CLIENTS_WEB_APP_URL=https://app.ebio.bj \
    TRUSTED_ORIGINS=https://api.ebio.bj,https://app.ebio.bj

  dokku config:set ebio-web VITE_API_URL=https://api.ebio.bj
  dokku docker-options:add ebio-web build '--build-arg VITE_API_URL=https://api.ebio.bj'

  # Renouveler les certificats SSL
  dokku letsencrypt:enable ebio-api
  dokku letsencrypt:enable ebio-web
"
```

N'oubliez pas de configurer les enregistrements DNS (A record) pointant vers l'IP du serveur.

### Comptes de démonstration

Si vous avez exécuté le `DatabaseSeeder`, voici les comptes disponibles :

| Rôle | Email | Mot de passe |
|------|-------|-------------|
| Admin | admin@ebio.bj | Password123! |
| Acheteur | amina@example.com | Password123! |
| Acheteur | rachid@example.com | Password123! |
| Fournisseur | koffi@example.com | Password123! |
| Fournisseur | adama@example.com | Password123! |
| Fournisseur | fatou@example.com | Password123! |

---

## Documentation complémentaire

La documentation détaillée du projet est accessible via `pnpm docs-only` ou dans les fichiers suivants :

### Architecture et design

- [Philosophie de design](apps/documentation/src/content/docs/explanations/0_designphilosophy.mdx)
- [Architecture](apps/documentation/src/content/docs/explanations/1_architecture.mdx)
- [Linter](apps/documentation/src/content/docs/explanations/3_linter.mdx)
- [Architecture réseau](apps/documentation/src/content/docs/explanations/4_network-architecture.mdx)
- [ORM](apps/documentation/src/content/docs/explanations/5_orm.mdx)
- [Migrations](apps/documentation/src/content/docs/explanations/6_database-migrations.mdx)

### Guides

- [Tester l'API](apps/documentation/src/content/docs/guides/api-testing.mdx)
- [Gestion de la base de données](apps/documentation/src/content/docs/guides/database-management.mdx)
- [Chiffrer les variables d'environnement](apps/documentation/src/content/docs/guides/encrypt-env.mdx)
- [Générer les types OpenAPI](apps/documentation/src/content/docs/guides/generating-types.mdx)

### Références

- [Guidelines générales](apps/documentation/src/content/docs/references/general.mdx)
- [Guidelines frontend](apps/documentation/src/content/docs/references/frontend.mdx)
- [Guidelines backend](apps/documentation/src/content/docs/references/backend.mdx)

### Features

- [Variables d'environnement](apps/documentation/src/content/docs/core-features/0_env-file.mdx)
- [Authentification](apps/documentation/src/content/docs/core-features/1_auth.mdx)
- [Monitoring](apps/documentation/src/content/docs/core-features/2_monitoring.mdx)
- [Stockage fichiers](apps/documentation/src/content/docs/core-features/3_filestorage.mdx)
- [IA](apps/documentation/src/content/docs/core-features/4_ai.mdx)
- [Email](apps/documentation/src/content/docs/core-features/5_email.mdx)
