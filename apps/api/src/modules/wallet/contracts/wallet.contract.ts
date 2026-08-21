import { z } from 'zod'

export const walletTransactionSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['TOPUP', 'ORDER_PAYMENT', 'SALE_CREDIT', 'COMMISSION_DEBIT', 'WITHDRAWAL', 'WITHDRAWAL_REFUND', 'REFUND', 'ADJUSTMENT']),
  amount: z.number(),
  balanceAfter: z.number(),
  description: z.string(),
  orderId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
}).meta({
  title: 'WalletTransaction',
  description: 'One ledger movement on a wallet',
})

export const walletResponseSchema = z.object({
  id: z.string().uuid(),
  balance: z.number(),
  transactions: z.object({
    items: z.array(walletTransactionSchema),
    total: z.number().int(),
    page: z.number().int(),
    limit: z.number().int(),
  }),
}).meta({
  title: 'WalletResponse',
  description: 'Wallet balance with its recent movements',
})

export const topupSchema = z.object({
  amount: z.number().int().min(100).max(1_000_000),
}).meta({
  title: 'WalletTopup',
  description: 'Amount to add to the wallet, paid through FedaPay',
})

export const verifyTopupSchema = z.object({
  fedapayTransactionId: z.string().min(1).max(64),
}).meta({
  title: 'VerifyTopup',
  description: 'FedaPay transaction id reported by the checkout widget; the server re-checks it',
})

export const createPayoutNumberSchema = z.object({
  phoneNumber: z.string().min(8).max(20),
  holderName: z.string().min(2).max(100),
}).meta({
  title: 'CreatePayoutNumber',
  description: 'Mobile Money number to receive withdrawals; operator is derived from the prefix',
})

export const payoutNumberSchema = z.object({
  id: z.string().uuid(),
  phoneNumber: z.string(),
  operator: z.string(),
  operatorLabel: z.string(),
  holderName: z.string(),
  status: z.enum(['PENDING', 'VALIDATED', 'REJECTED']),
  rejectionReason: z.string().nullable(),
  createdAt: z.string().datetime(),
}).meta({
  title: 'PayoutNumber',
  description: 'A payout number and its validation status',
})

export const createWithdrawalSchema = z.object({
  payoutNumberId: z.string().uuid(),
  amount: z.number().int().min(1000),
}).meta({
  title: 'CreateWithdrawal',
  description: 'Withdrawal request; funds are reserved immediately',
})

export const withdrawalSchema = z.object({
  id: z.string().uuid(),
  amount: z.number(),
  status: z.enum(['PENDING', 'PROCESSING', 'PAID', 'FAILED', 'REJECTED', 'CANCELLED']),
  phoneNumber: z.string(),
  operatorLabel: z.string(),
  rejectionReason: z.string().nullable(),
  providerReference: z.string().nullable(),
  createdAt: z.string().datetime(),
  processedAt: z.string().datetime().nullable(),
}).meta({
  title: 'Withdrawal',
  description: 'A withdrawal request as the supplier sees it',
})

export const adminWithdrawalActionSchema = z.object({
  action: z.enum(['approve', 'reject']),
  rejectionReason: z.string().min(3).max(255).optional(),
}).meta({
  title: 'AdminWithdrawalAction',
  description: 'Approve triggers the FedaPay payout; reject re-credits the wallet',
})

export const adminPayoutNumberActionSchema = z.object({
  action: z.enum(['validate', 'reject']),
  rejectionReason: z.string().min(3).max(255).optional(),
}).meta({
  title: 'AdminPayoutNumberAction',
  description: 'Validate or reject a supplier payout number',
})

export type WalletResponse = z.infer<typeof walletResponseSchema>
export type TopupInput = z.infer<typeof topupSchema>
export type VerifyTopupInput = z.infer<typeof verifyTopupSchema>
export type CreatePayoutNumberInput = z.infer<typeof createPayoutNumberSchema>
export type CreateWithdrawalInput = z.infer<typeof createWithdrawalSchema>
export type AdminWithdrawalAction = z.infer<typeof adminWithdrawalActionSchema>
export type AdminPayoutNumberAction = z.infer<typeof adminPayoutNumberActionSchema>
