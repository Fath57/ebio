# Implementation Plan: Intégration des vidéos TikTok des fournisseurs

**Branch**: `002-tiktok-videos` | **Date**: 2026-06-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-tiktok-videos/spec.md`

## Summary

Permettre aux fournisseurs de lier leur compte TikTok (OAuth Login Kit) depuis les réglages boutique, puis afficher leurs vidéos publiques (TikTok Display API `video.list`) sur la fiche boutique côté acheteur, avec lecture via le lecteur intégré TikTok en WebView. Le backend NestJS détient les jetons (chiffrés AES-GCM), les rafraîchit, et expose la liste de vidéos en **proxy** (les jetons ne quittent jamais le serveur). Aucun fichier vidéo n'est réhébergé (conformité TikTok). Le mobile (Expo) gère le flux OAuth (PKCE + retour `ebio-mobile://`) et l'affichage.

## Technical Context

**Language/Version**: TypeScript strict, Node.js 24.13.0
**Primary Dependencies**: API — NestJS, MikroORM 6, Zod (contrats), Redis (cache), `node:crypto` (AES-256-GCM). Mobile — React Native/Expo, `react-native-webview` (présent), `expo-web-browser` + `expo-auth-session` (à ajouter), `expo-crypto` (PKCE, à confirmer).
**Storage**: PostgreSQL (champs TikTok sur `Supplier`) ; Redis (cache liste vidéos, TTL court).
**Testing**: API — tests existants NestJS ; Mobile — vérif lint/typecheck (pas de suite e2e mobile).
**Target Platform**: API (Dokku/Linux) + Mobile (Android Play Store en priorité, iOS).
**Project Type**: Mobile + API (monorepo).
**Performance Goals**: miniatures < 2 s (cache chaud) ; flux connexion < 60 s.
**Constraints**: Jetons chiffrés au repos, jamais exposés client ; pas de réhébergement MP4 ; dégradation propre sur échec TikTok ; quotas TikTok respectés via cache.
**Scale/Scope**: 1 nouvelle relation (connexion TikTok) ; 4 endpoints ; 2 écrans mobiles impactés (réglages boutique, fiche boutique) ; ~quelques centaines de fournisseurs.

**NEEDS CLARIFICATION** (voir research.md) :
- Disponibilité régionale (Bénin) du TikTok Login/Display API.
- Noms/scopes exacts et endpoints à jour (`video.list` vs `video.query`) — à confirmer sur le portail.
- Stratégie de redirection mobile : callback web backend qui deep-link vers l'app, vs schéma natif direct.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Design System Compliance** — ✅ Nouvelle UI (bouton « Connecter », section Vidéos) via tokens `theme.ts`, composants existants (`ScreenHeader`, cartes). Aucune couleur arbitraire.
- **II. Brand Consistency** — ✅ Vocabulaire « Fournisseur », « Fiche boutique » ; FR avec accents ; vouvoiement. « TikTok » conservé tel quel (marque tierce).
- **III. Monorepo Architecture** — ⚠️ **Déviation justifiée** : la constitution exige que le frontend consomme le SDK OpenAPI généré. Le mobile eBio utilise déjà `apiFetch` (raw) partout (hors workspace pnpm). Les nouveaux endpoints seront **définis en contrats Zod → exposés dans l'OpenAPI** ; le mobile les appellera via `apiFetch` selon son pattern établi. → voir Complexity Tracking.
- **IV. Accessibility First** — ✅ Cibles 44px (bouton connexion, miniatures), `accessibilityLabel` FR sur miniatures/lecteur, pas d'info par couleur seule, attribution TikTok textuelle.
- **V. TypeScript Strict** — ✅ DTO/contrats Zod typés runtime ; service TikTok typé ; pas de `any` hors frontière validée (réponse TikTok mappée puis typée).
- **VI. Token-Based Styling** — ✅ Styles via `theme.ts`, pas de hex en dur hors fichiers de tokens.

