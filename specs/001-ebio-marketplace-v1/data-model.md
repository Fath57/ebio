# Data Model — eBio Marketplace V1

**Stack**: NestJS + MikroORM + PostgreSQL + PostGIS
**Primary keys**: UUID v4 (`gen_random_uuid()`)
**Audit fields**: `createdAt` / `updatedAt` on every entity
**Naming**: PascalCase entities, camelCase fields, kebab-case files
**Validation**: Zod schemas in `.contract.ts` files (not class-validator)
**Reference**: [spec.md](./spec.md)

---

## Entity Relationship Diagram

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                                     USER DOMAIN                                          │
│                                                                                          │
│  ┌──────────┐  1───1  ┌────────────┐  1───*  ┌─────────┐                                │
│  │   User   │────────▶│  Supplier  │────────▶│ Product  │──┐                             │
│  └──────────┘         └────────────┘         └─────────┘  │  1───*  ┌────────────────┐   │
│       │                    │  │                    │       └───────▶│ ProductVariant │   │
│       │                    │  │                    │                └────────────────┘   │
│       │                    │  │  1───*             │                                     │
│       │                    │  └──────▶┌──────────────┐                                   │
│       │                    │          │ DeliveryZone │                                   │
│       │                    │          └──────────────┘                                   │
│       │                    │                                                             │
│       │                    │  1───*  ┌───────┐                                           │
│       │                    └───────▶│ Badge │                                           │
│       │                              └───────┘                                           │
└───────┼──────────────────────────────────────────────────────────────────────────────────┘
        │
        │
┌───────┼──────────────────────────────────────────────────────────────────────────────────┐
│       │                         TRANSACTION DOMAIN                                       │
│       │                                                                                  │
│       │  *───1        *───1                                                              │
│       ├──────────▶┌─────────┐  1───*  ┌───────────┐                                     │
│       │  (buyer)  │  Order  │────────▶│ OrderItem │                                     │
│       │           └─────────┘         └───────────┘                                     │
│       │                │                    │                                            │
│       │                │  1───1             │ *───1 Product                              │
│       │                ▼                    │ *───1 ProductVariant (nullable)             │
│       │           ┌─────────┐                                                            │
│       │           │ Payment │                                                            │
│       │           └─────────┘                                                            │
│       │                │                                                                 │
│       │                │  1───1 (nullable)                                               │
│       │                ▼                                                                 │
│       │           ┌─────────┐                                                            │
│       │           │ Dispute │                                                            │
│       │           └─────────┘                                                            │
└───────┼──────────────────────────────────────────────────────────────────────────────────┘
        │
        │
┌───────┼──────────────────────────────────────────────────────────────────────────────────┐
│       │                        COMMUNICATION DOMAIN                                      │
│       │                                                                                  │
│       │  *───1        *───1 Supplier                                                     │
│       ├──────────▶┌──────────────┐  1───*  ┌─────────┐                                   │
│       │  (buyer)  │ Conversation │────────▶│ Message │                                   │
│       │           └──────────────┘         └─────────┘                                   │
│       │                │                                                                 │
│       │                │ *───1 Order (nullable)                                          │
│       │                                                                                  │
│       │           ┌──────────────┐                                                       │
│       ├──────────▶│ Notification │                                                       │
│       │  1───*    └──────────────┘                                                       │
└───────┼──────────────────────────────────────────────────────────────────────────────────┘
        │
        │
┌───────┼──────────────────────────────────────────────────────────────────────────────────┐
│       │                         REPUTATION DOMAIN                                        │
│       │                                                                                  │
│       │  *───1 (buyer)     *───1 Supplier                                                │
│       ├───────────────────▶┌────────┐                                                    │
│       │                    │ Review │                                                    │
│       │                    └────────┘                                                    │
│       │                                                                                  │
│       │           ┌───────────────┐                                                      │
│       ├──────────▶│ ContentReport │                                                      │
│       │  1───*    └───────────────┘                                                      │
│       │                                                                                  │
│       │           ┌────────────┐                                                         │
│       ├──────────▶│ StockAlert │                                                         │
│       │  1───*    └────────────┘                                                         │
└───────┼──────────────────────────────────────────────────────────────────────────────────┘
        │
        │
┌───────┼──────────────────────────────────────────────────────────────────────────────────┐
│       │                         COMMUNITY DOMAIN                                         │
│       │                                                                                  │
│       │  *───*  ┌─────────────────┐  *───1  ┌────────────────┐                           │
│       ├────────▶│ GroupMembership │────────▶│ CommunityGroup │                           │
│       │         └─────────────────┘         └────────────────┘                           │
│       │                                           │                                      │
│       │  1───*  ┌─────────────┐  *───1            │                                      │
│       ├────────▶│ Publication │───────────────────┘                                      │
│       │         └─────────────┘                                                          │
└───────┼──────────────────────────────────────────────────────────────────────────────────┘
        │
        │
┌───────┼──────────────────────────────────────────────────────────────────────────────────┐
│       │                         TRAINING DOMAIN                                          │
│       │                                                                                  │
│       │  *───*  ┌──────────────────────┐  *───1  ┌─────────────────┐                     │
│       └────────▶│ TrainingCompletion   │────────▶│ TrainingModule  │                     │
│                 └──────────────────────┘         └─────────────────┘                     │
└──────────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                         SUBSCRIPTION DOMAIN                                              │
│                                                                                          │
│  ┌────────────┐  *───1  ┌──────────────────┐                                             │
│  │ Supplier   │◀───────│  Subscription    │                                             │
│  └────────────┘         └──────────────────┘                                             │
│                              │ *───1                                                     │
│                              ▼                                                           │
│                         ┌──────────────────┐                                             │
│                         │ SubscriptionPlan │                                             │
│                         └──────────────────┘                                             │
└──────────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                         REFERENCE DATA                                                   │
│                                                                                          │
│  ┌──────────┐                                                                            │
│  │ Category │  (pre-seeded, referenced by Product.category enum)                         │
│  └──────────┘                                                                            │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Enums

All enums are defined in Zod contract files and exposed via `.meta()` for OpenAPI generation. Entity files reference the inferred types.

```
UserRole          = BUYER | SUPPLIER | ADMIN
SupplierType      = INPUTS | TRANSFORMER
ValidationStatus  = PENDING | VALIDATED | REJECTED | COMPLEMENT_REQUESTED | SUSPENDED
SupplierMode      = CONTACT | ORDER
SubscriptionTier  = FREE | ESSENTIAL | PRO | COOPERATIVE
ProductCategory   = HUILES | CEREALES | LEGUMES | SEMENCES | COMPOST | AUTRES
ProductUnit       = KG | LITER | SACHET | PIECE
ProductStatus     = ACTIVE | OUT_OF_STOCK | HIDDEN
OrderStatus       = PLACED | ACCEPTED | PREPARING | READY | IN_DELIVERY | DELIVERED | CANCELLED | DISPUTED
PickupMode        = ON_SITE | DELIVERY
PaymentOperator   = MTN | MOOV | ORANGE
PaymentStatus     = PENDING | CAPTURED | ESCROW | RELEASED | REFUNDED
DisputeStatus     = OPEN | RESOLVED | REJECTED
MessageType       = TEXT | PHOTO | VOICE | LOCATION
ReviewTransaction = ORDER | CONTACT
BadgeType         = VALIDATED | TOP_SELLER | CERTIFIED_BIO
GroupType         = SECTOR | GEOGRAPHIC
SectorType        = HUILES | CEREALES | LEGUMES | SEMENCES | COMPOST | ELEVAGE
PublicationType   = PRODUCT_ANNOUNCEMENT | TECHNICAL_QUESTION | MARKET_ALERT | TRAINING_SHARE
PublicationStatus = ACTIVE | MODERATED | DELETED
TrainingFormat    = VIDEO | AUDIO | ILLUSTRATED
SubscriptionStat  = ACTIVE | EXPIRED | CANCELLED
ReportTargetType  = PRODUCT | REVIEW | PUBLICATION | MESSAGE
ReportStatus      = PENDING | RESOLVED | DISMISSED
NotificationType  = ORDER_PLACED | ORDER_ACCEPTED | ORDER_READY | ORDER_DELIVERED
                  | ORDER_CANCELLED | PAYMENT_CAPTURED | PAYMENT_RELEASED
                  | DISPUTE_OPENED | DISPUTE_RESOLVED | STOCK_ALERT | RESTOCK_ALERT
                  | VALIDATION_APPROVED | VALIDATION_REJECTED | COMPLEMENT_REQUESTED
                  | NEW_MESSAGE | NEW_REVIEW | BADGE_GRANTED | SUBSCRIPTION_EXPIRING
                  | PROMOTIONAL
NotificationChan  = PUSH | SMS | IN_APP
```

