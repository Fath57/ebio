import { z } from 'zod'

const targetSchema = z.object({
  targetType: z.enum(['SUPPLIER', 'PRODUCT', 'URL', 'NONE']),
  /** The id being pointed at, or the address for an external link. */
  targetId: z.string().max(1024).nullable().optional(),
})

/**
 * What a shop requests.
 *
 * The duration picks the offer, and the offer sets the price: the shop does
 * not propose an amount, it takes a posted rate.
 */
/**
 * An announcement says something, one way or another.
 *
 * A poster is often enough on its own — it already carries its text. So the
 * title becomes optional as soon as there is an image, but one of the two is
 * required: an empty announcement would have nothing to show.
 */
function hasSomethingToShow(value: { title?: string | null, imageUrl?: string | null }): boolean {
  return (value.title ?? '').trim().length > 0 || (value.imageUrl ?? '').trim().length > 0
}

const NOTHING_TO_SHOW = 'Une annonce demande au moins un titre ou une image'

export const announcementRequestSchema = targetSchema.extend({
  title: z.string().trim().max(120).nullable().optional(),
  subtitle: z.string().trim().max(500).nullable().optional(),
  imageUrl: z.string().max(1024).nullable().optional(),
  durationDays: z.number().int().min(1).max(60),
}).refine(hasSomethingToShow, { message: NOTHING_TO_SHOW, path: ['title'] }).meta({
  title: 'AnnouncementRequestInput',
  description: 'Demande d\'annonce à l\'ouverture de l\'application',
})

/** What eBio publishes on its own behalf, with no payment or approval. */
export const platformAnnouncementSchema = targetSchema.extend({
  title: z.string().trim().max(120).nullable().optional(),
  subtitle: z.string().trim().max(500).nullable().optional(),
  imageUrl: z.string().max(1024).nullable().optional(),
  startsAt: z.string(),
  endsAt: z.string(),
  priority: z.number().int().min(0).max(100).optional(),
  active: z.boolean().optional(),
}).refine(hasSomethingToShow, { message: NOTHING_TO_SHOW, path: ['title'] }).meta({
  title: 'PlatformAnnouncementInput',
  description: 'Une annonce publiée par eBio',
})

export const rejectAnnouncementSchema = z.object({
  reason: z.string().trim().min(1).max(500),
}).meta({ title: 'RejectAnnouncement' })

/** When the approved announcement starts; right away by default. */
export const approveAnnouncementSchema = z.object({
  startsAt: z.string().nullable().optional(),
  priority: z.number().int().min(0).max(100).optional(),
}).meta({ title: 'ApproveAnnouncement' })

export const announcementIntervalSchema = z.object({
  intervalleHeures: z.coerce.number().int().min(1).max(720),
}).meta({
  title: 'AnnouncementInterval',
  description: 'Temps avant qu\'une même annonce puisse réapparaître',
})

export type AnnouncementRequestInput = z.infer<typeof announcementRequestSchema>
export type PlatformAnnouncementInput = z.infer<typeof platformAnnouncementSchema>
export type RejectAnnouncementInput = z.infer<typeof rejectAnnouncementSchema>
export type ApproveAnnouncementInput = z.infer<typeof approveAnnouncementSchema>
export type AnnouncementIntervalInput = z.infer<typeof announcementIntervalSchema>
