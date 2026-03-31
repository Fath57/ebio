# Quickstart: eBio Marketplace V1

## Prerequisites

- Node.js 24.13.0 (`fnm use 24.13.0`)
- pnpm 10.28.2 (`npm i -g pnpm@10.28.2`)
- Docker + Docker Compose
- Android Studio / Xcode (for mobile development)
- Expo CLI (`npx expo`)

## 1. Setup Infrastructure

```bash
# Clone and install dependencies
git clone <repo-url> && cd ebio
pnpm install

# Start Docker services (PostgreSQL + PostGIS, Redis, MinIO, MailDev)
pnpm docker:up

# Run automated setup
pnpm rock
```

## 2. Database Setup

```bash
# Enable PostGIS extension (first time only)
# This is handled in the initial migration

# Run migrations
pnpm db:migrate:up

# Seed initial data (categories, admin user, subscription plans)
pnpm db:seed
```

### Seed Data Includes:
- **Categories**: Huiles, Céréales, Légumes, Semences, Compost, Autres
- **Subscription Plans**: Gratuit, Essentiel (2000 FCFA), Pro (5000 FCFA), Coopérative (10000 FCFA)
- **Admin User**: admin@ebio.bj / configured password + OTP
- **Test Suppliers**: 5 validated suppliers with products in Cotonou area
- **Commission Rates**: 4% alimentaire, 3% intrants, 2.5% semences

## 3. Environment Variables

### apps/api/.env
```env
DATABASE_URL=postgresql://ebio:ebio@localhost:5432/ebio
REDIS_URL=redis://localhost:6379
JWT_SECRET=<generate>
JWT_REFRESH_SECRET=<generate>

# FedaPay
FEDAPAY_API_KEY=<sandbox key>
FEDAPAY_WEBHOOK_SECRET=<webhook secret>
FEDAPAY_ENVIRONMENT=sandbox

# SMS (Africa's Talking)
AT_API_KEY=<api key>
AT_USERNAME=<username>
AT_SENDER_ID=eBio

# Firebase Cloud Messaging
FCM_PROJECT_ID=<project id>
FCM_PRIVATE_KEY=<path to service account json>

# File Storage (Cloudflare R2 / MinIO in dev)
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=ebio
S3_PUBLIC_URL=http://localhost:9000/ebio

# WhatsApp Business (optional)
WHATSAPP_API_TOKEN=<token>
```

### apps/mobile/.env
```env
EXPO_PUBLIC_API_URL=http://localhost:3000
EXPO_PUBLIC_WS_URL=ws://localhost:3000
EXPO_PUBLIC_MAPLIBRE_STYLE=https://tiles.example.com/style.json
```

### apps/web-spa/.env
```env
VITE_API_URL=http://localhost:3000
```

### apps/web-ssr/.env
```env
VITE_API_URL=http://localhost:3000
```

## 4. Start Development

```bash
# Start all apps
pnpm dev

# Or start individually:
pnpm --filter=api dev          # API on :3000
pnpm --filter=mobile dev       # Expo on :8081
pnpm --filter=web-spa dev      # Web SPA on :5173
pnpm --filter=web-ssr dev      # Web SSR on :5174
```

## 5. Mobile App (Expo)

```bash
cd apps/mobile

# Start Expo dev server
npx expo start

# Run on Android
npx expo run:android

# Run on iOS (macOS only)
npx expo run:ios
```

### Required Expo packages:
- `expo-location` — Geolocation
- `expo-local-authentication` — Biometric unlock
- `expo-av` — Audio recording (voice notes)
- `expo-file-system` — Offline content storage
- `expo-notifications` — Push notifications
- `@maplibre/maplibre-react-native` — Map component
- `expo-font` + Google Fonts packages

## 6. Generate OpenAPI SDK

After modifying API contracts (Zod schemas with `.meta()`):

```bash
pnpm generate
```

This regenerates:
- `packages/openapi-generator/client/sdk.gen.ts`
- `packages/openapi-generator/client/types.gen.ts`
- `packages/openapi-generator/client/schemas.gen.ts`
- `packages/openapi-generator/client/zod.gen.ts`

## 7. Verify Setup

### API Health
```bash
curl http://localhost:3000/api/health
# → { "status": "ok", "database": "connected", "redis": "connected" }
```

### OpenAPI Docs
Open http://localhost:3000/api/docs

### FedaPay Sandbox
Use FedaPay sandbox test numbers for payment testing.

### WebSocket Test
```bash
# Using wscat or Socket.IO client
wscat -c "ws://localhost:3000/ws/chat" -H "Authorization: Bearer <token>"
```

## 8. Key Development Workflows

### Adding a new API module
```bash
cd apps/api
pnpm generate:module --name=my-feature
# Creates: module, controller, service, entity, contracts, tests
```

### Adding a mobile feature
```
apps/mobile/src/features/my-feature/
├── components/       # Feature-specific components
├── hooks/           # Feature-specific hooks (queries, mutations)
└── utils/           # Feature-specific utilities
```

### Adding a web feature (web-spa or web-ssr)
```
apps/web-spa/src/features/my-feature/
├── components/
├── hooks/
└── utils/
```

### Design System tokens
- **Mobile**: import from `apps/mobile/src/theme/theme.ts`
- **Web**: use Tailwind classes mapped in `tailwind.config.ts` (e.g., `bg-ebio-green-400`)
- **Never** use hex values directly in component code

## 9. Testing

```bash
# Run all tests
pnpm test

# Run API tests
pnpm --filter=api test

# Run specific module tests
pnpm --filter=api test -- --filter="search"
```

## 10. Common Issues

- **PostGIS not found**: Ensure Docker PostgreSQL image includes PostGIS (`postgis/postgis:16-3.4`)
- **FedaPay webhook not received**: Use `ngrok` to expose localhost for sandbox testing
- **Map tiles not loading**: Verify MapLibre style URL or use local tile server for dev
- **Expo build fails**: Run `npx expo doctor` to check for dependency issues
