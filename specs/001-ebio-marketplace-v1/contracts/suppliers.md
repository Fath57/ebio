# API Contract: Suppliers Module

## POST /suppliers/register
Register as a supplier (requires authenticated user).

**Headers**: `Authorization: Bearer <token>`

**Request Body** (multipart/form-data):
```typescript
z.object({
  shopName: z.string().min(2).max(100),
  type: z.enum(['INPUTS', 'TRANSFORMER']),
  coverPhoto: z.instanceof(File).optional(),
  profilePhoto: z.instanceof(File).optional(),
  latitude: z.number(),
  longitude: z.number(),
  address: z.string(),
  neighborhood: z.string().optional(),
  mobileMoneyNumber: z.string(),
  identityDocument: z.instanceof(File), // required
  businessProof: z.instanceof(File).optional(),
  mode: z.enum(['CONTACT', 'ORDER']),
  openingHours: openingHoursSchema,
})
```

**Response 201**:
```typescript
supplierResponseSchema // with validationStatus: 'PENDING'
```

---

## GET /suppliers/:id
Get supplier public profile (fiche boutique).

**Response 200**:
```typescript
z.object({
  id: z.string().uuid(),
  shopName: z.string(),
  type: z.enum(['INPUTS', 'TRANSFORMER']),
  coverPhoto: z.string().url().nullable(),
  profilePhoto: z.string().url().nullable(),
  location: z.object({ latitude: z.number(), longitude: z.number() }),
  address: z.string(),
  distance: z.number().optional(), // if requester location provided
  rating: z.number().nullable(),
  reviewCount: z.number(),
  badges: z.array(badgeSchema),
  mode: z.enum(['CONTACT', 'ORDER']),
  openingHours: openingHoursSchema,
  isOpen: z.boolean(),
  products: z.array(productSummarySchema),
})
```

---

## PUT /suppliers/me
Update own supplier profile.

**Headers**: `Authorization: Bearer <token>` (supplier role)

**Request Body**: Partial of register schema (all fields optional).

**Response 200**: Updated `supplierResponseSchema`.

---

## GET /suppliers/me/dashboard
Supplier dashboard summary.

**Headers**: `Authorization: Bearer <token>` (supplier role)

**Response 200**:
```typescript
z.object({
  pendingOrders: z.number(),
  unreadMessages: z.number(),
  criticalStockProducts: z.number(),
  revenueThisMonth: z.number(),
  revenueThisWeek: z.number(),
  pendingEscrow: z.number(),
  averageRating: z.number().nullable(),
  recentReviews: z.array(reviewSummarySchema),
})
```

---

## GET /suppliers/me/analytics
Supplier analytics data.

**Headers**: `Authorization: Bearer <token>` (supplier role)

**Query**: `period: 'week' | 'month' | 'quarter'`

**Response 200**:
```typescript
z.object({
  revenue: z.array(z.object({ date: z.string(), amount: z.number() })),
  topProducts: z.array(z.object({ productId: z.string(), name: z.string(), views: z.number(), orders: z.number() })),
  buyerLocations: z.array(z.object({ latitude: z.number(), longitude: z.number() })),
  rating: z.object({ average: z.number(), total: z.number(), trend: z.number() }),
})
```

---

## POST /suppliers/me/delivery-zones
Create a delivery zone.

**Request Body**:
```typescript
z.object({
  polygon: z.array(z.object({ latitude: z.number(), longitude: z.number() })).min(3),
  deliveryFee: z.number().min(0),
  estimatedMinutes: z.number().min(0),
})
```

**Response 201**: `deliveryZoneSchema`.