---

## Entity Definitions

### 1. User

The base identity entity for all user types (buyers, suppliers, admins).

| Field            | Type          | Constraints                         | Default              |
|------------------|---------------|-------------------------------------|----------------------|
| id               | uuid          | PK                                  | `gen_random_uuid()`  |
| phone            | string(20)    | UNIQUE, NOT NULL                    |                      |
| name             | string(100)   | NOT NULL                            |                      |
| role             | enum UserRole | NOT NULL                            | `BUYER`              |
| passwordHash     | string        | nullable (required for ADMIN only)  | null                 |
| email            | string(255)   | nullable, UNIQUE (ADMIN only)       | null                 |
| biometricEnabled | boolean       | NOT NULL                            | false                |
| deviceId         | string(255)   | nullable                            | null                 |
| lastLoginAt      | timestamptz   | nullable                            | null                 |
| createdAt        | timestamptz   | NOT NULL                            | `now()`              |
| updatedAt        | timestamptz   | NOT NULL                            | `now()`              |

**Relationships**:
- 1:1 → Supplier (optional, when role includes SUPPLIER)
- 1:N → Order (as buyer)
- 1:N → Review (as buyer)
- 1:N → Conversation (as buyer)
- 1:N → Message (as sender)
- 1:N → GroupMembership
- 1:N → TrainingCompletion
- 1:N → Notification
- 1:N → StockAlert
- 1:N → ContentReport (as reporter)
- 1:N → Publication (as author)

**Indexes**:
- UNIQUE on `phone`
- UNIQUE on `email` (partial — WHERE email IS NOT NULL)
- INDEX on `deviceId` (for multi-account detection queries)
- INDEX on `role`

**Validation rules**:
- `phone`: E.164 format, Benin country code (+229) by default
- `name`: 2–100 characters
- `email`: valid email format (required when role = ADMIN)
- `passwordHash`: required when role = ADMIN
- `deviceId`: populated on mobile login, used by admin fraud detection

**Business logic**:
- A single User can act as both BUYER and SUPPLIER (FR-003b). The `role` field tracks the primary role; the existence of a linked Supplier record enables supplier capabilities.
- Admin users authenticate via email + password + OTP 2FA (FR-005b), not phone OTP.
- The system flags users sharing the same `deviceId` for admin review (FR-038).

---

### 2. Supplier

Extended profile for users who sell products. Linked 1:1 to User.

| Field              | Type               | Constraints                  | Default         |
|--------------------|--------------------|------------------------------|-----------------|
| id                 | uuid               | PK                           | `gen_random_uuid()` |
| user               | uuid FK → User     | UNIQUE, NOT NULL             |                 |
| shopName           | string(150)        | NOT NULL                     |                 |
| type               | enum SupplierType  | NOT NULL                     |                 |
| coverPhoto         | string(500)        | nullable (URL/S3 key)        | null            |
| profilePhoto       | string(500)        | nullable (URL/S3 key)        | null            |
| location           | geometry(Point, 4326) | NOT NULL (PostGIS)        |                 |
| address            | string(300)        | nullable                     | null            |
| neighborhood       | string(150)        | nullable                     | null            |
| mobileMoneyNumber  | string(20)         | NOT NULL                     |                 |
| validationStatus   | enum ValidationStatus | NOT NULL                  | `PENDING`       |
| mode               | enum SupplierMode  | NOT NULL                     | `CONTACT`       |
| subscriptionPlan   | enum SubscriptionTier | NOT NULL                  | `FREE`          |
| openingHours       | jsonb              | nullable                     | null            |
| globalRating       | decimal(3,2)       | NOT NULL                     | 0.00            |
| totalReviews       | integer            | NOT NULL                     | 0               |
| identityDocument   | string(500)        | nullable (S3 key)            | null            |
| businessProof      | string(500)        | nullable (S3 key)            | null            |
| validatedAt        | timestamptz        | nullable                     | null            |
| validatedBy        | uuid FK → User     | nullable (admin ref)         | null            |
| createdAt          | timestamptz        | NOT NULL                     | `now()`         |
| updatedAt          | timestamptz        | NOT NULL                     | `now()`         |

**Relationships**:
- 1:1 → User (owner, ON DELETE CASCADE)
- 1:N → Product (ON DELETE CASCADE)
- 1:N → Order (as supplier)
- 1:N → DeliveryZone (ON DELETE CASCADE)
- 1:N → Badge (ON DELETE CASCADE)
- 1:N → Review (target)
- 1:N → Conversation (as supplier participant)
- 1:N → Subscription (ON DELETE CASCADE)
- N:1 → User as validatedBy (nullable)

**Indexes**:
- UNIQUE on `user`
- **GIST spatial index** on `location` — critical for geo-search (FR-006 through FR-009)
- INDEX on `validationStatus`
- INDEX on `(validationStatus, mode)` — for search filtering
- **Full-text GIN index** on `shopName` — for autocomplete search (FR-006)

**`openingHours` JSON schema**:
```json
{
  "monday":    { "open": "08:00", "close": "18:00" },
  "tuesday":   { "open": "08:00", "close": "18:00" },
  ...
  "sunday":    null
}
```
A `null` value means the supplier is closed that day.

**Validation rules**:
- `shopName`: 2–150 characters, no leading/trailing whitespace
- `mobileMoneyNumber`: valid Benin mobile number
- `location`: valid WGS 84 coordinates within Benin bounding box (approx. lat 6.2–12.5, lon 0.7–3.9)
- `openingHours`: conforms to the JSON schema above, hours in HH:MM 24h format
- `identityDocument`: required for validation submission
- Mode ORDER requires subscription plan ESSENTIAL or higher (FR-055)

**Business logic**:
- Products are invisible in public search until `validationStatus = VALIDATED` (FR-020)
- Supplier can prepare their catalog while PENDING (FR-020)
- `globalRating` is a denormalized cache recalculated on each new review (weighted toward last 90 days — FR-036)
- `totalReviews` is a denormalized counter incremented on review creation

---

### 3. Product

An item listed by a supplier in their catalog.

| Field                | Type              | Constraints             | Default         |
|----------------------|-------------------|-------------------------|-----------------|
| id                   | uuid              | PK                      | `gen_random_uuid()` |
| supplier             | uuid FK → Supplier| NOT NULL                |                 |
| name                 | string(200)       | NOT NULL                |                 |
| category             | enum ProductCategory | NOT NULL             |                 |
| description          | text              | nullable                | null            |
| voiceDescriptionUrl  | string(500)       | nullable (S3 key)       | null            |
| photos               | jsonb             | NOT NULL                | `'[]'`          |
| pricePerUnit         | integer           | NOT NULL (FCFA, stored in integer) |        |
| unit                 | enum ProductUnit  | NOT NULL                |                 |
| status               | enum ProductStatus| NOT NULL                | `ACTIVE`        |
| stock                | integer           | NOT NULL                | 0               |
| stockAlertThreshold  | integer           | nullable                | null            |
| promotionalPrice     | integer           | nullable (FCFA)         | null            |
| promotionExpiresAt   | timestamptz       | nullable                | null            |
| createdAt            | timestamptz       | NOT NULL                | `now()`         |
| updatedAt            | timestamptz       | NOT NULL                | `now()`         |

