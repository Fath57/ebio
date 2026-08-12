# Quickstart — Intégration vidéos TikTok

## Prérequis externes (Phase 0 — à faire avant le code)

1. Créer un compte **TikTok for Developers** (<https://developers.tiktok.com>) et une **app**.
2. Activer **Login Kit** + **Display API** ; demander les scopes `user.info.basic` et `video.list`.
3. Récupérer **Client key** + **Client secret**.
4. Déclarer la **Redirect URI** : `https://<api>/api/tiktok/callback` (dev sandbox + prod).
5. Renseigner **URL politique de confidentialité** + CGU (requis pour la revue).
6. Activer le **mode sandbox** et ajouter des **utilisateurs de test** (comptes TikTok autorisés).
7. **Vérifier la disponibilité régionale** (Bénin / Afrique de l'Ouest) — bloquant produit.

## Variables d'environnement (apps/api/.env)

```bash
TIKTOK_CLIENT_KEY=...
TIKTOK_CLIENT_SECRET=...
TIKTOK_REDIRECT_URI=https://<api>/api/tiktok/callback
TIKTOK_SCOPES=user.info.basic,video.list
# Clé de chiffrement des jetons (32 octets, base64) :
#   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
TIKTOK_TOKEN_ENC_KEY=...
```

`ebio-mobile://` est déjà le scheme de l'app (app.json) → utilisé pour le retour post-callback.

## Étapes d'implémentation (résumé)

### API (Phase 1)
1. `TokenCryptoService` (AES-256-GCM) dans `common/crypto`.
2. Champs TikTok sur `Supplier` + migration (`pnpm db:migrate:create`, puis `:up`).
3. Module `tiktok` : `tiktok-oauth.service` (auth URL PKCE/state, échange + refresh), `tiktok.service` (video.list + cache Redis), `tiktok.controller` (4 endpoints), contrats Zod.
4. `pnpm generate` pour rafraîchir l'OpenAPI (les endpoints apparaissent ; mobile reste en `apiFetch`).

### Mobile (Phase 2)
1. `npm i expo-web-browser expo-auth-session` (dans `apps/mobile`, hors workspace pnpm).
2. `use-tiktok-connect` : `GET auth-url` → `WebBrowser.openAuthSessionAsync(authUrl, 'ebio-mobile://tiktok-connected')` → au retour, rafraîchir le statut.
3. `tiktok-connect-card` dans les réglages boutique (statut + Connecter/Déconnecter).
4. `tiktok-video-section` (carrousel miniatures) + `tiktok-video-player` (WebView embed modal) sur la fiche boutique, alimentés par `use-tiktok-videos`.

## Test en sandbox

1. API lancée avec les creds sandbox.
2. Connecter un utilisateur TikTok de test depuis les réglages boutique mobile.
3. Vérifier : statut « connecté » + pseudo ; jetons présents et **chiffrés** en base ; aucun jeton dans les réponses réseau (inspecter).
4. Ouvrir la fiche boutique côté acheteur → miniatures chargées (< 2 s en cache chaud) → lecture WebView OK.
5. Déconnecter → vidéos disparaissent, champs `tiktok*` à `null`.

## Définition de « terminé » (v1)

- US1/US2/US3 vérifiées en sandbox ; SC-001..SC-005 satisfaits.
- Privacy policy mise à jour ; revue TikTok soumise (prod = après approbation).
