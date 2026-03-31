import { z } from 'zod'

// ----------------------
// Enums
// ----------------------

export const paymentStatusEnum = z.enum([
  'PENDING',
  'CAPTURED',
  'ESCROW',
  'RELEASED',
  'REFUNDED',
  'FAILED',
]).meta({
  title: 'PaymentStatus',
  description: 'Current status of a payment',
})

export const paymentProviderEnum = z.enum(['fedapay', 'stripe', 'pawerpayer']).meta({
  title: 'PaymentProvider',
  description: 'Payment gateway provider',
})

export const mobileOperatorEnum = z.enum(['MTN', 'MOOV', 'ORANGE']).meta({
  title: 'MobileOperator',
  description: 'Mobile money operator',
})

// ----------------------
// Initiate No-Redirect Payment (USSD push)
// ----------------------

export const initiatePaymentSchema = z.object({
  orderId: z.string().uuid(),
  paymentMethodId: z.string().uuid(),
  phoneNumber: z.string().min(8).optional(),
}).meta({
  title: 'InitiatePayment',
  description: 'Input for initiating a no-redirect (USSD) payment',
})

export type InitiatePayment = z.infer<typeof initiatePaymentSchema>

// ----------------------
// Initiate Checkout.js Payment
// ----------------------

export const initiateCheckoutSchema = z.object({
  orderId: z.string().uuid(),
}).meta({
  title: 'InitiateCheckoutInput',
  description: 'Input for creating a pending payment before opening Checkout.js',
})

export type InitiateCheckoutInput = z.infer<typeof initiateCheckoutSchema>

export const initiateCheckoutResultSchema = z.object({
  paymentId: z.uuid(),
  status: z.literal('pending'),
}).meta({
  title: 'InitiateCheckoutResult',
  description: 'Result after creating a pending checkout payment',
})

// ----------------------
// Verify Checkout.js Payment
// ----------------------

export const verifyCheckoutSchema = z.object({
  orderId: z.string().uuid(),
  paymentId: z.string().uuid(),
  fedapayTransactionId: z.string().min(1),
}).meta({
  title: 'VerifyCheckoutInput',
  description: 'Input for verifying a payment made via Checkout.js',
})

export type VerifyCheckoutInput = z.infer<typeof verifyCheckoutSchema>

export const checkoutVerifyResultSchema = z.object({
  paymentId: z.uuid(),
  status: z.literal('completed'),
}).meta({
  title: 'CheckoutVerifyResult',
  description: 'Result after verifying a Checkout.js payment',
})

// ----------------------
// No-Redirect Payment Result
// ----------------------

export const noRedirectPaymentResultSchema = z.object({
  paymentId: z.uuid(),
  status: z.literal('pending'),
}).meta({
  title: 'NoRedirectPaymentResult',
  description: 'Result after initiating a no-redirect payment',
})

// ----------------------
// Payment Info
// ----------------------

export const paymentInfoSchema = z.object({
  amount: z.number(),
  currency: z.string(),
  fedapayPublicKey: z.string().nullable(),
}).meta({
  title: 'PaymentInfo',
  description: 'Payment info for the frontend to display and init Checkout.js',
})

export type PaymentInfo = z.infer<typeof paymentInfoSchema>

// ----------------------
// Payment Status
// ----------------------

export const paymentStatusResponseSchema = z.object({
  paymentId: z.uuid(),
  status: paymentStatusEnum,
  amount: z.number(),
  currency: z.string(),
  paidAt: z.string().nullable(),
  provider: paymentProviderEnum,
}).meta({
  title: 'PaymentStatusResponse',
  description: 'Current payment status for an order',
})

export type PaymentStatusResponse = z.infer<typeof paymentStatusResponseSchema>

// ----------------------
// Full Payment Response
// ----------------------

export const paymentResponseSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  amount: z.number(),
  currency: z.string(),
  provider: paymentProviderEnum,
  paymentMethod: z.string(),
  operator: mobileOperatorEnum.nullable(),
  providerTransactionId: z.string().nullable(),
  status: paymentStatusEnum,
  phoneNumber: z.string().nullable(),
  paidAt: z.string().datetime().nullable(),
  releasedAt: z.string().datetime().nullable(),
  refundedAt: z.string().datetime().nullable(),
  receiptUrl: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).meta({
  title: 'PaymentResponse',
  description: 'Full payment details',
})

export type PaymentResponse = z.infer<typeof paymentResponseSchema>

// ----------------------
// Webhook Event (FedaPay legacy)
// ----------------------

export const webhookEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  data: z.object({
    id: z.number(),
    reference: z.string().optional(),
    amount: z.number().optional(),
    status: z.string(),
    customer: z.object({
      phone_number: z.object({
        number: z.string(),
        country: z.string(),
      }).optional(),
    }).optional(),
  }),
}).meta({
  title: 'WebhookEvent',
  description: 'FedaPay webhook event payload',
})

export type WebhookEvent = z.infer<typeof webhookEventSchema>