**Relationships**:
- N:1 → Supplier (ON DELETE CASCADE)
- 1:N → ProductVariant (ON DELETE CASCADE)
- 1:N → OrderItem (as referenced product)
- 1:N → StockAlert (ON DELETE CASCADE)

**Indexes**:
- **Composite index** on `(supplier, category, status)` — main search/filter query
- **Full-text GIN index** on `name` — for autocomplete search (FR-006)
- INDEX on `status` — for filtering active products
- INDEX on `(supplier, status)` — for supplier catalog management

**`photos` JSON schema**:
```json
["s3://bucket/photo1.jpg", "s3://bucket/photo2.jpg"]
```
Maximum 3 entries.

**Validation rules**:
- `name`: 2–200 characters
- `photos`: array of 0–3 valid S3 keys or URLs
- `pricePerUnit`: positive integer (FCFA, no decimals)
- `stock`: non-negative integer
- `stockAlertThreshold`: positive integer when set, must be less than typical stock level
- `promotionalPrice`: must be less than `pricePerUnit` when set
- `promotionExpiresAt`: must be in the future when set; required if `promotionalPrice` is set
- Number of products per supplier is limited by their subscription plan (FREE: 5, ESSENTIAL: 20, PRO: unlimited — FR-053)

**Business logic**:
- When `stock` drops below `stockAlertThreshold`, a push notification is sent to the supplier (FR-018)
- When a product transitions from OUT_OF_STOCK to ACTIVE (restock), all StockAlert subscribers are notified (FR-019)
- Stock is auto-decremented when an order is accepted (not placed) to avoid phantom stock
- Expired promotions are cleaned up by a scheduled job that nullifies `promotionalPrice` and `promotionExpiresAt`

---

### 4. ProductVariant

Alternative packagings or sizes for a product.

| Field        | Type              | Constraints         | Default         |
|--------------|-------------------|---------------------|-----------------|
| id           | uuid              | PK                  | `gen_random_uuid()` |
| product      | uuid FK → Product | NOT NULL            |                 |
| label        | string(50)        | NOT NULL            |                 |
| pricePerUnit | integer           | NOT NULL (FCFA)     |                 |
| stock        | integer           | NOT NULL            | 0               |
| createdAt    | timestamptz       | NOT NULL            | `now()`         |
| updatedAt    | timestamptz       | NOT NULL            | `now()`         |

**Relationships**:
- N:1 → Product (ON DELETE CASCADE)
- 1:N → OrderItem (as referenced variant, nullable on OrderItem side)

**Indexes**:
- INDEX on `product`

**Validation rules**:
- `label`: 1–50 characters (e.g. "0,5L", "1L", "5L", "Sachet 1kg")
- `pricePerUnit`: positive integer
- `stock`: non-negative integer

**Business logic**:
- Variant stock is managed independently from the parent product stock
- When an order references a variant, the variant stock (not the parent product stock) is decremented

---

### 5. Category

Reference table for product categories. Pre-seeded, admin-managed.

| Field     | Type         | Constraints     | Default         |
|-----------|--------------|-----------------|-----------------|
| id        | uuid         | PK              | `gen_random_uuid()` |
| name      | string(100)  | UNIQUE, NOT NULL|                 |
| slug      | string(100)  | UNIQUE, NOT NULL|                 |
| icon      | string(200)  | nullable        | null            |
| sortOrder | integer      | NOT NULL        | 0               |
| createdAt | timestamptz  | NOT NULL        | `now()`         |
| updatedAt | timestamptz  | NOT NULL        | `now()`         |

**Indexes**:
- UNIQUE on `slug`
- INDEX on `sortOrder`

**Pre-seeded data**:

| name      | slug      | sortOrder |
|-----------|-----------|-----------|
| Huiles    | huiles    | 1         |
| Céréales  | cereales  | 2         |
| Légumes   | legumes   | 3         |
| Semences  | semences  | 4         |
| Compost   | compost   | 5         |
| Autres    | autres    | 6         |

**Notes**:
- The `ProductCategory` enum mirrors the Category table slugs. The enum is used on Product for fast filtering; the Category table holds display metadata (icon, sort order).
- Additional categories can be added by admins (FR-042). When a new category is added, the enum must be updated in the contract and a migration must sync the table.

---

### 6. Order

A purchase transaction between a buyer and a single supplier.

| Field                     | Type              | Constraints             | Default         |
|---------------------------|-------------------|-------------------------|-----------------|
| id                        | uuid              | PK                      | `gen_random_uuid()` |
| buyer                     | uuid FK → User    | NOT NULL                |                 |
| supplier                  | uuid FK → Supplier| NOT NULL                |                 |
| status                    | enum OrderStatus  | NOT NULL                | `PLACED`        |
| pickupMode                | enum PickupMode   | NOT NULL                |                 |
| deliveryAddress           | string(500)       | nullable                | null            |
| deliverySlot              | jsonb             | nullable                | null            |
| totalAmount               | integer           | NOT NULL (FCFA)         |                 |
| commissionRate            | decimal(5,4)      | NOT NULL                |                 |
| commissionAmount          | integer           | NOT NULL (FCFA)         |                 |
| deliveryConfirmedByBuyer  | boolean           | NOT NULL                | false           |
| deliveryConfirmedBySupplier | boolean         | NOT NULL                | false           |
| createdAt                 | timestamptz       | NOT NULL                | `now()`         |
| acceptedAt                | timestamptz       | nullable                | null            |
| deliveredAt               | timestamptz       | nullable                | null            |
| escrowReleasedAt          | timestamptz       | nullable                | null            |
| updatedAt                 | timestamptz       | NOT NULL                | `now()`         |

**Relationships**:
- N:1 → User as buyer
- N:1 → Supplier
- 1:N → OrderItem (ON DELETE CASCADE)
- 1:1 → Payment (ON DELETE CASCADE)
- 1:1 → Dispute (nullable, ON DELETE SET NULL)
- 1:N → Conversation (nullable — order-linked conversations)

**Indexes**:
- **INDEX on `(buyer, status)`** — buyer's order history and active orders
- **INDEX on `(supplier, status)`** — supplier's order management dashboard
- INDEX on `createdAt` — for time-based queries and admin reports
- INDEX on `status` — for scheduled job queries (auto-cancel, auto-release)

**`deliverySlot` JSON schema**:
```json
{
  "date": "2026-03-25",
  "startTime": "10:00",
  "endTime": "12:00"
}
```

**Validation rules**:
- `deliveryAddress`: required when `pickupMode = DELIVERY`
- `deliverySlot`: required when `pickupMode = DELIVERY`
- `totalAmount`: positive integer, must equal sum of OrderItem.totalPrice values
- `commissionRate`: determined by the product category (4% alimentaire, 3% intrants, 2.5% semences — FR-054)
- `commissionAmount`: `totalAmount * commissionRate`, rounded to nearest integer

**Business logic**:
- Multi-supplier carts result in one Order per supplier (FR-027)
- If supplier does not respond within 24h of PLACED, order is auto-cancelled and buyer refunded
- Escrow auto-releases 7 days after DELIVERED if neither party disputes (FR-030), with reminders at day 3 and day 6
- Double-order detection: if same buyer + same supplier + same items within 2 minutes, the second order requires explicit confirmation

