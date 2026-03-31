# Phase 0 Research: eBio Marketplace V1

**Date**: 2026-03-23
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)
**Context**: Benin (West Africa), 2G/3G constraints, French locale, UEMOA zone, 5 000 MAU target

---

## 1. FedaPay Mobile Money Integration

### How FedaPay API Works

FedaPay is a Cotonou-based payment aggregator built specifically for the UEMOA zone (Union Economique et Monetaire Ouest Africaine). It provides a REST API (JSON) with official SDKs for Node.js, PHP, Ruby, and Python.

**Core payment flow for eBio:**

1. **Backend creates a Transaction** via `POST /v1/transactions` with amount (in XOF), description, currency, callback URL, and customer info.
2. FedaPay returns a transaction object with a `token` and a `payment_url`.
3. **Two integration paths:**
   - **Redirect**: send the user to `payment_url` (web checkout page) -- not ideal for mobile.
   - **API-direct (Mobile Money)**: call `PUT /v1/transactions/:id/token` with the mobile money number and operator code to trigger an USSD push directly to the buyer's phone. The buyer confirms via PIN on their phone. This is the path eBio must use.
4. FedaPay sends a **webhook** to the configured endpoint when the transaction status changes.
5. Transaction statuses: `pending` -> `approved` / `declined` / `canceled` / `refunded`.

**Supported operators in Benin:**
- MTN MoMo (dominant market share, ~60%)
- Moov Money (Moov Africa, ~35%)
- Celtiis Money (marginal)

