import { z } from 'zod'

const targetSchema = z.object({
  targetType: z.enum(['SUPPLIER', 'PRODUCT', 'URL', 'NONE']),
  /** L'identifiant visé, ou l'adresse pour un lien externe. */
  targetId: z.string().max(1024).nullable().optional(),
})

/**
 * Ce qu'une boutique demande.
 *
 * La durée choisit l'offre, et l'offre fixe le prix : la boutique ne propose
 * pas un montant, elle prend un tarif affiché.
 */
export const announcementRequestSchema = targetSchema.extend({
  title: z.string().trim().min(1).max(120),
  subtitle: z.string().trim().max(500).nullable().optional(),
  imageUrl: z.string().max(1024).nullable().optional(),
  durationDays: z.number().int().min(1).max(60),
}).meta({
  title: 'AnnouncementRequestInput',
  description: 'Demande d\'annonce à l\'ouverture de l\'application',
})

/** Ce qu'eBio publie pour son compte, sans paiement ni approbation. */
export const platformAnnouncementSchema = targetSchema.extend({
  title: z.string().trim().min(1).max(120),
  subtitle: z.string().trim().max(500).nullable().optional(),
  imageUrl: z.string().max(1024).nullable().optional(),
  startsAt: z.string(),
  endsAt: z.string(),
  priority: z.number().int().min(0).max(100).optional(),
  active: z.boolean().optional(),
}).meta({
  title: 'PlatformAnnouncementInput',
  description: 'Une annonce publiée par eBio',
})

export const rejectAnnouncementSchema = z.object({
  reason: z.string().trim().min(1).max(500),
}).meta({ title: 'RejectAnnouncement' })

/** Quand l'annonce approuvée commence ; par défaut, tout de suite. */
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