---

### 7. OrderItem

Line item within an order.

| Field      | Type                    | Constraints     | Default         |
|------------|-------------------------|-----------------|-----------------|
| id         | uuid                    | PK              | `gen_random_uuid()` |
| order      | uuid FK → Order         | NOT NULL        |                 |
| product    | uuid FK → Product       | NOT NULL        |                 |
| variant    | uuid FK → ProductVariant| nullable        | null            |
| quantity   | integer                 | NOT NULL        |                 |
| unitPrice  | integer                 | NOT NULL (FCFA) |                 |
| totalPrice | integer                 | NOT NULL (FCFA) |                 |
| createdAt  | timestamptz             | NOT NULL        | `now()`         |
| updatedAt  | timestamptz             | NOT NULL        | `now()`         |

**Relationships**:
- N:1 → Order (ON DELETE CASCADE)
- N:1 → Product
- N:1 → ProductVariant (nullable)

**Indexes**:
- INDEX on `order`

**Validation rules**:
- `quantity`: positive integer
- `unitPrice`: snapshot of the product/variant price at order time (immutable after creation)
- `totalPrice`: must equal `quantity * unitPrice`
- If `variant` is set, `unitPrice` must match the variant price, not the parent product price

**Business logic**:
- Prices are snapshotted at order creation time and never change, even if the product price changes later
- Stock validation occurs at order acceptance (not placement) to handle race conditions

---

### 8. Payment

Financial transaction linked to an order, processed via FedaPay.

| Field                 | Type               | Constraints       | Default         |
|-----------------------|--------------------|-------------------|-----------------|
| id                    | uuid               | PK                | `gen_random_uuid()` |
| order                 | uuid FK → Order    | UNIQUE, NOT NULL  |                 |
| amount                | integer            | NOT NULL (FCFA)   |                 |
| operator              | enum PaymentOperator | NOT NULL         |                 |
| fedapayTransactionId  | string(255)        | UNIQUE, nullable  | null            |
| status                | enum PaymentStatus | NOT NULL          | `PENDING`       |
| paidAt                | timestamptz        | nullable          | null            |
| releasedAt            | timestamptz        | nullable          | null            |
| receiptUrl            | string(500)        | nullable          | null            |
| createdAt             | timestamptz        | NOT NULL          | `now()`         |
| updatedAt             | timestamptz        | NOT NULL          | `now()`         |

**Relationships**:
- 1:1 → Order (ON DELETE CASCADE)

**Indexes**:
- UNIQUE on `order`
- UNIQUE on `fedapayTransactionId` (partial — WHERE fedapayTransactionId IS NOT NULL)
- INDEX on `status` — for scheduled escrow release jobs

**Validation rules**:
- `amount`: must match the associated Order.totalAmount
- `fedapayTransactionId`: populated after FedaPay callback
- `receiptUrl`: generated after successful payment or release

**Business logic**:
- eBio never stores Mobile Money credentials — PCI compliance is delegated to FedaPay
- Payment timeout: if status remains PENDING for 30 minutes, the order is cancelled automatically
- On RELEASED, the supplier receives `amount - commissionAmount` and eBio retains the commission
- Receipt is auto-generated and sent via WhatsApp/SMS (FR-032)

---

### 9. Dispute

A contestation opened on a delivered order within the 48h dispute window.

| Field       | Type              | Constraints        | Default         |
|-------------|-------------------|--------------------|-----------------|
| id          | uuid              | PK                 | `gen_random_uuid()` |
| order       | uuid FK → Order   | UNIQUE, NOT NULL   |                 |
| openedBy    | uuid FK → User    | NOT NULL           |                 |
| reason      | text              | NOT NULL           |                 |
| status      | enum DisputeStatus| NOT NULL           | `OPEN`          |
| adminNotes  | text              | nullable           | null            |
| resolvedAt  | timestamptz       | nullable           | null            |
| resolvedBy  | uuid FK → User    | nullable (admin)   | null            |
| createdAt   | timestamptz       | NOT NULL           | `now()`         |
| updatedAt   | timestamptz       | NOT NULL           | `now()`         |

**Relationships**:
- 1:1 → Order (ON DELETE CASCADE)
- N:1 → User as openedBy
- N:1 → User as resolvedBy (admin, nullable)

**Indexes**:
- UNIQUE on `order`
- INDEX on `status` — for admin moderation queue

**Validation rules**:
- `reason`: 10–2000 characters
- A dispute can only be opened within 48h of the order reaching DELIVERED status (FR-033)
- Only the buyer or supplier of the order can open a dispute

**Business logic**:
- Opening a dispute sets Order.status to DISPUTED and freezes the escrow
- Resolution by admin either releases funds to supplier (RESOLVED in supplier's favor) or triggers a refund (RESOLVED in buyer's favor)
- After 48h post-delivery with no dispute, funds are eligible for auto-release (the 7-day timer from FR-030 starts at delivery confirmation, not at dispute window close)

---

### 10. Conversation

A chat thread between a buyer and a supplier, optionally linked to an order.

| Field        | Type               | Constraints        | Default         |
|--------------|--------------------|--------------------|-----------------|
| id           | uuid               | PK                 | `gen_random_uuid()` |
| buyer        | uuid FK → User     | NOT NULL           |                 |
| supplier     | uuid FK → Supplier | NOT NULL           |                 |
| order        | uuid FK → Order    | nullable           | null            |
| lastMessageAt| timestamptz        | nullable           | null            |
| archivedAt   | timestamptz        | nullable           | null            |
| createdAt    | timestamptz        | NOT NULL           | `now()`         |
| updatedAt    | timestamptz        | NOT NULL           | `now()`         |

**Relationships**:
- N:1 → User as buyer
- N:1 → Supplier
- N:1 → Order (nullable)
- 1:N → Message (ON DELETE CASCADE)

**Indexes**:
- INDEX on `(buyer, supplier)` — find existing conversation between two parties
- INDEX on `lastMessageAt` — for conversation list ordering
- INDEX on `order` — for order-linked conversation lookup

**Validation rules**:
- A buyer can have at most one active (non-archived) conversation per supplier without an order link
- Order-linked conversations are unique per order

**Business logic**:
- Order-linked conversations are archived 6 months after the last message (FR-025)
- Non-order conversations follow standard data retention policy
- Messages are delivered in real time via WebSockets (FR-021)
- The first message in a contact-mode conversation is pre-filled with a suggested template (FR-023)

---

### 11. Message

An individual message within a conversation.

| Field       | Type             | Constraints        | Default         |
|-------------|------------------|--------------------|-----------------|
| id          | uuid             | PK                 | `gen_random_uuid()` |
| conversation| uuid FK → Conversation | NOT NULL     |                 |
| sender      | uuid FK → User   | NOT NULL           |                 |
| type        | enum MessageType | NOT NULL           |                 |
| content     | text             | nullable           | null            |
| mediaUrl    | string(500)      | nullable           | null            |
| latitude    | decimal(10,7)    | nullable           | null            |
| longitude   | decimal(10,7)    | nullable           | null            |
| readAt      | timestamptz      | nullable           | null            |
| createdAt   | timestamptz      | NOT NULL           | `now()`         |
| updatedAt   | timestamptz      | NOT NULL           | `now()`         |

**Relationships**:
- N:1 → Conversation (ON DELETE CASCADE)
- N:1 → User as sender

**Indexes**:
- **INDEX on `(conversation, createdAt)`** — message history pagination (most recent first)
- INDEX on `sender`

**Validation rules**:
- `content`: required when type = TEXT, nullable otherwise
- `mediaUrl`: required when type = PHOTO or VOICE, nullable otherwise
- `latitude` + `longitude`: both required when type = LOCATION, both nullable otherwise
- `content` max length: 5000 characters

