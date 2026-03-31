# API Contract: Admin Module

All endpoints require `Authorization: Bearer <token>` with admin role.

## GET /admin/dashboard
Platform KPIs.

**Response 200**:
```typescript
z.object({
  activeUsers: z.number(),
  activeBuyers: z.number(),
  activeSuppliers: z.number(),
  searchesToday: z.number(),
  transactionsThisMonth: z.number(),
  revenueThisMonth: z.number(), // total platform revenue (commissions)
  averageRating: z.number(),
  pendingValidations: z.number(),
  openDisputes: z.number(),
  pendingReports: z.number(),
})
```

---

## GET /admin/validations
Supplier validation queue.

**Query**: `status: 'PENDING' | 'COMPLEMENT_REQUESTED'`, `page`, `limit`

**Response 200**:
```typescript
z.object({
  suppliers: z.array(z.object({
    id: z.string().uuid(),
    shopName: z.string(),
    type: z.string(),
    phone: z.string(),
    identityDocumentUrl: z.string().url(),
    businessProofUrl: z.string().url().nullable(),
    submittedAt: z.string().datetime(),
    validationStatus: z.string(),
    productCount: z.number(),
  })),
  total: z.number(),
})
```

---

## PATCH /admin/validations/:supplierId
Validate, reject, or request complement.

**Request Body**:
```typescript
z.object({
  action: z.enum(['VALIDATE', 'REJECT', 'REQUEST_COMPLEMENT']),
  message: z.string().optional(), // required for REJECT and REQUEST_COMPLEMENT
})
```

**Side effects**:
- VALIDATE: supplier status → VALIDATED, SMS + push notification, products become visible.
- REJECT: supplier status → REJECTED, SMS with reason.
- REQUEST_COMPLEMENT: supplier status → COMPLEMENT_REQUESTED, SMS with details.

---

## GET /admin/reports
Content moderation queue.

**Query**: `targetType: 'PRODUCT' | 'REVIEW' | 'PUBLICATION' | 'MESSAGE'`, `status: 'PENDING'`, `page`, `limit`

---

## PATCH /admin/reports/:id
Resolve a content report.

**Request Body**:
```typescript
z.object({
  action: z.enum(['DELETE_CONTENT', 'WARN_AUTHOR', 'DISMISS']),
  adminNote: z.string().optional(),
})
```

---

## GET /admin/transactions
Transaction list with export.

**Query**: `from`, `to` (date range), `status`, `supplierId`, `page`, `limit`, `format: 'json' | 'csv'`

**Response**: JSON (default) or CSV file download.

---

## GET /admin/disputes
Open disputes list.

**Query**: `status: 'OPEN'`, `page`, `limit`

---

## PATCH /admin/disputes/:id
Resolve a dispute.

**Request Body**:
```typescript
z.object({
  resolution: z.enum(['REFUND_BUYER', 'RELEASE_TO_SUPPLIER', 'PARTIAL_REFUND']),
  partialAmount: z.number().optional(), // for PARTIAL_REFUND
  adminNote: z.string(),
})
```

---

## PATCH /admin/suppliers/:id/suspend
Suspend a supplier (progressive).

**Request Body**: `{ reason: z.string() }`

**Side effects**: Profile hidden, no new orders, existing orders honored.

---

## PUT /admin/settings/commissions
Update commission rates.

**Request Body**:
```typescript
z.object({
  rates: z.array(z.object({
    categorySlug: z.string(),
    rate: z.number().min(0).max(0.2), // 0-20%
  })),
})
```

---

## PUT /admin/settings/plans
Update subscription plans.

**Request Body**: Array of plan objects (same schema as GET /subscriptions/plans response).

---

## POST /admin/notifications/broadcast
Send system notification.

**Request Body**:
```typescript
z.object({
  title: z.string(),
  body: z.string(),
  targetRole: z.enum(['ALL', 'BUYERS', 'SUPPLIERS']).optional(),
  targetZone: z.string().optional(), // region filter
  targetSector: z.string().optional(), // filière filter
  channel: z.enum(['PUSH', 'SMS', 'BOTH']),
})
```

**Validation**: Promotional notifications limited to 1/week per user (FR-057).
