<p align="center">
  <strong>eBio</strong> — Trouvez des produits bio près de chez vous
</p>

# eBio Marketplace

Marketplace géolocalisé de produits biologiques pour l'Afrique de l'Ouest.

## Table of Contents

- [Overview](#-overview)
- [Tech Stack](#️-tech-stack)
- [Project Structure](#-project-structure)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Docker Services](#-docker-services)
- [Useful Commands](#️-useful-commands)
- [Development](#-development)
- [Documentation](#-documentation)
- [Deployment](#-deployment)

## Overview

This project uses a "monorepo" architecture. The advantages are numerous, but primarily:

- Ability to develop full-stack features without context switching, making a single PR for a complete feature;
- Easier deployment: no need to synchronize multiple separate deployments;
- Strong end-to-end typing, easier refactoring;
- Simplified and unified tooling (linter, build, etc.)

## Tech Stack

See the [Architecture](apps/documentation/src/content/docs/explanations/1_architecture.mdx) page for more details.

## Project Structure

See the [Architecture](apps/documentation/src/content/docs/explanations/1_architecture.mdx) page for more details.

## Prerequisites

- [Node.js](https://nodejs.org/) (version 24.13.0)
- [PNPM](https://pnpm.io/) (version 10.28.2)
- [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/)

## Installation

1. Clone the repository

```bash
git clone <your-repo-url>
cd ebio
```

2. Ensure you have the correct node and pnpm versions (see root `package.json` file's `engines` property).

```bash
fnm use 24.13.0
npm i -g pnpm@10.28.2
```

3. Install dependencies:

```bash
pnpm install
```

4. Run the setup script

```bash
pnpm rock
```

5. Start applications in development mode:

```bash
pnpm dev
```

### Manual Setup (Alternative)

1. Copy environment files:

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web-spa/.env.example apps/web-spa/.env
cp packages/openapi-generator/.env.example packages/openapi-generator/.env
```

2. Start Docker services:

```bash
pnpm docker:up
```

3. Run migrations or set up your schema by following the instructions in the [API README](apps/api/README.md).

## Docker Services

The project uses Docker Compose to provide the following services:

- PostgreSQL + PostGIS - Database server with geospatial support
- Redis - Cache, sessions, rate limiting, WebSocket adapter
- MailDev - SMTP server for development
- MinIO - S3-compatible storage (dev only)

## Useful Commands

### Docker

- **Start Docker services**: `pnpm docker:up`
- **Stop Docker services**: `pnpm docker:down`
- **View Docker logs**: `pnpm docker:logs`

### Development

- **Start development**: `pnpm dev`
- **Build applications**: `pnpm build`
- **Lint applications**: `pnpm lint`
- **Generate OpenAPI clients**: `pnpm generate`

### Database (API)

- **Create migration**: `pnpm db:migrate:create`
- **Run migrations**: `pnpm db:migrate:up`
- **Rollback last migration**: `pnpm db:migrate:down`
- **Initialize data**: `pnpm db:seed`

### Tests

- **Run tests**: `pnpm test`

## Development

### Applications

- The API is built with NestJS and provides a REST API. See the [API README](apps/api/README.md).
- The web-spa is the fournisseur/admin SPA built with React. See the [Web SPA README](apps/web-spa/README.md).
- The mobile app is built with React Native/Expo for acheteurs.

### Shared Packages

- **UI** — Reusable UI components built with shadcn/ui.
- **OpenAPI Generator** — Generated types, validators and SDK for frontend-backend communication.
- **i18n** — Internationalization (FR/EN).

## Documentation

Project documentation is available in the `docs/` folder and in app `README`s.

- [General Guidelines](apps/documentation/src/content/docs/references/general.mdx)
- [Frontend Guidelines](apps/documentation/src/content/docs/references/frontend.mdx)
- [Backend Guidelines](apps/documentation/src/content/docs/references/backend.mdx)
- [API Readme](apps/api/README.md)
- [Frontend Readme](apps/web-spa/README.md)

## Deployment

Options:

- Use a PaaS cloud service like Render or Dokploy
- Build via Docker and publish images to a registry
- Use docker-compose (not recommended for production)

See dedicated README files for Docker build instructions.
# ebio
