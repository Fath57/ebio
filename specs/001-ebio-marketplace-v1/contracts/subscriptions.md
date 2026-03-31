# API Contract: Subscriptions Module

## GET /subscriptions/plans
List available subscription plans.

**Response 200**:
```typescript
z.object({
  plans: z.array(z.object({
    id: z.string().uuid(),
    name: z.enum(['FREE', 'ESSENTIAL', 'PRO', 'COOPERATIVE']),
    priceMonthly: z.number(), // FCFA, 0 for FREE
    maxProducts: z.number().nullable(), // null = unlimited
    orderModeEnabled: z.boolean(),
    advancedAnalytics: z.boolean(),
    freeCommissionOrders: z.number(), // per month, 0 for most
    maxMembers: z.number(), // 1 for non-COOPERATIVE
    features: z.array(z.string()), // human-readable list
  })),
})
```

---

## POST /subscriptions
Subscribe to a plan (supplier).

**Headers**: `Authorization: Bearer <token>` (supplier role)

**Request Body**:
```typescript
z.object({
  planId: z.string().uuid(),
  paymentMethod: z.enum(['FEDAPAY']),
  phoneNumber: z.string(), // Mobile Money number for recurring
  operator: z.enum(['MTN', 'MOOV', 'ORANGE']),
})
```

**Response 201**:
```typescript
z.object({
  subscription: subscriptionResponseSchema,
  paymentInitiated: z.boolean(),
})
```

---

## GET /subscriptions/me
Get current subscription.

**Response 200**:
```typescript
const subscriptionResponseSchema = z.object({
  id: z.string().uuid(),
  plan: planSummarySchema,
  status: z.enum(['ACTIVE', 'EXPIRED', 'CANCELLED']),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  autoRenew: z.boolean(),
})
```

---

## PATCH /subscriptions/me/cancel
Cancel subscription (effective at end of current period).

**Response 200**: Updated subscription with `autoRenew: false`.

---

## POST /subscriptions/me/upgrade
Upgrade plan (prorated billing).

**Request Body**: `{ planId: z.string().uuid() }`

---

## Plan limits enforcement (checked server-side):

| Plan | Max Products | Order Mode | Analytics | Free Commission Orders/mo | Members |
|------|-------------|------------|-----------|--------------------------|---------|
| FREE | 5 | No | Basic | 0 | 1 |
| ESSENTIAL | 20 | Yes | Basic | 0 | 1 |
| PRO | Unlimited | Yes | Advanced | 10 | 1 |
| COOPERATIVE | Unlimited | Yes | Advanced | 10 | 5 |