FedaPay also supports operators across the UEMOA zone (Senegal, Togo, Cote d'Ivoire, Mali, Burkina Faso, Niger) which aligns with the V2 expansion roadmap.

### Escrow / Hold Pattern

- **Decision**: eBio must implement its own escrow logic. FedaPay does not provide native escrow or hold functionality.
- **Rationale**: FedaPay processes immediate captures. Once a transaction is `approved`, the funds land in the merchant's FedaPay account. There is no built-in "hold and release" mechanism. eBio must build a two-step pattern:
  1. **Capture**: buyer pays into eBio's FedaPay merchant account (one pooled account).
  2. **Escrow hold**: eBio records the escrowed amount in its database, tied to the order.
  3. **Release**: upon delivery confirmation (+ 48h dispute window), eBio initiates a **Payout** (`POST /v1/payouts`) to the supplier's Mobile Money number, minus the commission.
- **Alternatives considered**:
  - **FedaPay sub-accounts / split payments**: FedaPay does not currently offer split payment or marketplace sub-account features like Stripe Connect.
  - **Third-party escrow (e.g., Escrow.com)**: Not available for Mobile Money in UEMOA. Irrelevant.
  - **Two separate FedaPay transactions (buyer pays, then eBio pays supplier)**: This is effectively what we do, but framed as capture + payout rather than two independent transactions.

### Webhook Flow

FedaPay supports webhook subscriptions configured via the dashboard or API. Key events:

| Event | Use in eBio |
|-------|-------------|
| `transaction.approved` | Mark order as paid, notify supplier, start escrow timer |
| `transaction.declined` | Show payment failure to buyer, allow retry |
| `transaction.canceled` | Handle user-cancelled payment |
| `transaction.refunded` | Confirm refund completion for disputes |
| `payout.completed` | Confirm supplier received funds, close escrow |
| `payout.failed` | Alert admin, retry payout |

**Webhook verification**: FedaPay signs webhooks with a shared secret (HMAC-SHA256). The API backend must verify the signature before processing.

**Implementation notes for eBio:**
- Use a dedicated `/api/webhooks/fedapay` endpoint with raw body parsing (no JSON middleware) to verify the HMAC signature correctly.
- Implement idempotency: store processed webhook event IDs to prevent duplicate processing.
- Use a retry queue (Redis-backed) for failed payout operations.

### Commission Handling at Payout Time

- **Decision**: Deduct commission at payout time, not at capture time.
- **Rationale**: The full amount is captured from the buyer. When releasing funds to the supplier, eBio calculates: `payout_amount = order_total - (order_total * commission_rate) - fedapay_payout_fee`. Commission rates are configurable per category (4% transformed food, 3% organic inputs, 2.5% certified seeds). FedaPay charges its own fee on payouts (typically 1-2% or flat fee per payout) -- this must be factored into the margin calculation.
- **Alternatives considered**:
  - **Charge commission separately**: More complex, confusing for suppliers.
  - **Flat fee instead of percentage**: Does not scale with transaction value; penalizes small transactions.

### Key Risk: FedaPay Payout Delays

FedaPay payouts to Mobile Money can take 24-72h in some cases (network congestion, operator maintenance). eBio must:
- Show suppliers a clear "pending payout" status.
- Implement a payout reconciliation cron job that checks payout statuses daily.
- Provide admin visibility into stuck payouts.

---

## 2. MapLibre GL for React Native with Offline Tiles

### MapLibre GL JS vs MapLibre Native

- **Decision**: Use **MapLibre Native** (via `@maplibre/maplibre-react-native`) for the mobile app.
- **Rationale**: MapLibre GL JS is a web library (WebGL-based). MapLibre Native is the C++/OpenGL-based library for iOS and Android, with React Native bindings. It provides GPU-accelerated rendering, native gesture handling, and offline tile pack support -- all critical for eBio's use case on low-end Android devices over 2G/3G.
- **Alternatives considered**:
  - **MapLibre GL JS in a WebView**: Poor performance on low-end devices, no native offline tile management, poor gesture integration. Rejected.
  - **react-native-maps (Google Maps)**: Requires Google API key with per-request billing, no offline support, proprietary. Rejected.
  - **Mapbox React Native SDK**: Proprietary licensing with per-MAU pricing after 25k. Overkill cost for a Benin startup. MapLibre is the open-source fork. Rejected.

### Best React Native Wrapper Library

- **Decision**: `@maplibre/maplibre-react-native` (official MapLibre React Native package).
- **Rationale**: This is the community-maintained fork of `@rnmapbox/maps` adapted for MapLibre. It supports both iOS and Android, has active development, and provides TypeScript bindings. As of 2025, it is the most actively maintained MapLibre wrapper for React Native.
- **Alternatives considered**:
  - **`@rnmapbox/maps` with MapLibre backend**: The Mapbox RN SDK can technically use MapLibre as a backend, but the configuration is fragile and not officially supported.
  - **Custom native module wrapping MapLibre Native directly**: Too much maintenance burden.

### Offline Tile Downloading and Storage (20km Radius Zones)

MapLibre Native provides an `OfflineManager` API:

```
OfflineManager.createPack({
  name: 'zone-cotonou-centre',
  styleURL: 'https://tiles.example.com/style.json',
  bounds: [[lonMin, latMin], [lonMax, latMax]], // bounding box for ~20km radius
  minZoom: 8,
  maxZoom: 16,
})
```

**Storage estimates for a 20km radius zone:**
- Zoom levels 8-16, raster tiles: ~50-150 MB per zone.
- Zoom levels 8-16, vector tiles (PBF): ~10-30 MB per zone. Vector tiles are strongly preferred.
- eBio should limit offline packs to 2-3 zones per device to avoid storage bloat on entry-level Android devices (16-32 GB).

**Implementation approach:**
- On first launch, prompt user to download their local zone tiles.
- Store packs on device via MapLibre's built-in SQLite-backed tile cache.
- Allow manual deletion and re-download of zones in Settings.
- Show a clear indicator when the map is using cached tiles vs live data.

### OpenStreetMap Tile Sources

- **Decision**: Self-hosted vector tile server using **OpenMapTiles** (or **Protomaps** PMTiles) for production, with a free third-party fallback.
- **Rationale**: Free third-party tile servers (e.g., `https://tile.openstreetmap.org`) have strict usage policies (max 2 requests/second, no bulk downloading for offline use). For offline tile packs and reliable production use, eBio needs its own tile source.
- **Options evaluated**:

| Option | Cost | Offline-friendly | Notes |
|--------|------|------------------|-------|
| **Protomaps PMTiles on Cloudflare R2** | ~$0 (R2 free egress) | Yes (single file) | PMTiles format serves vector tiles from a single static file on R2. No tile server needed. Excellent for eBio's cost constraints. |
| **OpenMapTiles self-hosted (tileserver-gl)** | VPS cost (~$5-10/mo) | Yes | Docker-based, serves MBTiles. More operational overhead. |
| **MapTiler Cloud free tier** | Free up to 100k tiles/mo | Limited | May exceed free tier quickly with offline downloads. |
| **Stadia Maps** | Free tier available | Yes | Good option but proprietary dependency. |

- **Decision**: **Protomaps PMTiles hosted on Cloudflare R2**.
- **Rationale**: Zero egress cost (Cloudflare R2), no tile server to maintain, single-file PMTiles format that can be range-requested. The Benin/West Africa extract from OpenStreetMap is small (~50-200 MB as PMTiles). This can be served directly from R2 with a Cloudflare Worker for range request support, or from a simple static hosting setup.

### Marker Clustering and Custom Markers

MapLibre Native supports:
- **Symbol layers** for custom marker icons (supplier category icons, "Valide eBio" badges).
- **GeoJSON clustering** via the `cluster` property on a GeoJSON source: `{ cluster: true, clusterMaxZoom: 14, clusterRadius: 50 }`.
- Cluster circles with dynamic sizing based on point count.
- Tap-to-expand clusters at zoom thresholds.

**eBio-specific markers:**
- Color-coded by product category (Huiles = gold, Cereales = green, etc.)
- "Valide eBio" badge overlay on verified suppliers.
- Pulsing animation for suppliers with active promotions.
- Mini-card popup on marker tap (name, note, distance, top product + price).

---

## 3. React Native Offline-First Architecture

### Local Storage Comparison

| Criteria | WatermelonDB | expo-sqlite (SQLite) | MMKV |
|----------|-------------|---------------------|------|
| **Type** | Relational ORM over SQLite | Raw SQLite | Key-value store |
| **Query power** | Full SQL via Lazy queries, Observable | Full SQL | Get/Set only |
| **Sync support** | Built-in sync protocol | Manual | Manual |
| **Performance** | Excellent (lazy loading, JSI) | Good | Fastest (JSI, C++) |
| **Expo compat** | Requires dev client (no Expo Go) | Native in Expo SDK 51+ | Requires dev client |
| **Data size** | Large datasets (10k+ records) | Large datasets | Small data (<10MB) |
| **Best for** | Offline-first apps with sync | Custom SQL needs | Auth tokens, settings, small cache |

- **Decision**: **WatermelonDB** for relational data (products, suppliers, orders, messages) + **MMKV** for small key-value data (auth tokens, user preferences, feature flags).
- **Rationale**: WatermelonDB provides the critical combination eBio needs: (1) SQLite-based relational storage for complex queries (e.g., "find cached products in category X within my zone"), (2) built-in sync protocol with pull/push primitives that map well to eBio's server-wins conflict resolution, (3) Observable queries that automatically re-render React components when data changes, (4) lazy loading that keeps memory low on entry-level Android devices. MMKV complements it for fast synchronous reads of small data (JWT tokens, locale, last sync timestamp).
- **Alternatives considered**:
  - **expo-sqlite alone**: Would require building the entire sync protocol from scratch. WatermelonDB's sync adapter saves significant development time.
  - **Realm (MongoDB)**: Heavy SDK, proprietary sync requires MongoDB Atlas (cost + latency from West Africa). Rejected.
  - **RxDB**: Good sync, but heavier memory footprint and less React Native optimization than WatermelonDB.
  - **TanStack Query with persistence**: Good for cache-first patterns but not a true offline database. Cannot handle complex relational queries offline.

### Sync Strategy: Server-Wins Conflict Resolution

- **Decision**: Server-wins strategy using WatermelonDB's sync protocol with timestamp-based change tracking.
- **Rationale**: For eBio, the server is the source of truth for prices, stock levels, order statuses, and supplier profiles. When a buyer goes offline and reconnects, they should see the latest server state, not their stale cache. Server-wins is the simplest correct strategy for a marketplace.

**Sync flow:**

1. **Pull phase**: Client sends `last_pulled_at` timestamp to `GET /api/sync?last_pulled_at=<timestamp>`. Server returns `{ changes: { suppliers: { created: [], updated: [], deleted: [] }, products: { ... }, ... }, timestamp }`.
2. **Push phase**: Client sends locally queued changes to `POST /api/sync`. Server applies them (new orders, new messages, rating submissions).
3. **Conflict resolution**: If a record was modified on both client and server since `last_pulled_at`, the server version wins. The client's local changes are discarded for read-only data (products, suppliers) and merged for user-owned data (draft messages, cart).

**Sync frequency:**
- **Active use**: sync on app foreground + every 5 minutes.
- **Background**: periodic sync every 30 minutes (if device supports background fetch).
- **On action**: immediate sync attempt after placing an order, sending a message, or submitting a rating.

### Queuing Offline Actions for Replay

- **Decision**: Custom action queue stored in WatermelonDB with retry logic.
- **Rationale**: When offline, user actions (place order, send message, submit rating) are stored in a local `pending_actions` table with: `id`, `action_type`, `payload` (JSON), `created_at`, `retry_count`, `status` (pending/synced/failed).

**Replay rules:**
- On reconnection, process the queue in FIFO order.
- If an action fails with a 409 (conflict), mark it as failed and notify the user.
- If an action fails with a 5xx, retry with exponential backoff (max 3 retries).
- Show a persistent banner: "X actions en attente de connexion" with the ability to view and cancel pending actions.

### Expo Compatibility

- **Decision**: Expo **development build** (custom dev client), not Expo Go.
- **Rationale**: WatermelonDB, MMKV, and MapLibre Native all require native modules that are not available in Expo Go. Expo's "development build" workflow (via `expo-dev-client`) allows using native modules while retaining Expo's build tooling (EAS Build), OTA updates, and managed configuration. This is the standard approach for production React Native apps with Expo in 2025+.

---

## 4. WebSocket Architecture with NestJS

### @nestjs/websockets with Socket.IO Adapter

- **Decision**: Use `@nestjs/websockets` with the **Socket.IO adapter** (`@nestjs/platform-socket.io`).
- **Rationale**: Socket.IO provides critical features for eBio's unstable network environment: automatic reconnection with exponential backoff, fallback from WebSocket to HTTP long-polling (essential for 2G connections where WebSocket upgrades may fail), built-in room abstraction, binary data support (for voice note streaming), and acknowledgement callbacks for message delivery confirmation.
- **Alternatives considered**:
  - **Raw WebSocket (`ws` library)**: No automatic reconnection, no rooms, no long-polling fallback. Would require reimplementing all of Socket.IO's reliability features. Rejected.
  - **Server-Sent Events (SSE)**: Unidirectional (server to client only). Chat requires bidirectional communication. Rejected for chat, but could complement for one-way stock update notifications.
  - **GraphQL Subscriptions**: Adds complexity without benefit given that eBio already uses REST/OpenAPI. Rejected.

### Redis Adapter for Multi-Instance Scaling

- **Decision**: Use `@socket.io/redis-adapter` with the existing Redis instance.
- **Rationale**: When eBio scales beyond a single API instance (likely needed before reaching 5000 MAU), Socket.IO connections will be distributed across instances. The Redis adapter ensures that events emitted on one instance are broadcast to clients connected to other instances. Without this, a message sent from supplier A (connected to instance 1) would not reach buyer B (connected to instance 2).

**Configuration:**

```typescript
// In app.module.ts or a dedicated websocket.module.ts
import { createAdapter } from '@socket.io/redis-adapter'
import { createClient } from 'redis'

const pubClient = createClient({ url: process.env.REDIS_URL })
const subClient = pubClient.duplicate()
io.adapter(createAdapter(pubClient, subClient))
```

- **Alternatives considered**:
  - **Redis Streams adapter**: Newer, provides message persistence. Overkill for V1; standard Redis pub/sub is sufficient.
  - **NATS or RabbitMQ adapter**: Additional infrastructure dependency. Redis is already in the stack. Rejected.

### Room-Based Architecture

**Room design for eBio:**

| Room Pattern | Example | Purpose |
|-------------|---------|---------|
| `chat:{conversationId}` | `chat:conv_abc123` | Private conversation between buyer and supplier |
| `orders:{supplierId}` | `orders:sup_xyz` | Real-time order notifications for a supplier |
| `stock:{productId}` | `stock:prod_456` | Live stock updates pushed to buyers viewing a product |
| `zone:{zoneId}` | `zone:cotonou-centre` | Zone-based broadcast (promotions, new suppliers) |
| `user:{userId}` | `user:usr_789` | Personal notifications (order status changes, etc.) |

**Join/leave logic:**
- Users join `user:{userId}` on connection.
- Users join `chat:{conversationId}` when opening a conversation screen.
- Users join `stock:{productId}` when viewing a product detail page.
- Suppliers join `orders:{supplierId}` on login.
- All users join their `zone:{zoneId}` based on location.

### Authentication with JWT over WebSocket

- **Decision**: Authenticate on connection handshake using the JWT access token passed in the `auth` option of the Socket.IO client.
- **Rationale**: The JWT is validated in a NestJS Guard applied to the WebSocket gateway. If the token is expired, the connection is rejected with a `401` error, and the client must refresh the token and reconnect.

```typescript
// Client-side
const socket = io(API_URL, {
  auth: { token: accessToken },
  transports: ['websocket', 'polling'], // fallback to polling on 2G
});

// Server-side guard
@UseGuards(WsJwtGuard)
@SubscribeMessage('chat:send')
handleMessage(@ConnectedSocket() client, @MessageBody() data) { ... }
```

### Reconnection Handling for Unstable 2G/3G

- **Decision**: Aggressive reconnection with exponential backoff, message queue during disconnection, and graceful degradation.
- **Rationale**: In rural Benin, connections drop frequently. The system must not lose messages or state.

**Client-side configuration:**

```typescript
const socket = io(API_URL, {
  reconnection: true,
  reconnectionAttempts: Infinity, // never stop trying
  reconnectionDelay: 1000, // start at 1s
  reconnectionDelayMax: 30000, // cap at 30s
  timeout: 20000, // connection timeout for 2G
  transports: ['websocket', 'polling'], // fallback to long-polling
})
```

**Resilience patterns:**
- **Offline message queue**: Messages typed while offline are queued locally (WatermelonDB `pending_actions` table) and sent on reconnection.
- **Message acknowledgements**: Every sent message expects an `ack` callback. If not received within 10 seconds, the message is re-queued.
- **Sync on reconnect**: On each reconnection, the client requests missed messages since `lastMessageTimestamp` via a REST endpoint (`GET /api/chat/:conversationId/messages?since=<timestamp>`), not via WebSocket, to avoid overwhelming the socket with backfill data.
- **Connection quality indicator**: Show a visual badge (green/yellow/red) based on socket ping latency.

---

## 5. PostGIS Geospatial Queries

### ST_DWithin for Proximity Search (Radius Filtering)

- **Decision**: Use `ST_DWithin` for all proximity-based filtering.
- **Rationale**: `ST_DWithin(geom_a, geom_b, distance_meters)` returns a boolean and can leverage the spatial GIST index for fast filtering. It is the correct function for "find all suppliers within X km" queries because it operates on the index first (bounding box check), then refines with exact geometry.

**Example query for eBio:**

```sql
SELECT s.id, s.name, s.rating,
       ST_Distance(s.location::geography, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography) AS distance_m
FROM suppliers s
JOIN products p ON p.supplier_id = s.id
WHERE s.status = 'active'
  AND s.is_validated = true
  AND ST_DWithin(
    s.location::geography,
    ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
    :radius_meters
  )
  AND p.name ILIKE :search_term
  AND p.stock > 0
ORDER BY distance_m ASC
LIMIT 20 OFFSET :offset;
```

### ST_Distance for Distance Calculation and Sorting

- **Decision**: Use `ST_Distance` with `geography` type (not `geometry`) for accurate meter-based distance on the Earth's surface.
- **Rationale**: Using `geography` type ensures distances are calculated on the WGS84 ellipsoid (in meters), not on a flat plane. At Benin's latitude (~6-12 degrees N), the distortion from flat-plane calculation would be minimal, but using `geography` is the correct default that also works for the V2 multi-country expansion.
- **Alternatives considered**:
  - **`geometry` type with SRID 4326**: Returns distances in degrees, which must be converted to meters manually. Error-prone and unnecessary.
  - **Haversine in application code**: Slower, cannot use database indexes, pulls all data to the app layer. Rejected.

### Spatial Indexing (GIST Index)

- **Decision**: Create a GIST index on the supplier `location` column cast to geography.
- **Rationale**: With 800+ suppliers at M12, unindexed spatial queries would perform a sequential scan. GIST indexes provide O(log n) spatial lookups. Even at 10,000+ suppliers, the GIST index keeps query times under 10ms.

```sql
CREATE INDEX idx_suppliers_location ON suppliers USING GIST (location::geography);
```

**Additional index considerations:**
- Composite index on `(status, is_validated)` filtered by `status = 'active' AND is_validated = true` as a partial index.
- GIN index on product names for text search (`pg_trgm` extension for fuzzy matching in French).
- Consider `unaccent` extension for accent-insensitive search (important for French: "cereale" should match "cereale").

### MikroORM Integration with PostGIS Types

- **Decision**: Use MikroORM's `@Property()` with a custom `PointType` for PostGIS columns, and raw SQL via `QueryBuilder` or `em.execute()` for spatial queries.
- **Rationale**: MikroORM does not have native PostGIS support, but it supports custom types. The spatial queries (with `ST_DWithin`, `ST_Distance`) are best expressed as raw SQL or query builder fragments, not through the ORM's query API.

**Implementation pattern:**

```typescript
// Custom PostGIS Point type for MikroORM
import { EntityProperty, Platform, Type } from '@mikro-orm/core'

export class PointType extends Type<{ lat: number, lng: number }, string> {
  convertToDatabaseValue(value: { lat: number, lng: number }): string {
    return `SRID=4326;POINT(${value.lng} ${value.lat})`
  }

  convertToJavaScriptValue(value: string): { lat: number, lng: number } {
    // Parse WKT or GeoJSON from PostGIS
    const match = value.match(/POINT\(([^ ]+) ([^ ]+)\)/)
    return { lng: Number.parseFloat(match![1]), lat: Number.parseFloat(match![2]) }
  }

  getColumnType(): string {
    return 'geometry(Point, 4326)'
  }
}

// Entity usage
@Entity()
export class Supplier {
  @Property({ type: PointType })
  location!: { lat: number, lng: number }
}
```

**Spatial queries** use `em.getConnection().execute()` or `QueryBuilder.raw()` for the `ST_DWithin`/`ST_Distance` calls, wrapped in a dedicated `SearchRepository` or `GeoService`.

- **Alternatives considered**:
  - **TypeORM with `typeorm-spatial`**: TypeORM has better PostGIS community support, but the project uses MikroORM per the Lonestone boilerplate. Switching ORMs is not justified.
  - **Prisma with PostGIS extensions**: Prisma's PostGIS support is limited and requires raw queries anyway. Same constraint as MikroORM.
  - **Knex.js for spatial queries alongside MikroORM**: Adds a second query layer. Better to use MikroORM's raw query capabilities directly.

---

## 6. SMS OTP Provider for Benin

### Provider Comparison

| Criteria | Africa's Talking | Orange SMS API (Benin) | Twilio |
|----------|-----------------|----------------------|--------|
| **Benin coverage** | Yes (MTN + Moov + all operators) | Orange-only | Yes, but expensive international routing |
| **Pricing (Benin)** | ~15-25 XOF/SMS (~$0.025) | ~10-15 XOF/SMS | ~$0.05-0.08/SMS |
| **API quality** | REST + SDKs (Node.js) | SOAP/REST, less documented | Excellent REST API |
| **Delivery rate** | 90-95% in urban Benin | 95%+ for Orange subscribers | 85-90% (international routing) |
| **Sender ID** | Custom (e.g., "eBio") | "Orange" only | Custom but may be overridden |
| **Latency** | 3-10 seconds | 2-5 seconds | 5-15 seconds (international hop) |
| **Two-way SMS** | Yes (shortcodes available) | Limited | Yes but expensive |
| **Benin presence** | East Africa HQ, but serves West Africa | Native Benin operator | No local presence |

- **Decision**: **Africa's Talking** as primary, with **fallback to a local SMS aggregator** (e.g., TogoCel SMS Gateway or a Benin-local provider like Semoa or Lmt.bj) for resilience.
- **Rationale**: Africa's Talking has the widest operator coverage in Benin (all networks, not just Orange), a well-documented Node.js SDK, competitive pricing, and custom Sender ID support ("eBio" appears as the sender, improving trust). Their delivery rates are sufficient for OTP use cases. The international routing concern with Twilio (higher latency, lower delivery rates in West Africa) rules out Twilio.
- **Alternatives considered**:
  - **Orange SMS API**: Only delivers to Orange subscribers reliably. Would miss 60%+ of the market (MTN users). Rejected as primary.
  - **Twilio**: Premium pricing ($0.05+/SMS), international routing adds latency, delivery rates lower in West Africa due to fewer direct carrier connections. Rejected.
  - **Vonage (Nexmo)**: Similar issues to Twilio for West Africa. Less competitive than Africa's Talking in the region.
  - **Infobip**: Good West Africa coverage but higher pricing tier. Could be a fallback.

### Rate Limiting and Fraud Prevention

**OTP-specific protections for eBio:**

| Protection | Implementation |
|-----------|---------------|
| **Rate limit per phone number** | Max 3 OTP requests per phone number per 15 minutes (Redis counter) |
| **Rate limit per IP** | Max 10 OTP requests per IP per hour |
| **OTP expiry** | 5 minutes (standard) |
| **OTP length** | 6 digits (not 4 -- harder to brute force) |
| **Max verification attempts** | 3 attempts per OTP code, then invalidate and require new OTP |
| **Cooldown after failed attempts** | 15-minute lockout after 5 failed verifications |
| **Device fingerprinting** | Track device ID to detect OTP farming from a single device |
| **Cost alerting** | Alert admin if SMS spend exceeds daily threshold (prevents runaway costs from attacks) |

**Estimated monthly SMS cost at scale:**
- 5 000 MAU, average 1.5 OTP per user per month = 7 500 SMS/month
- At 20 XOF/SMS = 150 000 XOF/month (~$230 USD)

---

## 7. Push Notifications

### Firebase Cloud Messaging for React Native (Expo)

- **Decision**: Use **Firebase Cloud Messaging (FCM)** via `expo-notifications` (Expo's built-in notification module) rather than directly integrating `@react-native-firebase/messaging`.
- **Rationale**: `expo-notifications` provides a unified API for both iOS (APNs) and Android (FCM) with Expo push token management. It integrates seamlessly with Expo's push notification service, which acts as a proxy to FCM/APNs. This simplifies server-side implementation: the NestJS backend sends notifications to Expo's push API (`https://exp.host/--/api/v2/push/send`) rather than managing FCM credentials directly.
- **Alternatives considered**:
  - **Direct FCM via `@react-native-firebase/messaging`**: More control but requires bare workflow configuration, Firebase project setup, and direct FCM server key management. Adds complexity without benefit for V1.
  - **OneSignal**: Third-party service with free tier. Adds vendor dependency. Expo's built-in solution is sufficient.
  - **Notifee (local notifications)**: Complements FCM for local/scheduled notifications but does not replace it for remote push.

### Notification Scheduling and Topic-Based Targeting

**Topic architecture for eBio:**

| Topic | Subscribers | Use Case |
|-------|------------|----------|
| `zone:{zoneId}` | All users in a geographic zone | New supplier in your area, zone-specific promotions |
| `filiere:{categorySlug}` | Users interested in a product category | "New organic oil supplier near you" |
| `zone:{zoneId}:filiere:{categorySlug}` | Intersection of zone + category | Highly targeted promotions |
| `supplier:{supplierId}:followers` | Users who follow a supplier | Stock updates, new products, promotions |
| `orders:{orderId}` | Buyer + supplier for an order | Order status changes |

**Server-side implementation:**
- Use Expo's push API with `to` arrays for targeted pushes and topic subscriptions for broadcast.
- Notification payloads include structured `data` field for deep linking: `{ screen: 'supplier-profile', supplierId: 'xxx' }`.
- Schedule promotional notifications via a cron job (e.g., `@nestjs/schedule` with `@Cron('0 10 * * MON')` for Monday 10am local time).

### Quiet Hours and Rate Limiting

- **Decision**: Enforce quiet hours (21h00 - 07h00 WAT) and max 1 promotional notification per user per week.
- **Rationale**: West African mobile users are sensitive to notification spam, especially on devices where notifications consume data. Excessive notifications lead to app uninstalls.

**Implementation:**
- **Quiet hours**: Notifications generated during quiet hours are stored in a Redis sorted set (scored by scheduled delivery time) and delivered at 07h01 WAT.
- **Rate limiting**: A Redis counter per user tracks promotional notifications sent in the current week. The notification service checks this counter before sending.
- **User preferences**: Allow users to toggle notification categories (orders, promotions, community, stock alerts) in Settings.
- **Critical notifications bypass quiet hours**: Order status changes (accepted, ready, delivered) and security alerts (OTP, suspicious login) are always delivered immediately.

---

## 8. File Storage

### Cloudflare R2 vs MinIO

| Criteria | Cloudflare R2 | MinIO (self-hosted) |
|----------|--------------|-------------------|
| **Egress cost** | $0 (free egress) | VPS bandwidth cost |
| **Storage cost** | $0.015/GB/month | VPS disk cost |
| **CDN** | Built-in (Cloudflare network) | Must configure separately (e.g., Cloudflare CDN in front) |
| **S3 compatibility** | Full S3 API | Full S3 API |
| **Maintenance** | Zero (managed) | Server maintenance required |
| **Latency from Benin** | Good (Cloudflare has African PoPs) | Depends on VPS location |
| **Durability** | 99.999999999% (11 nines) | Depends on configuration |

- **Decision**: **Cloudflare R2** for production. **MinIO** for local development only (already configured in the Lonestone boilerplate's `docker-compose.yml`).
- **Rationale**: R2's zero egress cost is a decisive advantage for a media-heavy marketplace. Product images, supplier photos, training videos, and voice notes all incur download bandwidth. With 5 000 MAU loading multiple images per session, egress costs on AWS S3 or GCS would accumulate quickly. R2 eliminates this concern. The Cloudflare CDN provides fast delivery to West African users via African points of presence (Lagos, Johannesburg, Nairobi -- cached for Cotonou).
- **Alternatives considered**:
  - **AWS S3**: Industry standard but $0.09/GB egress. At scale, egress costs for product images would exceed $50-100/month. Rejected for cost.
  - **MinIO in production**: Requires VPS maintenance, backup strategy, and CDN configuration. More work for less reliability. Rejected for production.
  - **Backblaze B2 + Cloudflare**: Free egress via Cloudflare Bandwidth Alliance. Viable alternative but R2 is simpler (single vendor).
  - **Supabase Storage**: Built on S3, good developer experience, but adds vendor dependency and does not offer free egress.

### Image Compression Strategy (WebP < 200Ko)

- **Decision**: Client-side compression to WebP before upload, with server-side validation.
- **Rationale**: Compressing on the client reduces upload time over 2G/3G (critical for eBio's rural users) and reduces storage costs.

**Client-side (React Native):**
- Use `expo-image-manipulator` to resize and compress images before upload.
- Target: max 1200px on longest edge, WebP format, quality 75%.
- Typical output size: 80-180 KB for product photos.
- Show a compression progress indicator for user feedback.

**Server-side validation:**
- Reject uploads > 500 KB (generous limit to account for complex images).
- Reject non-image MIME types.
- Generate thumbnails on upload (300px width, WebP, quality 60%, ~15-30 KB) for list views using a `sharp`-based processing pipeline.
- Store original + thumbnail in R2 with predictable paths: `products/{productId}/original.webp`, `products/{productId}/thumb.webp`.

**Training video files:**
- Max 60 seconds, compressed to H.264/AAC in MP4 container.
- Target: < 5 MB per video (suitable for 3G download).
- Use `expo-av` for recording, with post-recording compression.

### Signed URL Pattern for Secure Uploads

- **Decision**: Server-generated presigned PUT URLs for direct client-to-R2 uploads.
- **Rationale**: Direct uploads avoid routing binary data through the NestJS API server (which would double bandwidth usage and block the Node.js event loop). The presigned URL pattern is the standard approach for S3-compatible storage.

**Flow:**

1. Mobile app requests an upload URL: `POST /api/files/presign` with `{ fileName, contentType, purpose }`.
2. API validates the request (auth, file type allowed, rate limit), generates a presigned PUT URL via the R2 SDK (`@aws-sdk/s3-request-presigner`), valid for 15 minutes.
3. Mobile app uploads directly to R2 using the presigned URL.
4. Mobile app confirms upload completion: `POST /api/files/confirm` with the file key.
5. API verifies the file exists in R2, validates size/type, generates thumbnail if image, and associates the file with the entity (product, profile, etc.).

**Security considerations:**
- Presigned URLs are scoped to a specific key (path) and content type.
- Max file size enforced via R2 bucket policy.
- File keys include the user ID to prevent unauthorized overwrites: `uploads/{userId}/{uuid}.webp`.
- Confirmed files are moved from `uploads/` to `products/` or `profiles/` prefix.

---

## 9. Authentication Strategy

### Better Auth with Phone/OTP for Mobile Users

- **Decision**: Use **Better Auth** (the library already part of the Lonestone boilerplate's auth module) with a custom **phone/OTP plugin** for mobile authentication.
- **Rationale**: Better Auth is a TypeScript-first authentication library that supports plugins for extending authentication methods. The phone/OTP flow is the primary auth method for eBio (most users in Benin do not have email addresses). Better Auth's session management, CSRF protection, and token handling provide a solid foundation.

**Phone/OTP authentication flow:**

1. User enters phone number on the mobile app.
2. App calls `POST /api/auth/otp/send` with `{ phoneNumber }`.
3. Backend validates phone number format (Benin: +229 followed by 8 digits), generates 6-digit OTP, stores hash in Redis with 5-minute TTL, sends SMS via Africa's Talking.
4. User enters OTP on the mobile app.
5. App calls `POST /api/auth/otp/verify` with `{ phoneNumber, otp }`.
6. Backend verifies OTP hash, creates/retrieves user account, generates JWT access token (15 min) + refresh token (30 days), returns both.
7. Mobile app stores refresh token in MMKV (encrypted storage).

### Email + Password + OTP 2FA for Admin

- **Decision**: Admin users authenticate with email + password, with mandatory OTP-based 2FA.
- **Rationale**: Admin accounts have elevated privileges (supplier validation, payment management, moderation). Email + password is appropriate for web admin users, and 2FA adds security.

**Admin auth flow:**

1. Admin enters email + password on the web-ssr dashboard.
2. Backend validates credentials via Better Auth's email/password provider.
3. Backend generates a TOTP challenge (time-based OTP via an authenticator app like Google Authenticator).
4. Admin enters the 6-digit TOTP code.
5. Backend validates TOTP, issues JWT access token (15 min) + refresh token (7 days).

**Alternative 2FA considered:**
- **SMS OTP for admin**: Less secure (SIM swap attacks). TOTP via authenticator app is more secure.
- **WebAuthn/FIDO2**: Excellent security but complex setup for a small admin team. Can be added in V2.

### JWT with Refresh Token Rotation

- **Decision**: Short-lived access tokens (15 minutes) with rotating refresh tokens (single-use, 30-day expiry for mobile, 7-day for web).
- **Rationale**: Refresh token rotation prevents replay attacks. Each time a refresh token is used to obtain a new access token, the old refresh token is invalidated and a new one is issued. If an attacker steals a refresh token and the legitimate user also uses it, the token reuse is detected and all sessions for that user are invalidated.

**Token storage:**
- **Mobile**: Access token in memory (MMKV for persistence across app restarts), refresh token in MMKV with encryption.
- **Web**: Access token in memory (variable), refresh token in HttpOnly secure cookie.

**Token refresh flow:**
1. API request returns 401 (access token expired).
2. Client interceptor calls `POST /api/auth/refresh` with the refresh token.
3. Backend validates refresh token, checks it has not been used before (stored in Redis), issues new access + refresh tokens, invalidates old refresh token.
4. Client retries the original request with the new access token.
5. If refresh token is also expired or invalid, redirect to login.

### Biometric Unlock (Expo LocalAuthentication)

- **Decision**: Use `expo-local-authentication` for biometric unlock (fingerprint / face recognition) as a convenience feature after initial OTP login.
- **Rationale**: Many Benin users prefer quick app access without re-entering OTP each time. Biometric unlock provides a fast, secure way to resume a session.

**Implementation:**

1. After first successful OTP login, prompt user: "Activer la connexion par empreinte ?"
2. If accepted, store a flag in MMKV. The refresh token remains stored securely.
3. On subsequent app opens, if biometric is enabled and a valid refresh token exists:
   - Prompt biometric authentication via `LocalAuthentication.authenticateAsync()`.
   - On success, use the stored refresh token to obtain a new access token.
   - On failure (3 attempts), fall back to OTP login.
4. Biometric unlock is purely a local gate -- it does not replace server-side authentication. The refresh token is still validated server-side.

- **Alternatives considered**:
  - **Expo SecureStore for token storage**: `expo-secure-store` uses the device keychain (iOS Keychain / Android Keystore). Could be used instead of MMKV for the refresh token. Worth considering as an enhancement, but MMKV with encryption is sufficient for V1.
  - **PIN-based unlock**: Simpler but less convenient than biometric. Could be offered as a fallback for devices without biometric hardware.

---

## 10. React Native Expo Setup

### Expo Managed vs Bare Workflow for MapLibre Compatibility

- **Decision**: **Expo managed workflow with development builds** (via `expo-dev-client` and EAS Build).
- **Rationale**: The modern Expo approach (2024+) eliminates the old managed/bare dichotomy. With "development builds," you create a custom native runtime that includes any native modules (MapLibre, WatermelonDB, MMKV) while still using Expo's tooling for configuration (`app.json`/`app.config.ts`), build (EAS Build), updates (EAS Update), and development (`expo start`). This gives eBio the best of both worlds: native module access + Expo developer experience.

**Key native dependencies requiring a dev build:**
- `@maplibre/maplibre-react-native` -- native map rendering
- `@nozbe/watermelondb` -- native SQLite with JSI bindings
- `react-native-mmkv` -- native key-value storage with JSI
- `expo-local-authentication` -- biometric APIs (included in Expo, no issue)

**EAS Build configuration:**
- Android: produce APK for testing, AAB for Play Store.
- iOS: produce IPA for TestFlight.
- Target APK size: < 30 MB (monitor with `npx expo-optimize` and ProGuard).

- **Alternatives considered**:
  - **Bare workflow**: Full control over native code but loses Expo's managed configuration, OTA updates (EAS Update), and simplified build pipeline. Not worth the tradeoff.
  - **Expo Go**: Cannot include custom native modules (MapLibre, WatermelonDB). Only suitable for prototyping. Rejected for production.
  - **Plain React Native CLI (no Expo)**: Loses all Expo benefits (EAS Build, EAS Update, expo-notifications, expo-image-manipulator, etc.). Rejected.

### expo-google-fonts for Typography

- **Decision**: Use `@expo-google-fonts` packages for the three eBio typefaces.
- **Rationale**: Expo Google Fonts provides pre-packaged font files with `useFonts()` hook for easy loading. No need to manually download and link font files.

**Required packages:**

```bash
npx expo install @expo-google-fonts/dm-serif-display @expo-google-fonts/plus-jakarta-sans @expo-google-fonts/jetbrains-mono expo-font expo-splash-screen
```

**Font usage per eBio design system:**
- **DM Serif Display**: Headings, brand elements, hero text.
- **Plus Jakarta Sans**: Body text, labels, buttons, UI elements (400, 500, 600, 700 weights).
- **JetBrains Mono**: Prices, numerical data, codes, monospaced content.

**Loading pattern:**

```typescript
import { DMSerifDisplay_400Regular, useFonts } from '@expo-google-fonts/dm-serif-display'
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono'
import { PlusJakartaSans_400Regular, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans'
import * as SplashScreen from 'expo-splash-screen'

SplashScreen.preventAutoHideAsync() // Keep splash visible while fonts load

const [fontsLoaded] = useFonts({
  DMSerifDisplay_400Regular,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  JetBrainsMono_400Regular,
})
// Hide splash screen when fontsLoaded === true
```

### expo-av for Audio Recording (Voice Notes)

- **Decision**: Use `expo-av` for recording and playing voice notes in the chat feature.
- **Rationale**: `expo-av` is Expo's built-in audio/video module. It supports recording (with configurable quality, format, and duration limits), playback, and audio interruption handling. No additional native module needed.

**Recording configuration for voice notes:**

```typescript
import { Audio } from 'expo-av'

const recording = new Audio.Recording()
await recording.prepareToRecordAsync({
  android: {
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 22050, // Sufficient for voice
    numberOfChannels: 1, // Mono
    bitRate: 64000, // 64 kbps -- good quality/size tradeoff
  },
  ios: {
    extension: '.m4a',
    audioQuality: Audio.IOSAudioQuality.MEDIUM,
    sampleRate: 22050,
    numberOfChannels: 1,
    bitRate: 64000,
  },
})
```

**Voice note constraints:**
- Max duration: 120 seconds (enforced client-side).
- Typical file size: ~60-120 KB per minute at 64 kbps.
- Upload via presigned URL (same pattern as images).
- Playback with waveform visualization (using `expo-av` position callbacks + custom waveform component).

### expo-file-system for Offline Content Downloads

- **Decision**: Use `expo-file-system` for downloading and managing offline content (training videos, map tiles metadata, cached product images).
- **Rationale**: `expo-file-system` provides file download with progress callbacks (important for showing download progress on slow 2G/3G), file management (delete, check existence, get info), and access to the app's document directory for persistent storage.

**Offline content download strategy:**

```typescript
import * as FileSystem from 'expo-file-system'

async function downloadTrainingVideo(videoId: string, url: string) {
  const fileUri = `${FileSystem.documentDirectory}training/${videoId}.mp4`

  const downloadResumable = FileSystem.createDownloadResumable(
    url,
    fileUri,
    {},
    (downloadProgress) => {
      const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite
      updateDownloadProgress(videoId, progress) // Update UI
    }
  )

  const result = await downloadResumable.downloadAsync()
  return result?.uri
}
```

**Storage management:**
- Track downloaded content sizes in WatermelonDB.
- Show total offline storage usage in Settings.
- Allow selective deletion of downloaded content.
- Warn user when device storage is low (< 500 MB free).
- Auto-cleanup: remove training videos not accessed in 30 days (with user confirmation).

**Offline content types and estimated sizes:**

| Content Type | Storage per Item | Cache Strategy |
|-------------|-----------------|----------------|
| Map tile packs (20km zone) | 10-30 MB (vector) | Manual download, persist until deleted |
| Training videos (60s) | 3-5 MB | Manual download, auto-cleanup after 30 days |
| Product images (cached) | 15-30 KB (thumbnails) | LRU cache, max 100 MB total |
| Voice notes (chat) | 60-120 KB | Persist for conversation lifetime |
| Supplier profiles (offline) | ~2 KB each (JSON) | WatermelonDB sync, always cached |
| Product catalog (offline) | ~1 KB each (JSON) | WatermelonDB sync, always cached |

**Total estimated offline storage per user: 50-200 MB** (depending on number of downloaded zones and training videos).

---

## Summary of Key Decisions

| Topic | Decision | Key Rationale |
|-------|----------|---------------|
| Payment | FedaPay with custom escrow (capture + payout) | Only UEMOA-native Mobile Money aggregator; no native escrow, so eBio builds it |
| Maps | MapLibre Native via `@maplibre/maplibre-react-native` + Protomaps PMTiles on R2 | Free, offline-capable, zero egress tile serving |
| Offline storage | WatermelonDB + MMKV | Built-in sync protocol + fast key-value store; server-wins conflict resolution |
| WebSockets | Socket.IO on NestJS + Redis adapter | Long-polling fallback for 2G, room-based architecture, multi-instance ready |
| Geospatial | PostGIS with ST_DWithin + GIST index | Sub-10ms proximity queries at 800+ suppliers |
| SMS OTP | Africa's Talking | Best Benin operator coverage, competitive pricing, Node.js SDK |
| Push notifications | FCM via expo-notifications | Unified iOS/Android API, Expo-native integration |
| File storage | Cloudflare R2 (prod) + MinIO (dev) | Zero egress cost, African CDN PoPs |
| Auth | Better Auth + phone/OTP + JWT rotation + biometric | Phone-first auth for Benin users, refresh token rotation for security |
| Expo setup | Managed workflow with dev builds (EAS) | Native module support + Expo tooling benefits |

---

## Open Questions for Client Validation

1. **FedaPay payout frequency**: Should suppliers receive payouts per-order or in daily/weekly batches? Per-order is simpler but incurs more FedaPay payout fees. Batching reduces fees but delays supplier cash flow.
2. **Offline scope**: Which actions should be blocked offline (ordering, payments) vs. queued (messages, ratings)? Current assumption: payments are blocked, messages and ratings are queued.
3. **Map tile coverage**: Should eBio pre-generate tile packs for all Benin departments, or let users download zones on demand? On-demand saves server storage but requires initial connectivity.
4. **SMS provider contract**: Africa's Talking requires a business account and may require local entity registration for custom Sender ID in Benin. Need to verify timeline for account setup.
5. **Training video hosting**: Should training videos be stored on R2 (cost-effective) or streamed from YouTube/Vimeo (offloads bandwidth but requires connectivity)? Current decision: R2 for offline-first alignment.