**Business logic**:
- Messages are broadcast via WebSockets in real time (FR-021)
- Read receipts (`readAt`) are updated when the recipient opens the conversation (FR-022)
- Messages are immutable after creation (no edit, no delete by user)

---

### 12. Review

A rating left by a buyer for a supplier after a completed transaction.

| Field               | Type              | Constraints        | Default         |
|---------------------|-------------------|--------------------|-----------------|
| id                  | uuid              | PK                 | `gen_random_uuid()` |
| buyer               | uuid FK → User    | NOT NULL           |                 |
| supplier            | uuid FK → Supplier| NOT NULL           |                 |
| order               | uuid FK → Order   | nullable           | null            |
| transactionType     | enum ReviewTransaction | NOT NULL      |                 |
| qualityRating       | smallint          | NOT NULL           |                 |
| delayRating         | smallint          | NOT NULL           |                 |
| communicationRating | smallint          | NOT NULL           |                 |
| conformityRating    | smallint          | NOT NULL           |                 |
| comment             | text              | nullable           | null            |
| createdAt           | timestamptz       | NOT NULL           | `now()`         |
| updatedAt           | timestamptz       | NOT NULL           | `now()`         |

**Relationships**:
- N:1 → User as buyer
- N:1 → Supplier
- N:1 → Order (nullable — null for CONTACT transaction reviews)

**Indexes**:
- **UNIQUE on `(buyer, order)`** WHERE order IS NOT NULL — one review per buyer per order
- **INDEX on `(supplier, createdAt)`** — for weighted rating calculation (last 90 days)
- INDEX on `supplier` — for supplier profile review listing

**Validation rules**:
- All four rating fields: integer between 1 and 5 inclusive
- `comment`: 0–2000 characters
- `transactionType = ORDER` requires a non-null `order` reference
- `transactionType = CONTACT` requires a null `order` reference
- The buyer must be the actual buyer of the referenced order
- A review can only be created after the order reaches DELIVERED status (or after a contact-mode interaction is declared complete)

**Business logic**:
- On review creation, trigger recalculation of Supplier.globalRating and Supplier.totalReviews
- The weighted rating formula gives 2x weight to reviews from the last 90 days vs older reviews (FR-036)
- Reviews are immutable after creation (no edit, no delete by the reviewer)

---

### 13. Badge

Trust indicators granted to suppliers.

| Field     | Type             | Constraints        | Default         |
|-----------|------------------|--------------------|-----------------|
| id        | uuid             | PK                 | `gen_random_uuid()` |
| supplier  | uuid FK → Supplier | NOT NULL         |                 |
| type      | enum BadgeType   | NOT NULL           |                 |
| grantedAt | timestamptz      | NOT NULL           | `now()`         |
| grantedBy | uuid FK → User   | nullable (admin)   | null            |
| expiresAt | timestamptz      | nullable           | null            |
| createdAt | timestamptz      | NOT NULL           | `now()`         |
| updatedAt | timestamptz      | NOT NULL           | `now()`         |

**Relationships**:
- N:1 → Supplier (ON DELETE CASCADE)
- N:1 → User as grantedBy (nullable — null for system-granted badges like TOP_SELLER)

**Indexes**:
- **UNIQUE on `(supplier, type)`** — one badge of each type per supplier
- INDEX on `expiresAt` — for expiration cleanup jobs

**Validation rules**:
- `type = VALIDATED`: `grantedBy` must be an admin user
- `type = CERTIFIED_BIO`: `grantedBy` must be an admin user
- `type = TOP_SELLER`: `grantedBy` is null (system-assigned), `expiresAt` is set (quarterly recalculation)

**Business logic**:
- **VALIDATED**: granted by admin during supplier validation (FR-037)
- **TOP_SELLER**: auto-granted when supplier has rating >= 4.5 AND >= 20 completed transactions in last 90 days. Recalculated quarterly. `expiresAt` is set to end of current quarter.
- **CERTIFIED_BIO**: granted by admin after validating a bio certification document (FR-037)

---

### 14. CommunityGroup

Community discussion spaces organized by sector or geography.

| Field       | Type              | Constraints        | Default         |
|-------------|-------------------|--------------------|-----------------|
| id          | uuid              | PK                 | `gen_random_uuid()` |
| name        | string(200)       | NOT NULL           |                 |
| type        | enum GroupType    | NOT NULL           |                 |
| sector      | enum SectorType   | nullable           | null            |
| region      | string(100)       | nullable           | null            |
| commune     | string(100)       | nullable           | null            |
| memberCount | integer           | NOT NULL           | 0               |
| createdAt   | timestamptz       | NOT NULL           | `now()`         |
| updatedAt   | timestamptz       | NOT NULL           | `now()`         |

**Relationships**:
- 1:N → GroupMembership (ON DELETE CASCADE)
- 1:N → Publication (ON DELETE CASCADE)

**Indexes**:
- INDEX on `type`
- INDEX on `sector` (partial — WHERE sector IS NOT NULL)
- INDEX on `(region, commune)` — geographic group lookup

**Validation rules**:
- `sector`: required when `type = SECTOR`, null when `type = GEOGRAPHIC`
- `region`: required when `type = GEOGRAPHIC`
- `name`: 2–200 characters

**Business logic**:
- `memberCount` is a denormalized counter updated on join/leave
- Groups are pre-seeded by admin (sector groups for each SectorType, geographic groups per region/commune)

---

### 15. GroupMembership

Join table linking users to community groups.

| Field    | Type              | Constraints         | Default         |
|----------|-------------------|---------------------|-----------------|
| id       | uuid              | PK                  | `gen_random_uuid()` |
| user     | uuid FK → User    | NOT NULL            |                 |
| group    | uuid FK → CommunityGroup | NOT NULL     |                 |
| joinedAt | timestamptz       | NOT NULL            | `now()`         |
| createdAt| timestamptz       | NOT NULL            | `now()`         |
| updatedAt| timestamptz       | NOT NULL            | `now()`         |

**Relationships**:
- N:1 → User (ON DELETE CASCADE)
- N:1 → CommunityGroup (ON DELETE CASCADE)

**Indexes**:
- **UNIQUE on `(user, group)`** — prevents duplicate membership

**Validation rules**:
- A user can join multiple groups
- Duplicate membership is prevented by the unique constraint

**Business logic**:
- On join: increment CommunityGroup.memberCount
- On leave: decrement CommunityGroup.memberCount

---

### 16. Publication

User-generated content within a community group.

| Field       | Type                   | Constraints        | Default         |
|-------------|------------------------|--------------------|-----------------|
| id          | uuid                   | PK                 | `gen_random_uuid()` |
| author      | uuid FK → User         | NOT NULL           |                 |
| group       | uuid FK → CommunityGroup | NOT NULL        |                 |
| type        | enum PublicationType   | NOT NULL           |                 |
| content     | text                   | NOT NULL           |                 |
| mediaUrls   | jsonb                  | NOT NULL           | `'[]'`          |
| reportCount | integer                | NOT NULL           | 0               |
| status      | enum PublicationStatus | NOT NULL           | `ACTIVE`        |
| createdAt   | timestamptz            | NOT NULL           | `now()`         |
| updatedAt   | timestamptz            | NOT NULL           | `now()`         |

**Relationships**:
- N:1 → User as author
- N:1 → CommunityGroup

**Indexes**:
- INDEX on `(group, createdAt DESC)` — feed pagination within a group
- INDEX on `status` — for moderation queries
- INDEX on `author`

**`mediaUrls` JSON schema**:
```json
["s3://bucket/photo1.jpg", "s3://bucket/video1.mp4"]
```

