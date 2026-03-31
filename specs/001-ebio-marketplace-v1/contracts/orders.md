# API Contract: Orders Module

## POST /orders
Create an order (buyer, requires auth).

**Headers**: `Authorization: Bearer <token>`

**Request Body**:
```typescript
z.object({
  supplierId: z.string().uuid(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    variantId: z.string().uuid().optional(),
    quantity: z.number().int().positive(),
  })).min(1),
  pickupMode: z.enum(['ON_SITE', 'DELIVERY']),
  deliveryAddress: z.string().optional(), // required if DELIVERY
  deliverySlot: z.string().datetime().optional(),
  paymentMethod: z.enum(['FEDAPAY', 'CASH_ON_DELIVERY']),
})
```

**Response 201**:
```typescript
orderResponseSchema
```

**Validations**:
- Supplier must be in ORDER mode with ESSENTIAL+ plan.
- All products must be in stock.
- If DELIVERY: buyer location must be within supplier's delivery zone.
- Duplicate order detection: block if identical order within 2 minutes.

---

## GET /orders/:id
Get order details.

**Response 200**:
```typescript
const orderResponseSchema = z.object({
  id: z.string().uuid(),
  orderNumber: z.string(), // human-readable, e.g. "EB-20260323-001"
  supplier: supplierSummarySchema,
  items: z.array(z.object({
    product: productSummarySchema,
    variant: variantSchema.nullable(),
    quantity: z.number(),
    unitPrice: z.number(),
    totalPrice: z.number(),
  })),
  status: orderStatusEnum,
  pickupMode: z.enum(['ON_SITE', 'DELIVERY']),
  deliveryAddress: z.string().nullable(),
  deliverySlot: z.string().datetime().nullable(),
  totalAmount: z.number(),
  commissionAmount: z.number(),
  payment: paymentSummarySchema.nullable(),
  createdAt: z.string().datetime(),
  acceptedAt: z.string().datetime().nullable(),
  deliveredAt: z.string().datetime().nullable(),
  escrowReleasedAt: z.string().datetime().nullable(),
})
```

---

## GET /orders
List orders (buyer or supplier context based on auth role).

**Query**:
```typescript
z.object({
  status: orderStatusEnum.optional(),
  page: z.number().default(1),
  limit: z.number().default(20),
})
```

---

## PATCH /orders/:id/accept
Supplier accepts order.

**Headers**: `Authorization: Bearer <token>` (supplier)

**Response 200**: Updated order with status `ACCEPTED`. Stock auto-decremented.

---

## PATCH /orders/:id/reject
Supplier rejects order.

**Request Body**: `{ reason: z.string() }`

**Response 200**: Order status → `CANCELLED`. Auto-refund if paid via FedaPay.

---

## PATCH /orders/:id/status
Supplier updates order status (PREPARING → READY → IN_DELIVERY).

**Request Body**: `{ status: z.enum(['PREPARING', 'READY', 'IN_DELIVERY']) }`

---

## PATCH /orders/:id/confirm-delivery
Confirm delivery (buyer or supplier).

**Headers**: `Authorization: Bearer <token>`

**Side effects**:
- When both parties confirm: start 48h dispute window.
- After 48h without dispute: auto-release escrow.
- If neither confirms within 7 days: auto-release with reminders at day 3 and 6.

---

## POST /orders/:id/dispute
Open a dispute (buyer, within 48h of delivery confirmation).

**Request Body**:
```typescript
z.object({
  reason: z.string().min(10).max(1000),
})
```

**Response 201**: Dispute created, admin notified, escrow held.

---

## Auto-cancellation rules:
- **Fournisseur no response**: Order auto-cancelled after 24h if not accepted.
- **Payment timeout**: Order cancelled after 30 minutes if FedaPay payment not completed.
