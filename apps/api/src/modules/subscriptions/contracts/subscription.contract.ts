import { z } from 'zod'

export const subscriptionStatusEnum = z.enum(['ACTIVE', 'EXPIRED', 'CANCELLED']).meta({
  title: 'SubscriptionStatus',
  description: 'Current status of a subscription',
})

export const subscriptionPlanSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  priceMonthly: z.number().int(),
  maxProducts: z.number().int().nullable(),
  orderModeEnabled: z.boolean(),
  advancedAnalytics: z.boolean(),
  freeCommissionOrders: z.number().int(),
  maxMembers: z.number().int(),
}).meta({
  title: 'SubscriptionPlan',
  description: 'A subscription plan available for suppliers',
})

export const subscriptionSchema = z.object({
  id: z.string().uuid(),
  planId: z.string().uuid(),
  planName: z.string(),
  status: subscriptionStatusEnum,
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  autoRenew: z.boolean(),
  createdAt: z.string().datetime(),
}).meta({
  title: 'Subscription',
  description: 'Active subscription for a supplier',
})

export const createSubscriptionSchema = z.object({
  planId: z.string().uuid(),
  paymentMethod: z.string().min(1),
  paymentReference: z.string().optional(),
}).meta({
  title: 'CreateSubscription',
  description: 'Data to subscribe to a plan',
})

export const upgradeSubscriptionSchema = z.object({
  newPlanId: z.string().uuid(),
}).meta({
  title: 'UpgradeSubscription',
  description: 'Upgrade to a new plan',
})

export type SubscriptionPlanResponse = z.infer<typeof subscriptionPlanSchema>
export type SubscriptionResponse = z.infer<typeof subscriptionSchema>
export type CreateSubscription = z.infer<typeof createSubscriptionSchema>
export type UpgradeSubscription = z.infer<typeof upgradeSubscriptionSchema>