**Validation rules**:
- `content`: 1–5000 characters
- `mediaUrls`: array of 0–5 valid S3 keys
- Author must be a member of the group

**Business logic**:
- `reportCount` is a denormalized counter incremented by ContentReport creation
- When `reportCount` reaches a configurable threshold (default: 3), the publication is auto-set to MODERATED and flagged for admin review
- Social sharing generates a deep link for Facebook, WhatsApp, TikTok (FR-046)

---

### 17. TrainingModule

Educational content managed by the eBio team.

| Field          | Type                | Constraints        | Default         |
|----------------|---------------------|--------------------|-----------------|
| id             | uuid                | PK                 | `gen_random_uuid()` |
| title          | string(200)         | NOT NULL           |                 |
| theme          | string(100)         | NOT NULL           |                 |
| format         | enum TrainingFormat  | NOT NULL           |                 |
| durationSeconds| integer             | NOT NULL           |                 |
| contentUrl     | string(500)         | NOT NULL (S3 key)  |                 |
| thumbnailUrl   | string(500)         | nullable           | null            |
| quizData       | jsonb               | nullable           | null            |
| downloadable   | boolean             | NOT NULL           | true            |
| downloadCount  | integer             | NOT NULL           | 0               |
| createdAt      | timestamptz         | NOT NULL           | `now()`         |
| updatedAt      | timestamptz         | NOT NULL           | `now()`         |

**Relationships**:
- 1:N → TrainingCompletion

**Indexes**:
- INDEX on `theme` — for filtering by thematic
- INDEX on `format`

**`quizData` JSON schema**:
```json
{
  "questions": [
    {
      "id": "q1",
      "text": "Question text",
      "pictogram": "s3://bucket/pictogram.png",
      "options": [
        { "id": "a", "text": "Option A", "pictogram": "s3://..." },
        { "id": "b", "text": "Option B", "pictogram": "s3://..." }
      ],
      "correctOptionId": "a"
    }
  ],
  "passingScore": 80
}
```
Quiz uses pictograms for accessibility (FR-048).

**Validation rules**:
- `title`: 2–200 characters
- `durationSeconds`: positive integer
- `quizData`: must conform to the schema above when present, with at least 1 question

**Business logic**:
- Content is created by the eBio team, not user-generated
- `downloadCount` is incremented when a user downloads for offline access (FR-049)

---

### 18. TrainingCompletion

Tracks a user's completion of a training module.

| Field       | Type                 | Constraints        | Default         |
|-------------|----------------------|--------------------|-----------------|
| id          | uuid                 | PK                 | `gen_random_uuid()` |
| user        | uuid FK → User       | NOT NULL           |                 |
| module      | uuid FK → TrainingModule | NOT NULL       |                 |
| quizScore   | smallint             | nullable           | null            |
| completedAt | timestamptz          | NOT NULL           | `now()`         |
| createdAt   | timestamptz          | NOT NULL           | `now()`         |
| updatedAt   | timestamptz          | NOT NULL           | `now()`         |

**Relationships**:
- N:1 → User (ON DELETE CASCADE)
- N:1 → TrainingModule (ON DELETE CASCADE)

**Indexes**:
- **UNIQUE on `(user, module)`** — one completion record per user per module
- INDEX on `user`

**Validation rules**:
- `quizScore`: 0–100 (percentage), nullable if module has no quiz

**Business logic**:
- A completion badge is granted when quizScore >= the module's `quizData.passingScore` (FR-048)
- Completion records are immutable (a user cannot retake a quiz once passed)

---

### 19. SubscriptionPlan

Reference table defining the available subscription tiers.

| Field               | Type              | Constraints        | Default         |
|---------------------|-------------------|--------------------|-----------------|
| id                  | uuid              | PK                 | `gen_random_uuid()` |
| name                | enum SubscriptionTier | UNIQUE, NOT NULL |               |
| priceMonthly        | integer           | NOT NULL (FCFA)    |                 |
| maxProducts         | integer           | nullable (null = unlimited) | null   |
| orderModeEnabled    | boolean           | NOT NULL           |                 |
| advancedAnalytics   | boolean           | NOT NULL           | false           |
| freeCommissionOrders| integer           | NOT NULL           | 0               |
| maxMembers          | integer           | nullable           | null            |
| createdAt           | timestamptz       | NOT NULL           | `now()`         |
| updatedAt           | timestamptz       | NOT NULL           | `now()`         |

**Relationships**:
- 1:N → Subscription

**Pre-seeded data**:

| name        | priceMonthly | maxProducts | orderMode | analytics | freeCommOrders | maxMembers |
|-------------|-------------|-------------|-----------|-----------|----------------|------------|
| FREE        | 0           | 5           | false     | false     | 0              | null       |
| ESSENTIAL   | 2000        | 20          | true      | false     | 0              | null       |
| PRO         | 5000        | null        | true      | true      | 10             | null       |
| COOPERATIVE | 10000       | null        | true      | true      | 10             | 5          |

**Business logic**:
- Plan limits are enforced at the application level (service layer)
- `freeCommissionOrders`: number of orders per month with 0% commission (PRO/COOPERATIVE benefit)
- `maxMembers`: only relevant for COOPERATIVE plan — allows multiple supplier accounts under one subscription

---

### 20. Subscription

A supplier's active subscription to a plan.

| Field     | Type                   | Constraints        | Default         |
|-----------|------------------------|--------------------|-----------------|
| id        | uuid                   | PK                 | `gen_random_uuid()` |
| supplier  | uuid FK → Supplier     | NOT NULL           |                 |
| plan      | uuid FK → SubscriptionPlan | NOT NULL       |                 |
| startDate | date                   | NOT NULL           |                 |
| endDate   | date                   | NOT NULL           |                 |
| status    | enum SubscriptionStat  | NOT NULL           | `ACTIVE`        |
| paymentId | string(255)            | nullable           | null            |
| createdAt | timestamptz            | NOT NULL           | `now()`         |
| updatedAt | timestamptz            | NOT NULL           | `now()`         |

**Relationships**:
- N:1 → Supplier (ON DELETE CASCADE)
- N:1 → SubscriptionPlan

**Indexes**:
- INDEX on `(supplier, status)` — find active subscription for a supplier
- INDEX on `endDate` — for expiration scheduled jobs

**Validation rules**:
- `endDate` must be after `startDate`
- A supplier can have at most one ACTIVE subscription at a time

**Business logic**:
- When a subscription expires (endDate reached), status transitions to EXPIRED and the supplier's capabilities revert to the FREE plan limits
- A scheduled job checks for expiring subscriptions daily and sends reminders 7 days and 1 day before expiration
- `paymentId` references the FedaPay recurring payment for auto-renewal

---

### 21. DeliveryZone

Geographic areas where a supplier offers delivery, defined as PostGIS polygons.

| Field            | Type                      | Constraints        | Default         |
|------------------|---------------------------|--------------------|-----------------|
| id               | uuid                      | PK                 | `gen_random_uuid()` |
| supplier         | uuid FK → Supplier        | NOT NULL           |                 |
| polygon          | geometry(Polygon, 4326)   | NOT NULL (PostGIS) |                 |
| deliveryFee      | integer                   | NOT NULL (FCFA)    |                 |
| estimatedMinutes | integer                   | NOT NULL           |                 |
| createdAt        | timestamptz               | NOT NULL           | `now()`         |
| updatedAt        | timestamptz               | NOT NULL           | `now()`         |

**Relationships**:
- N:1 → Supplier (ON DELETE CASCADE)

**Indexes**:
- **GIST spatial index on `polygon`** — for `ST_Contains` / `ST_Within` queries to check if a buyer's location falls within a delivery zone
- INDEX on `supplier`

**Validation rules**:
- `polygon`: valid closed polygon in WGS 84 coordinates
- `deliveryFee`: non-negative integer
- `estimatedMinutes`: positive integer

