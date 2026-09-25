import { z } from 'zod'

/**
 * A basket as the app holds it.
 *
 * Sent whole rather than as a list of changes: a basket is small, and the
 * alternative is reconciling two histories that can disagree — for something
 * nobody would thank us for getting subtly right.
 */
export const cartSyncSchema = z.object({
  items: z.array(z.object({
    productId: z.string().uuid(),
    supplierId: z.string().uuid(),
    quantity: z.number().int().min(1).max(999),
  })).max(200),
}).meta({
  title: 'CartSync',
  description: 'Le panier tel que l\'application le détient',
})

export const cartItemSchema = z.object({
  productId: z.string().uuid(),
  supplierId: z.string().uuid(),
  supplierName: z.string(),
  name: z.string(),
  imageUrl: z.string().nullable(),
  pricePerUnit: z.number(),
  unit: z.string(),
  quantity: z.number(),
}).meta({ title: 'CartItem' })

export const cartResponseSchema = z.object({
  items: z.array(cartItemSchema),
  updatedAt: z.string().nullable(),
}).meta({ title: 'CartResponse' })

/** How long a basket sits still before it counts as abandoned. */
export const cartReminderSettingsSchema = z.object({
  heures: z.coerce.number().int().min(1).max(168),
  relances: z.coerce.number().int().min(0).max(5),
}).meta({
  title: 'CartReminderSettings',
  description: 'Délai avant relance d\'un panier abandonné, et nombre de relances',
})

export type CartSync = z.infer<typeof cartSyncSchema>
export type CartReminderSettings = z.infer<typeof cartReminderSettingsSchema>
