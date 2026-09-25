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
/**
 * Une annonce dit quelque chose, d'une façon ou d'une autre.
 *
 * Un visuel se suffit souvent à lui-même — une affiche porte déjà son texte.
 * Le titre devient donc facultatif dès qu'il y a une image, mais l'un des deux
 * est exigé : une annonce vide n'aurait rien à montrer.
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

/** Ce qu'eBio publie pour son compte, sans paiement ni approbation. */
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