**Business logic**:
- When a buyer at a given lat/lon checks delivery availability, the query runs `ST_Contains(polygon, buyer_point)` against all zones of the relevant supplier
- Only suppliers in ORDER mode with at least one delivery zone offer the DELIVERY pickup option (FR-005)
- Delivery fees are set by the supplier, not calculated dynamically

---

### 22. StockAlert

Buyer subscription to be notified when an out-of-stock product is restocked.

| Field      | Type              | Constraints        | Default         |
|------------|-------------------|--------------------|-----------------|
| id         | uuid              | PK                 | `gen_random_uuid()` |
| buyer      | uuid FK → User    | NOT NULL           |                 |
| product    | uuid FK → Product | NOT NULL           |                 |
| notifiedAt | timestamptz       | nullable           | null            |
| createdAt  | timestamptz       | NOT NULL           | `now()`         |
| updatedAt  | timestamptz       | NOT NULL           | `now()`         |

**Relationships**:
- N:1 → User as buyer (ON DELETE CASCADE)
- N:1 → Product (ON DELETE CASCADE)

**Indexes**:
- **UNIQUE on `(buyer, product)`** — one alert per buyer per product
- INDEX on `(product, notifiedAt)` — find un-notified alerts for a restocked product

**Validation rules**:
- The product must have status OUT_OF_STOCK at the time of alert creation

**Business logic**:
- When a product transitions from OUT_OF_STOCK to ACTIVE, all StockAlerts with `notifiedAt IS NULL` for that product trigger a push notification to the buyer (FR-019)
- After notification, `notifiedAt` is set and the alert is considered consumed
- Consumed alerts are cleaned up by a scheduled job after 30 days

---

### 23. ContentReport

User-submitted reports on inappropriate content.

| Field       | Type                  | Constraints        | Default         |
|-------------|-----------------------|--------------------|-----------------|
| id          | uuid                  | PK                 | `gen_random_uuid()` |
| reporter    | uuid FK → User        | NOT NULL           |                 |
| targetType  | enum ReportTargetType | NOT NULL           |                 |
| targetId    | uuid                  | NOT NULL           |                 |
| reason      | text                  | NOT NULL           |                 |
| status      | enum ReportStatus     | NOT NULL           | `PENDING`       |
| resolvedBy  | uuid FK → User        | nullable (admin)   | null            |
| resolvedAt  | timestamptz           | nullable           | null            |
| createdAt   | timestamptz           | NOT NULL           | `now()`         |
| updatedAt   | timestamptz           | NOT NULL           | `now()`         |

**Relationships**:
- N:1 → User as reporter
- N:1 → User as resolvedBy (nullable, admin)
- Polymorphic reference via `targetType` + `targetId` (no FK constraint — application-level integrity)

**Indexes**:
- INDEX on `(targetType, targetId)` — find all reports for a given content item
- INDEX on `status` — admin moderation queue
- INDEX on `reporter` — detect abuse of reporting system

**Validation rules**:
- `reason`: 10–2000 characters
- `targetId`: must reference an existing entity of the given `targetType`
- A user cannot report the same target more than once

**Notes**:
- The polymorphic `targetType` + `targetId` pattern is used instead of separate FK columns because the same reporting logic applies across four different entity types
- Application code must validate `targetId` existence at creation time

---

### 24. Notification

Notifications delivered to users via multiple channels.

| Field   | Type                  | Constraints        | Default         |
|---------|-----------------------|--------------------|-----------------|
| id      | uuid                  | PK                 | `gen_random_uuid()` |
| user    | uuid FK → User        | NOT NULL           |                 |
| type    | enum NotificationType | NOT NULL           |                 |
| title   | string(200)           | NOT NULL           |                 |
| body    | text                  | NOT NULL           |                 |
| data    | jsonb                 | nullable           | null            |
| readAt  | timestamptz           | nullable           | null            |
| sentAt  | timestamptz           | NOT NULL           | `now()`         |
| channel | enum NotificationChan | NOT NULL           |                 |
| createdAt | timestamptz         | NOT NULL           | `now()`         |
| updatedAt | timestamptz         | NOT NULL           | `now()`         |

**Relationships**:
- N:1 → User (ON DELETE CASCADE)

**Indexes**:
- INDEX on `(user, readAt)` — unread notification count and listing
- INDEX on `(user, sentAt DESC)` — notification history pagination
- INDEX on `type` — for analytics

**`data` JSON schema** (varies by type):
```json
{
  "orderId": "uuid",
  "supplierId": "uuid",
  "productId": "uuid",
  "deepLink": "/orders/uuid"
}
```

**Validation rules**:
- `title`: 1–200 characters
- `body`: 1–1000 characters
- Promotional notifications are limited to 1 per user per week (FR-057)

**Business logic**:
- Notifications can be sent on multiple channels simultaneously (e.g., PUSH + IN_APP)
- Each channel delivery creates a separate Notification record
- SMS is used as fallback when push delivery fails for critical events (order, payment, validation)

---

## State Machines

### Supplier Validation Status

```
                    ┌──────────────────────────────┐
                    │                              │
                    ▼                              │
  ┌─────────┐   validate   ┌───────────┐          │
  │ PENDING │─────────────▶│ VALIDATED │          │
  └─────────┘              └───────────┘          │
       │  ▲                      │                │
       │  │                      │ suspend        │
       │  │ resubmit             ▼                │
       │  │               ┌───────────┐           │
       │  └───────────────│ SUSPENDED │           │
       │                  └───────────┘           │
       │                       ▲                  │
       │  reject               │ suspend          │
       ▼                       │                  │
  ┌──────────┐                 │                  │
  │ REJECTED │─────────────────┘                  │
  └──────────┘                                    │
       │                                          │
       │                                          │
       ▼                                          │
  ┌────────────────────────┐    resubmit          │
  │ COMPLEMENT_REQUESTED   │──────────────────────┘
  └────────────────────────┘
```

**Transitions**:
| From                   | To                     | Trigger                     | Side effects                          |
|------------------------|------------------------|-----------------------------|---------------------------------------|
| PENDING                | VALIDATED              | Admin approves              | Notification SMS, products visible, VALIDATED badge granted |
| PENDING                | REJECTED               | Admin rejects               | Notification SMS with reason          |
| PENDING                | COMPLEMENT_REQUESTED   | Admin requests more info    | Notification SMS with details         |
| COMPLEMENT_REQUESTED   | PENDING                | Supplier resubmits docs     | Re-enters validation queue            |
| VALIDATED              | SUSPENDED              | Admin suspends              | Progressive: ongoing orders honored, new orders blocked, profile hidden |
| REJECTED               | SUSPENDED              | Admin suspends (rare)       | Account locked                        |
| SUSPENDED              | VALIDATED              | Admin reinstates            | Profile visible again                 |

---

### Order Lifecycle

```
  ┌────────┐   accept   ┌──────────┐  start prep  ┌───────────┐
  │ PLACED │───────────▶│ ACCEPTED │─────────────▶│ PREPARING │
  └────────┘            └──────────┘              └───────────┘
       │                                               │
       │ cancel (buyer/timeout)              ready     │
       ▼                                               ▼
  ┌───────────┐                               ┌───────┐
  │ CANCELLED │◀──────────────────────────────│ READY │
  └───────────┘     cancel (supplier)         └───────┘
                                                   │
                                           dispatch│
                                                   ▼
                                          ┌─────────────┐
                                          │ IN_DELIVERY  │
                                          └─────────────┘
                                                   │
                                       both confirm│
                                                   ▼
                                          ┌───────────┐   dispute   ┌──────────┐
                                          │ DELIVERED  │───────────▶│ DISPUTED │
                                          └───────────┘             └──────────┘
                                                │                        │
                                     auto-release│(7 days)       resolve │
                                                ▼                        ▼
                                        [Escrow released]        [Admin decision]
```