**Verdict**: PASS (1 déviation documentée, cohérente avec l'app mobile existante).

## Project Structure

### Documentation (this feature)

```text
specs/002-tiktok-videos/
├── plan.md              # Ce fichier
├── research.md          # Phase 0 — décisions OAuth, chiffrement, cache, lecture, conformité
├── data-model.md        # Phase 1 — champs TikTok sur Supplier + forme des métadonnées vidéo
├── quickstart.md        # Phase 1 — setup TikTok dev + env + étapes de test sandbox
├── contracts/           # Phase 1 — contrats des 4 endpoints
└── tasks.md             # Phase 2 (/speckit.tasks — NON créé ici)
```

### Source Code (repository root)

```text
apps/api/src/modules/
├── suppliers/
│   └── supplier.entity.ts                 # + champs TikTok (open_id, tokens chiffrés, expirations, pseudo, dates)
├── tiktok/                                # NOUVEAU module
│   ├── tiktok.module.ts
│   ├── tiktok.controller.ts               # 4 endpoints REST
│   ├── tiktok.service.ts                  # video.list + cache Redis + orchestration
│   ├── tiktok-oauth.service.ts            # auth URL (PKCE/state), échange/refresh jetons
│   └── contracts/tiktok.contract.ts       # schémas Zod (réponses, params)
└── common/crypto/
    └── token-crypto.service.ts            # NOUVEAU — AES-256-GCM (chiffre/déchiffre jetons)

apps/api/src/migrations/                   # migration MikroORM pour les champs TikTok

apps/mobile/src/features/
├── supplier-dashboard/components/
│   └── (tiktok-connect-card.tsx)          # bouton Connecter/Déconnecter + statut, monté dans les réglages
├── supplier-profile/components/
│   └── supplier-profile-screen.tsx        # + section « Vidéos »
└── tiktok/                                # NOUVEAU feature mobile
    ├── components/
    │   ├── tiktok-video-section.tsx       # carrousel de miniatures
    │   └── tiktok-video-player.tsx        # WebView embed (modal) + attribution
    ├── hooks/
    │   ├── use-tiktok-connect.ts          # flux OAuth (expo-web-browser, PKCE, deep link)
    │   └── use-tiktok-videos.ts           # fetch /suppliers/:id/tiktok/videos
    └── utils/tiktok-queries.ts            # (optionnel)
```

**Structure Decision**: Mobile + API (monorepo). Nouveau **module API `tiktok`** isolé (OAuth + proxy vidéos), service de chiffrement dans `common/crypto`, champs ajoutés à l'entité `Supplier` existante (relation 1–1). Nouveau **feature mobile `tiktok`** réutilisé par les réglages boutique (connexion) et la fiche boutique (affichage), par composition — aucun écran réécrit.

## Phases

- **Phase 0 (externe, toi)** : compte TikTok for Developers, app (Login Kit + Display API), client key/secret, redirect URI, accès sandbox + utilisateurs test, URLs privacy/CGU. → débloque tout le reste.
- **Phase 1 (API)** : `TokenCryptoService` ; champs TikTok sur `Supplier` + migration ; module `tiktok` (auth-url, callback, refresh, `video.list` proxy + cache Redis) ; contrats Zod. Testable en sandbox via curl/SDK.
- **Phase 2 (Mobile)** : deps `expo-web-browser`/`expo-auth-session` ; `tiktok-connect-card` dans les réglages ; section « Vidéos » + lecteur WebView sur la fiche boutique.
- **Phase 3 (prod)** : soumission revue TikTok, mise à jour privacy policy, bascule prod (creds production), build EAS.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| Mobile appelle l'API en `apiFetch` (raw) au lieu du SDK OpenAPI généré | Toute l'app mobile suit ce pattern (hors workspace pnpm, npm + legacy-peer-deps) ; les endpoints restent décrits en contrats Zod → présents dans l'OpenAPI | Imposer le SDK généré au seul module TikTok créerait une incohérence avec tout le code mobile existant et un coût d'intégration du générateur hors workspace |
| Champs TikTok directement sur `Supplier` (pas de table dédiée) | Relation 1–1 (un fournisseur = un compte TikTok), pas de cardinalité multiple | Une table `tiktok_connections` séparée ajouterait une jointure sans bénéfice pour un 1–1 ; à reconsidérer si multi-comptes |
