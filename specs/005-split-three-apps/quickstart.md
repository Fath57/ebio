# Quickstart — 3 variantes d'app mobile

**Feature**: `005-split-three-apps`

## Lancer une variante en dev

```bash
cd apps/mobile

# Client (défaut si APP_VARIANT absent)
APP_VARIANT=client npx expo start --dev-client

# Fournisseur
APP_VARIANT=supplier npx expo start --dev-client

# Livreur
APP_VARIANT=courier npx expo start --dev-client
```

`app.config.ts` lit `APP_VARIANT` et applique : nom, `android.package`, icône, `googleServicesFile`, entrée de navigation. Scripts npm ajoutés : `dev:client`, `dev:supplier`, `dev:courier`.

## Builds EAS

```bash
# Profils dans eas.json (env APP_VARIANT + package par variante)
eas build --profile production-client --platform android
eas build --profile production-supplier --platform android
eas build --profile production-courier --platform android

eas submit --profile production-supplier --platform android   # après création manuelle de la fiche Play
```

Packages : `com.ebio.mobile` (client, inchangé), `com.ebio.supplier`, `com.ebio.courier`. Credentials EAS distincts par identifiant d'app (keystores gérés par EAS). Premier AAB de chaque nouvelle app : upload manuel dans la Play Console.

## Prérequis externes (une fois)

1. **Firebase** : ajouter 2 apps Android (`com.ebio.supplier`, `com.ebio.courier`) au projet existant → télécharger `google-services.supplier.json` et `google-services.courier.json` dans `apps/mobile/`.
2. **Google Sign-In** : déclarer la SHA-1 (keystore EAS + Play App Signing) de chaque nouvelle app dans la console Google Cloud.
3. **Play Console** : créer les 2 fiches (eBio Fournisseur, eBio Livreur), formulaires Data Safety, test fermé si requis par le type de compte.

## Backend

```bash
cd apps/api
pnpm db:migrate:up          # tables courier_profiles, deliveries, delivery_events + enum COURIER
npx mikro-orm seeder:run --class=RbacSeeder   # rôle COURIER + permissions
pnpm dev
```

Tester le cycle : compte livreur → `POST /api/couriers/register` → approuver via web-spa admin (ou SQL) → passer disponible → fournisseur passe une commande `DELIVERY` à `READY` → offre visible dans `GET /api/deliveries/offers` → accept/pickup/start/complete.

## Vérifications avant commit

```bash
pnpm lint && pnpm typecheck && pnpm test   # racine (hook pre-push)
cd apps/mobile && npm run typecheck        # mobile hors workspace
```