**Transitions**:
| From         | To           | Trigger                              | Side effects                              |
|--------------|--------------|--------------------------------------|-------------------------------------------|
| PLACED       | ACCEPTED     | Supplier accepts                     | Stock decremented, buyer notified         |
| PLACED       | CANCELLED    | Buyer cancels / 24h timeout          | Refund if paid, stock unchanged           |
| ACCEPTED     | PREPARING    | Supplier starts preparation          | Buyer notified                            |
| PREPARING    | READY        | Supplier marks ready                 | Buyer notified                            |
| READY        | CANCELLED    | Supplier cancels (exceptional)       | Full refund, stock restored               |
| READY        | IN_DELIVERY  | Supplier dispatches (DELIVERY mode)  | Buyer notified with ETA                   |
| READY        | DELIVERED    | Both confirm pickup (ON_SITE mode)   | Escrow release timer starts               |
| IN_DELIVERY  | DELIVERED    | Both parties confirm delivery        | Escrow release timer starts               |
| DELIVERED    | DISPUTED     | Buyer/supplier opens dispute (48h)   | Escrow frozen, admin notified             |
| DELIVERED    | —            | 7 days pass, no dispute              | Escrow auto-released to supplier          |

**Auto-cancellation rules**:
- PLACED + no supplier response in 24h → CANCELLED + refund
- PLACED + payment PENDING for 30 minutes → CANCELLED

**Escrow release schedule** (after DELIVERED):
- Day 0: delivery confirmed
- Day 3: reminder to both parties if no dispute
- Day 6: final reminder
- Day 7: auto-release if no dispute

---

### Payment Status

```
  ┌─────────┐   FedaPay callback   ┌──────────┐   order accepted   ┌────────┐
  │ PENDING │─────────────────────▶│ CAPTURED │──────────────────▶│ ESCROW │
  └─────────┘                      └──────────┘                   └────────┘
       │                                                               │
       │ timeout (30 min)                              ┌───────────────┤
       ▼                                               │               │
  [Order cancelled]                            release │        refund │
                                                       ▼               ▼
                                              ┌──────────┐     ┌──────────┐
                                              │ RELEASED │     │ REFUNDED │
                                              └──────────┘     └──────────┘
```

**Transitions**:
| From     | To       | Trigger                        | Side effects                    |
|----------|----------|--------------------------------|---------------------------------|
| PENDING  | CAPTURED | FedaPay confirms payment       | Order status → PLACED confirmed |
| PENDING  | —        | 30 min timeout                 | Order cancelled                 |
| CAPTURED | ESCROW   | Order accepted by supplier     | Funds held                      |
| ESCROW   | RELEASED | Delivery confirmed + 7 days    | Supplier paid (minus commission), receipt generated |
| ESCROW   | REFUNDED | Order cancelled / dispute resolved in buyer's favor | Buyer refunded via FedaPay |

---

### Dispute Status

```
  ┌──────┐   admin resolves   ┌──────────┐
  │ OPEN │───────────────────▶│ RESOLVED │
  └──────┘                    └──────────┘
       │
       │   admin rejects
       ▼
  ┌──────────┐
  │ REJECTED │
  └──────────┘
```

**Transitions**:
| From | To       | Trigger         | Side effects                                            |
|------|----------|-----------------|---------------------------------------------------------|
| OPEN | RESOLVED | Admin resolves  | Escrow released or refunded based on admin decision     |
| OPEN | REJECTED | Admin rejects   | Escrow released to supplier, dispute closed             |

---

## Index Summary

| Entity         | Index                                    | Type          | Purpose                                  |
|----------------|------------------------------------------|---------------|------------------------------------------|
| User           | `phone`                                  | UNIQUE B-tree | Login lookup                             |
| User           | `email` (partial, WHERE NOT NULL)        | UNIQUE B-tree | Admin login                              |
| User           | `deviceId`                               | B-tree        | Multi-account fraud detection            |
| Supplier       | `user`                                   | UNIQUE B-tree | 1:1 join with User                       |
| Supplier       | `location`                               | **GIST**      | Geo-search `ST_DWithin` queries          |
| Supplier       | `shopName`                               | **GIN (tsvector)** | Full-text autocomplete             |
| Supplier       | `(validationStatus, mode)`               | B-tree        | Search filtering                         |
| Product        | `(supplier, category, status)`           | Composite B-tree | Main search/filter query              |
| Product        | `name`                                   | **GIN (tsvector)** | Full-text autocomplete             |
| DeliveryZone   | `polygon`                                | **GIST**      | `ST_Contains` delivery check             |
| Order          | `(buyer, status)`                        | Composite B-tree | Buyer order history                   |
| Order          | `(supplier, status)`                     | Composite B-tree | Supplier order management             |
| Review         | `(supplier, createdAt)`                  | Composite B-tree | Weighted rating calculation           |
| Review         | `(buyer, order)` (partial, WHERE order NOT NULL) | UNIQUE B-tree | One review per order          |
| Message        | `(conversation, createdAt)`              | Composite B-tree | Message history pagination            |
| Notification   | `(user, readAt)`                         | Composite B-tree | Unread count                          |
| Badge          | `(supplier, type)`                       | UNIQUE B-tree | One badge per type per supplier          |
| GroupMembership| `(user, group)`                          | UNIQUE B-tree | Prevent duplicate membership             |
| TrainingCompletion | `(user, module)`                     | UNIQUE B-tree | One completion per user per module        |
| StockAlert     | `(buyer, product)`                       | UNIQUE B-tree | One alert per buyer per product          |
| StockAlert     | `(product, notifiedAt)`                  | Composite B-tree | Find un-notified alerts              |
| ContentReport  | `(targetType, targetId)`                 | Composite B-tree | Reports per content item              |
| Subscription   | `(supplier, status)`                     | Composite B-tree | Active subscription lookup            |
| Subscription   | `endDate`                                | B-tree        | Expiration job                           |

---

## PostGIS Usage Notes

The project requires the PostGIS extension enabled on the PostgreSQL database:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

**Spatial columns**:
1. `Supplier.location` — `geometry(Point, 4326)` — stores the supplier's GPS coordinates
2. `DeliveryZone.polygon` — `geometry(Polygon, 4326)` — stores delivery area boundaries

**Common spatial queries**:
- **Find suppliers within radius**: `ST_DWithin(supplier.location, ST_MakePoint(lon, lat)::geography, radius_meters)`
- **Sort by distance**: `ST_Distance(supplier.location::geography, ST_MakePoint(lon, lat)::geography)`
- **Check delivery zone**: `ST_Contains(zone.polygon, ST_MakePoint(lon, lat))`

**SRID 4326** (WGS 84) is used for all spatial data, matching GPS coordinate systems.

---

## MikroORM Implementation Notes

- All entities use `@PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })` for UUID generation at the database level
- Audit fields use `@Property({ onCreate: () => new Date() })` for `createdAt` and `@Property({ onUpdate: () => new Date() })` for `updatedAt`
- PostGIS columns use the `@Property({ type: 'geometry', columnType: 'geometry(Point, 4326)' })` pattern with custom types if needed
- JSON columns use `@Property({ type: 'jsonb' })` for PostgreSQL native JSONB storage
- Enums are defined in contract files (Zod) and referenced by entities via TypeScript union types
- Cascade rules are defined on the owning side of the relationship using `cascade: [Cascade.ALL]` or `cascade: [Cascade.PERSIST, Cascade.REMOVE]` as appropriate
- Indexes are declared using `@Index()` decorators on entity properties or `@Entity({ indexes: [...] })` for composite indexes
