# API Contract: Payments Module

## POST /payments/initiate
Initiate FedaPay Mobile Money payment.

**Headers**: `Authorization: Bearer <token>`

**Request Body**:
```typescript
z.object({
  orderId: z.string().uuid(),
  operator: z.enum(['MTN', 'MOOV', 'ORANGE']),
  phoneNumber: z.string(), // Mobile Money number
})
```

**Response 200**:
```typescript
z.object({
  paymentId: z.string().uuid(),
  fedapayTransactionId: z.string(),
  status: z.literal('PENDING'),
  amount: z.number(),
  operator: z.string(),
})
```

**Flow**: FedaPay sends USSD push to buyer's phone → buyer confirms with PIN → webhook callback.

---

## POST /payments/webhook/fedapay
FedaPay webhook callback (server-to-server).

**Verification**: Signature validation using FedaPay webhook secret.

**Request Body** (from FedaPay):
```typescript
z.object({
  event: z.string(), // "transaction.approved", "transaction.declined"
  entity: z.object({
    id: z.number(),
    reference: z.string(),
    amount: z.number(),
    status: z.string(),
  }),
})
```

**Side effects on `transaction.approved`**:
1. Payment status → `CAPTURED`
2. Funds logically placed in escrow (status → `ESCROW`)
3. Order status → `PLACED`
4. Push notification to supplier: "Nouvelle commande payée"
5. SMS notification to supplier

**Side effects on `transaction.declined`**:
1. Payment status stays `PENDING`
2. Buyer notified of failure
3. 30-minute window restarts for retry

---

## POST /payments/:id/release
Release escrow to supplier (internal — triggered by system or admin).

**Conditions**:
- Both parties confirmed delivery AND 48h dispute window passed
- OR 7 days elapsed with no confirmation (auto-release)
- OR admin resolves dispute in supplier's favor

**Side effects**:
1. FedaPay transfer to supplier's Mobile Money account
2. Commission deducted: 4% (alimentaire), 3% (intrants), 2.5% (semences)
3. Payment status → `RELEASED`
4. Receipt PDF generated and sent via WhatsApp/SMS
5. Push notification to supplier: "Paiement reçu"

---

## POST /payments/:id/refund
Refund buyer (internal — triggered by order cancellation or dispute resolution).

**Side effects**:
1. FedaPay refund to buyer's Mobile Money
2. Payment status → `REFUNDED`
3. Notification to buyer

---

## GET /payments/supplier/summary
Supplier payment summary.

**Headers**: `Authorization: Bearer <token>` (supplier)

**Response 200**:
```typescript
z.object({
  totalReleased: z.number(),
  pendingEscrow: z.number(),
  totalCommissions: z.number(),
  recentPayments: z.array(paymentSummarySchema),
})
```
