# Data Model — Intégration vidéos TikTok (Phase 1)

## Entité modifiée : `Supplier` (champs TikTok, relation 1–1)

Ajout de champs sur l'entité existante `apps/api/src/modules/suppliers/supplier.entity.ts`. Tous nullable (un fournisseur sans TikTok n'a rien).

| Champ | Type | Notes |
|------|------|------|
| `tiktokOpenId` | `string \| null` | Identifiant ouvert TikTok du compte. Unique. Présent ⇒ connecté. |
| `tiktokUsername` | `string \| null` | Pseudo affiché (ex. `@ferme_bio`), pour l'UI. |
| `tiktokAccessToken` | `string \| null` | **Chiffré** (AES-256-GCM, format `iv:authTag:ciphertext` base64). Jamais sérialisé vers le client. |
| `tiktokRefreshToken` | `string \| null` | **Chiffré**. Jamais sérialisé. |
| `tiktokAccessExpiresAt` | `Date \| null` | Expiration de l'access token. |
| `tiktokRefreshExpiresAt` | `Date \| null` | Expiration du refresh token. |
| `tiktokConnectedAt` | `Date \| null` | Date de la connexion. |
| `tiktokStatus` | `'connected' \| 'expired' \| null` | État dérivé/persisté ; `expired` après échec de refresh. |

**Règles de validation / invariants** :
- Les champs `tiktok*Token` MUST être chiffrés au repos et exclus de toute réponse API (sérialisation : marquer `hidden`/`lazy` MikroORM + ne jamais les mapper dans un DTO).
- `tiktokOpenId` unique (un compte TikTok = un fournisseur).
- Déconnexion ⇒ tous les champs `tiktok*` remis à `null`.

**Transitions d'état** :
```
(aucun)  --connect OAuth-->  connected
connected --refresh OK-->     connected
connected --refresh KO-->     expired
expired   --reconnect-->      connected
connected --disconnect-->     (aucun)
expired   --disconnect-->     (aucun)
```

**Migration** : `pnpm db:migrate:create` → ajoute les 8 colonnes (nullable) + index unique sur `tiktok_open_id`.

## Objet transient : `TikTokVideo` (non persisté durablement, cache Redis only)

Forme renvoyée par l'endpoint vidéos (mappée depuis la réponse `video.list`) :

| Champ | Type | Source TikTok |
|------|------|---------------|
| `id` | `string` | `id` |
| `coverImageUrl` | `string` | `cover_image_url` |
| `embedLink` | `string` | `embed_link` |
| `shareUrl` | `string` | `share_url` |
| `title` | `string` | `title` (ou `video_description`) |
| `durationSec` | `number` | `duration` |

- **Cache** : Redis `tiktok:videos:{supplierId}`, TTL ~15 min, valeur = `TikTokVideo[]`.
- **Jamais** de champ contenant l'URL de téléchargement du MP4 (interdit).

## Schémas de réponse (Zod, exposés OpenAPI)

```ts
// tiktok.contract.ts (extrait)
tiktokStatusResponse = z.object({
  connected: z.boolean(),
  username: z.string().nullable(),
  status: z.enum(['connected', 'expired']).nullable(),
})

tiktokVideo = z.object({
  id: z.string(),
  coverImageUrl: z.string(),
  embedLink: z.string(),
  shareUrl: z.string(),
  title: z.string(),
  durationSec: z.number(),
})

tiktokVideosResponse = z.object({ videos: z.array(tiktokVideo) })

tiktokAuthUrlResponse = z.object({ authUrl: z.string() })
```

> Aucun de ces schémas n'expose de jeton.
