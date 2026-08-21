import { z } from 'zod'

export const promoTypeEnum = z.enum(['PERCENT', 'FIXED']).meta({
  title: 'PromoType',
  description: 'Discount type: percentage of the items subtotal, or fixed amount',
})

const basePromoFields = {
  code: z.string().min(3).max(30).regex(/^[A-Z0-9-]+$/i, 'Lettres, chiffres et tirets uniquement'),
  type: promoTypeEnum,
  value: z.number().positive(),
  maxDiscount: z.number().positive().nullable().optional(),
  minOrderAmount: z.number().min(0).default(0),
  startsAt: z.string().datetime().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  maxUses: z.number().int().positive().nullable().optional(),
  maxUsesPerUser: z.number().int().positive().default(1),
}

export const createPromoCodeSchema = z.object(basePromoFields)
  .refine(data => data.type !== 'PERCENT' || data.value <= 100, {
    message: 'Un pourcentage ne peut pas dépasser 100',
    path: ['value'],
  })
  .meta({
    title: 'CreatePromoCode',
    description: 'New promo code; supplier scope comes from the route, never the body',
  })

export const updatePromoCodeSchema = z.object({
  ...Object.fromEntries(
    Object.entries(basePromoFields).filter(([key]) => key !== 'code'),
  ) as Omit<typeof basePromoFields, 'code'>,
  isActive: z.boolean(),
}).partial().meta({
  title: 'UpdatePromoCode',
  description: 'Editable fields — the code itself is immutable once created',
})

export const promoCodeResponseSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  supplierId: z.string().uuid().nullable(),
  shopName: z.string().nullable(),
  type: promoTypeEnum,
  value: z.number(),
  maxDiscount: z.number().nullable(),
  minOrderAmount: z.number(),
  startsAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable(),
  maxUses: z.number().int().nullable(),
  maxUsesPerUser: z.number().int(),
  useCount: z.number().int(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
}).meta({
  title: 'PromoCode',
  description: 'A promo code with its usage counter',
})

export const validatePromoSchema = z.object({
  code: z.string().min(1).max(30),
  supplierId: z.string().uuid(),
  itemsTotal: z.number().positive(),
}).meta({
  title: 'ValidatePromo',
  description: 'Pre-checkout check: is this code usable on this cart?',
})

export const promoValidationResultSchema = z.object({
  valid: z.boolean(),
  discount: z.number(),
  /** Human reason when invalid — shown as-is to the buyer. */
  message: z.string().nullable(),
}).meta({
  title: 'PromoValidationResult',
  description: 'Discount preview, or the reason the code is refused',
})

export type CreatePromoCodeInput = z.infer<typeof createPromoCodeSchema>
export type UpdatePromoCodeInput = z.infer<typeof updatePromoCodeSchema>
export type ValidatePromoInput = z.infer<typeof validatePromoSchema>
