import { z } from 'zod'

/**
 * One zod schema per editable section. The key in this map is the row key in
 * `landing_contents`; a PUT on a key is validated by its schema, so the
 * backoffice can never store a document the landing cannot render.
 */

export const landingHeroSchema = z.object({
  eyebrow: z.string().min(1).max(80),
  title: z.string().min(1).max(160),
  /** Substring of `title` painted green by the landing. Empty disables it. */
  highlight: z.string().max(160),
  subtitle: z.string().min(1).max(400),
  footnote: z.string().max(160),
}).meta({ title: 'LandingHero' })

export const landingStoresSchema = z.object({
  /** Null until the app is published: the badges then open the modal below. */
  playStoreUrl: z.string().url().max(500).nullable(),
  appStoreUrl: z.string().url().max(500).nullable(),
  comingSoonTitle: z.string().min(1).max(120),
  comingSoonBody: z.string().min(1).max(500),
}).meta({ title: 'LandingStores' })

const trustPointSchema = z.object({
  title: z.string().min(1).max(80),
  body: z.string().min(1).max(400),
})

export const landingTrustSchema = z.object({
  points: z.array(trustPointSchema).length(3),
}).meta({ title: 'LandingTrust' })

const stepSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
})

export const landingStepsSchema = z.object({
  eyebrow: z.string().min(1).max(80),
  title: z.string().min(1).max(160),
  steps: z.array(stepSchema).length(3),
}).meta({ title: 'LandingSteps' })

export const landingSupplierSchema = z.object({
  eyebrow: z.string().min(1).max(80),
  title: z.string().min(1).max(160),
  body: z.string().min(1).max(500),
  points: z.array(z.string().min(1).max(200)).min(1).max(6),
  ctaLabel: z.string().min(1).max(60),
}).meta({ title: 'LandingSupplier' })

/**
 * Where the contact form lands. Kept out of the public content payload: the
 * addresses are for the mailer, not for scrapers.
 */
export const landingContactSchema = z.object({
  recipients: z.array(z.string().email().max(200)).min(1).max(5),
}).meta({ title: 'LandingContact' })

export const landingFooterSchema = z.object({
  tagline: z.string().min(1).max(300),
  contactEmail: z.string().email().max(200),
  bottomLine: z.string().min(1).max(120),
}).meta({ title: 'LandingFooter' })

export const LANDING_SECTION_SCHEMAS = {
  hero: landingHeroSchema,
  stores: landingStoresSchema,
  trust: landingTrustSchema,
  steps: landingStepsSchema,
  supplier: landingSupplierSchema,
  footer: landingFooterSchema,
  contact: landingContactSchema,
} as const

export type LandingSectionKey = keyof typeof LANDING_SECTION_SCHEMAS

export const landingSectionKeySchema = z.enum(
  Object.keys(LANDING_SECTION_SCHEMAS) as [LandingSectionKey, ...LandingSectionKey[]],
)

// --- Contact form ---

export const contactReasonSchema = z.enum(['ACHETEUR', 'FOURNISSEUR', 'PARTENARIAT', 'AUTRE']).meta({
  title: 'ContactReason',
  description: 'Why the visitor is writing',
})

export const CONTACT_REASON_LABELS: Record<z.infer<typeof contactReasonSchema>, string> = {
  ACHETEUR: 'Question d’acheteur',
  FOURNISSEUR: 'Je veux vendre sur eBio',
  PARTENARIAT: 'Partenariat',
  AUTRE: 'Autre sujet',
}

export const contactMessageSchema = z.object({
  name: z.string().trim().min(2, 'Le nom est trop court').max(120),
  email: z.string().trim().email('L’adresse email est invalide').max(200),
  /** Optional, loosely validated: Benin numbers come in many shapes. */
  phone: z.string().trim().regex(/^[+0-9 ().-]{6,25}$/, 'Le numéro de téléphone est invalide').optional().or(z.literal('')),
  reason: contactReasonSchema,
  message: z.string().trim().min(10, 'Le message est trop court').max(3000),
  /** Honeypot: humans never see the field, bots fill it. */
  company: z.string().max(0).optional(),
  /**
   * When the form was displayed. A submission that arrives seconds after the
   * page rendered was not typed by a person.
   */
  startedAt: z.coerce.number().int().positive(),
}).meta({
  title: 'ContactMessage',
  description: 'Message sent from the landing contact form',
})

export type ContactMessage = z.infer<typeof contactMessageSchema>

// --- FAQ ---

export const createLandingFaqSchema = z.object({
  question: z.string().min(1).max(300),
  answer: z.string().min(1).max(2000),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
}).meta({ title: 'CreateLandingFaq' })

export const updateLandingFaqSchema = createLandingFaqSchema.partial().meta({
  title: 'UpdateLandingFaq',
})

export const landingFaqSchema = z.object({
  id: z.string().uuid(),
  question: z.string(),
  answer: z.string(),
  isActive: z.boolean(),
  sortOrder: z.number(),
}).meta({ title: 'LandingFaq' })

export type CreateLandingFaq = z.infer<typeof createLandingFaqSchema>
export type UpdateLandingFaq = z.infer<typeof updateLandingFaqSchema>
export type LandingFaqResponse = z.infer<typeof landingFaqSchema>
