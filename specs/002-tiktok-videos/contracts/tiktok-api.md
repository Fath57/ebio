# Contracts — Endpoints TikTok (Phase 1)

Module `apps/api/src/modules/tiktok/tiktok.controller.ts`. Contrats Zod dans `tiktok.contract.ts` → exposés dans l'OpenAPI. Auth via Better Auth (session fournisseur), CASL pour les routes « me ». Les jetons ne figurent dans **aucune** réponse.

---

## 1. `GET /api/suppliers/me/tiktok/auth-url`

Génère l'URL d'autorisation TikTok pour le fournisseur courant.

- **Auth** : session fournisseur requise.
- **Effet** : génère `state` (anti-CSRF) + `code_verifier`/`code_challenge` (PKCE), stocke `state→{supplierId, code_verifier}` en Redis (TTL ~10 min).
- **200** : `{ authUrl: string }` — URL `https://www.tiktok.com/v2/auth/authorize/?client_key=...&scope=user.info.basic,video.list&response_type=code&redirect_uri=...&state=...&code_challenge=...&code_challenge_method=S256`.
- **403** : non fournisseur.

## 2. `GET /api/tiktok/callback`

Callback de redirection TikTok (déclaré comme redirect URI).

- **Auth** : aucune session (TikTok appelle) — sécurité via `state`.
- **Query** : `code`, `state` (ou `error`).
- **Effet** : valide `state` (Redis) → récupère `supplierId` + `code_verifier` ; échange `code`+`code_verifier` contre les jetons (POST `https://open.tiktokapis.com/v2/oauth/token/` avec client_key/secret) ; chiffre et stocke les jetons + `open_id` + pseudo sur le `Supplier` ; statut `connected`.
- **302** : redirige vers `ebio-mobile://tiktok-connected?status=ok` (ou `...?status=error`).
- **Erreurs** : `state` invalide/expiré → redirige `...?status=error`.

## 3. `GET /api/suppliers/:supplierId/tiktok/videos`

Liste publique des vidéos d'un fournisseur (consommée par les acheteurs).

- **Auth** : publique (ou session acheteur) — ne renvoie que des métadonnées publiques.
- **Effet** : si pas connecté → `{ videos: [] }`. Sinon : sert le cache Redis ; sinon rafraîchit le token si besoin, appelle `video.list` côté serveur, mappe en `TikTokVideo[]`, met en cache (TTL ~15 min).
- **200** : `{ videos: TikTokVideo[] }` (vide si non connecté / aucune vidéo / échec TikTok — **jamais d'erreur 5xx visible** pour ce cas).
- **Dégradation** : échec TikTok + cache présent → renvoie le cache ; sinon `{ videos: [] }`.

## 4. `DELETE /api/suppliers/me/tiktok`

Déconnecte le compte TikTok du fournisseur courant.

- **Auth** : session fournisseur requise.
- **Effet** : (best effort) révoque le token côté TikTok ; remet tous les champs `tiktok*` à `null` ; supprime le cache Redis.
- **204** : succès.

## (Optionnel) `GET /api/suppliers/me/tiktok/status`

Statut de connexion pour l'écran réglages.

- **200** : `{ connected: boolean, username: string | null, status: 'connected'|'expired'|null }`.

---

## Notes de sécurité / conformité

- Échange et refresh des jetons **uniquement côté serveur** (client secret).
- Jetons chiffrés (AES-256-GCM) ; exclus de la sérialisation MikroORM et de tout DTO.
- `state` + PKCE obligatoires sur le flux d'autorisation.
- Aucune URL de fichier MP4 stockée/renvoyée ; uniquement `embed_link`/`cover_image_url`/`share_url`.
- Endpoint `videos` tolérant aux pannes (dégradation propre, FR-010).
