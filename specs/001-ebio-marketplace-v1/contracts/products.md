# API Contract: Products Module

## GET /suppliers/:supplierId/products
List products for a supplier.

**Query**: `status: 'ACTIVE' | 'OUT_OF_STOCK' | 'HIDDEN'` (optional, default all for owner, ACTIVE only for public)

**Response 200**:
```typescript
z.object({
  products: z.array(productResponseSchema),
})
```

```typescript
const productResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  category: categorySchema,
  description: z.string().nullable(),
  voiceDescriptionUrl: z.string().url().nullable(),
  photos: z.array(z.string().url()).max(3),
  pricePerUnit: z.number(),
  unit: z.enum(['KG', 'LITER', 'SACHET', 'PIECE', 'LOT']),
  stock: z.number(),
  status: z.enum(['ACTIVE', 'OUT_OF_STOCK', 'HIDDEN']),
  promotionalPrice: z.number().nullable(),
  promotionExpiresAt: z.string().datetime().nullable(),
  variants: z.array(variantSchema),
  createdAt: z.string().datetime(),
})
```

---

## POST /suppliers/me/products
Create a product (supplier role).

**Headers**: `Authorization: Bearer <token>`

**Request Body** (multipart/form-data):
```typescript
z.object({
  name: z.string().min(2).max(200),
  categoryId: z.string().uuid(),
  description: z.string().max(500).optional(),
  voiceDescription: z.instanceof(File).optional(), // audio file
  photos: z.array(z.instanceof(File)).min(1).max(3),
  pricePerUnit: z.number().positive(),
  unit: z.enum(['KG', 'LITER', 'SACHET', 'PIECE', 'LOT']),
  stock: z.number().int().min(0),
  stockAlertThreshold: z.number().int().min(0).default(5),
  status: z.enum(['ACTIVE', 'HIDDEN']).default('ACTIVE'),
  variants: z.array(z.object({
    label: z.string(),
    pricePerUnit: z.number().positive(),
    stock: z.number().int().min(0),
  })).optional(),
})
```

**Response 201**: `productResponseSchema`

**Validation**: Rejects if supplier exceeds plan product limit (FREE: 5, ESSENTIAL: 20, PRO/COOPERATIVE: unlimited).

---

## PUT /suppliers/me/products/:id
Update a product.

**Request Body**: Partial of create schema.

**Response 200**: Updated `productResponseSchema`.

---

## PATCH /suppliers/me/products/:id/stock
Quick stock update.

```typescript
z.object({
  stock: z.number().int().min(0),
})
```

**Side effects**:
- If stock drops below `stockAlertThreshold`: push notification to supplier.
- If stock goes from 0 to > 0: push notification to buyers with active `StockAlert`.
- WebSocket event `product:stock-update` broadcast to active search sessions.

---

## DELETE /suppliers/me/products/:id
Soft-delete a product (sets status to HIDDEN).

**Response 204**: No content.

---

## POST /suppliers/me/products/:id/promotion
Set promotional price.

```typescript
z.object({
  promotionalPrice: z.number().positive(),
  expiresAt: z.string().datetime(),
})
```

**Response 200**: Updated `productResponseSchema`.

---

## POST /products/:id/stock-alert
Subscribe to restock notification (buyer).

**Headers**: `Authorization: Bearer <token>`

**Response 201**: `{ subscribed: true }`
