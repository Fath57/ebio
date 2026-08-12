# Research — Intégration vidéos TikTok (Phase 0)

> ⚠️ Les conditions et endpoints de l'API TikTok évoluent fréquemment. Chaque décision marquée **À CONFIRMER** doit être validée sur <https://developers.tiktok.com> avant implémentation. La recherche assistée (Gemini) n'a pas pu être exécutée (quota) — ces décisions s'appuient sur la connaissance des API TikTok Login Kit / Display API et des patterns OAuth standard.

## D1 — Mode de récupération des vidéos

- **Décision** : TikTok **Display API**, scope `video.list`, après autorisation OAuth du fournisseur (Login Kit). Récupération **côté serveur** (proxy), jamais côté client.
- **Rationale** : seule voie légitime d'obtenir les vidéos d'un compte ; ne pas exposer les jetons. Récupération par @pseudo sans OAuth = non permis.
- **Alternatives rejetées** : oEmbed (URLs manuelles, pas de synchro auto) ; scraping (CGU, fragile, risque légal).
- **À CONFIRMER** : nom exact du scope (`video.list`) et de l'endpoint (`/v2/video/list/`), champs disponibles.

## D2 — Flux OAuth (mobile + backend)

- **Décision** : Authorization Code + **PKCE** + `state`. Le mobile ouvre l'URL d'autorisation TikTok via `expo-web-browser` (`openAuthSessionAsync`). TikTok redirige vers un **callback backend** (`/api/tiktok/callback`) qui échange le `code` contre les jetons, lie au fournisseur, puis **redirige vers `ebio-mobile://tiktok-connected`** pour refermer la session in-app.
- **Rationale** : l'échange `code → tokens` utilise le client secret → DOIT être côté serveur. PKCE protège le flux mobile ; `state` empêche le CSRF. Le callback web backend est le mode de redirection le plus robuste et compatible revue TikTok.
- **Alternatives rejetées** : redirection directe vers schéma natif (support variable, secret exposé si échange côté client) ; WebView maison pour l'auth (déconseillé par les fournisseurs OAuth).
- **À CONFIRMER** : TikTok accepte-t-il un schéma custom en redirect, ou exige-t-il une URL https ? (impacte D2 : on part sur https backend).

## D3 — Stockage et chiffrement des jetons

- **Décision** : `access_token` et `refresh_token` chiffrés en base via **AES-256-GCM** (`node:crypto`), clé `TIKTOK_TOKEN_ENC_KEY` (32 octets) en variable d'environnement. Stockage du `iv` + `authTag` avec le ciphertext. Service dédié `TokenCryptoService`.
- **Rationale** : aucun service de chiffrement n'existe encore ; AES-GCM (authentifié) est le standard pour des secrets au repos. Clé hors base.
- **Alternatives rejetées** : stockage en clair (inacceptable) ; KMS externe (surdimensionné pour la v1, ajoutable plus tard).

## D4 — Rafraîchissement des jetons

- **Décision** : `access_token` court (~24 h) rafraîchi **à la demande** (lazy) lors d'un appel `video.list` si expiré ou proche de l'expiration ; le `refresh_token` (plus long) est mis à jour si TikTok en renvoie un nouveau. Échec de refresh → statut `expired`, vidéos masquées, invite à reconnecter.
- **Rationale** : lazy refresh évite un cron pour quelques centaines de comptes et reste simple. 
- **Alternatives rejetées** : cron de refresh proactif (complexité non justifiée à cette échelle ; ajoutable si quotas/erreurs le demandent).

## D5 — Cache de la liste de vidéos

- **Décision** : cache **Redis** par fournisseur, clé `tiktok:videos:{supplierId}`, **TTL ~15 min**. Servir le cache d'abord ; rafraîchir en arrière-plan/à expiration.
- **Rationale** : respecte les quotas TikTok, accélère la fiche boutique (SC-002 < 2 s), et permet la dégradation propre (servir le cache si TikTok échoue).
- **Alternatives rejetées** : appel TikTok à chaque ouverture de fiche (quotas, latence).

## D6 — Lecture des vidéos (mobile)

- **Décision** : afficher les **miniatures** en natif (FlatList horizontale) ; au tap, ouvrir un **modal `react-native-webview`** chargeant l'`embed_link` TikTok (lecteur officiel) ; bouton « Ouvrir dans TikTok » (deep link) en repli. Attribution TikTok visible.
- **Rationale** : `react-native-webview` déjà présent ; conforme (lecteur TikTok, pas de MP4 réhébergé). Pas de feed autoplay natif possible.
- **Alternatives rejetées** : `<Video>` natif avec MP4 (interdit) ; feed agrégé multi-fournisseurs (non fourni par TikTok).

## D7 — Conformité Developer Policy

- **Décision** : ne stocker que des **métadonnées** (id, cover URL, embed_link, share_url, titre, durée) — jamais le fichier. Attribution + lien retour TikTok obligatoires. Politique de confidentialité mise à jour. Révocation = déconnexion + suppression des jetons.
- **À CONFIRMER** : durée de rétention autorisée des métadonnées en cache ; mentions d'attribution exactes exigées par TikTok.

## D8 — Disponibilité régionale (Bénin / Afrique de l'Ouest)

- **Statut** : **NEEDS CLARIFICATION / À CONFIRMER** — vérifier que (a) un compte TikTok for Developers peut être créé et approuvé pour cette région, et (b) que les comptes fournisseurs locaux peuvent autoriser l'app. Risque produit majeur si indisponible.
- **Action** : valider en Phase 0 avant tout développement mobile lourd.

## Dépendances mobiles à ajouter

- `expo-web-browser` (flux OAuth in-app) — **à ajouter**.
- `expo-auth-session` (helpers PKCE/redirect) — **à ajouter** (ou PKCE manuel via `expo-crypto`).
- `react-native-webview` — **présent** (^13.16.1).

## Variables d'environnement (API)

- `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI`, `TIKTOK_TOKEN_ENC_KEY` (32 octets base64), `TIKTOK_SCOPES` (`user.info.basic,video.list`).
