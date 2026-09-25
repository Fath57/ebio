import { z } from 'zod'

export const campaignSegmentEnum = z.enum([
  'ALL',
  'ACTIVE',
  'NEVER_ORDERED',
  'LAPSED',
  'WITH_CART',
]).meta({ title: 'CampaignSegment', description: 'À qui la campagne s\'adresse' })

export const campaignAppEnum = z.enum(['client', 'supplier', 'courier']).meta({
  title: 'CampaignApp',
})

/**
 * What a campaign says and where it leads.
 *
 * The title and body are short on purpose: a notification tray truncates, and
 * a message that needs three lines is a message for somewhere else.
 */
export const campaignInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(500),
  imageUrl: z.string().max(1024).nullable().optional(),
  app: campaignAppEnum,
  segment: campaignSegmentEnum,
  targetType: z.enum(['SUPPLIER', 'PRODUCT', 'URL', 'NONE']),
  targetId: z.string().max(1024).nullable().optional(),
  /** ISO date; absent means it waits to be sent by hand. */
  scheduledAt: z.string().nullable().optional(),
}).meta({
  title: 'CampaignInput',
  description: 'Une notification de diffusion',
})

/** A dry run to one phone, before it goes to thousands. */
export const campaignTestSchema = z.object({
  userId: z.string().uuid(),
}).meta({ title: 'CampaignTest', description: 'Envoi d\'essai à une personne' })

export type CampaignInput = z.infer<typeof campaignInputSchema>
export type CampaignTest = z.infer<typeof campaignTestSchema>
