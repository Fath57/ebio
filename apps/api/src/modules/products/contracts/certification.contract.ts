import { z } from 'zod'

/**
 * Lowercase words joined by dashes: the code lands in `products.labels` and
 * in every payload, so it has to stay stable and unambiguous.
 */
export const certificationCodeSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Le code doit être en minuscules, mots séparés par des tirets, sans accent')

export const createCertificationSchema = z.object({
  code: certificationCodeSchema,
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  logoUrl: z.string().url().max(2000).nullable().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
}).meta({
  title: 'CreateCertification',
  description: 'A label or certification products can carry',
})

/** The code is immutable: renaming it would strip the label off every product wearing it. */
export const updateCertificationSchema = createCertificationSchema
  .omit({ code: true })
  .partial()
  .meta({
    title: 'UpdateCertification',
    description: 'Update a label or certification, every field optional, the code is immutable',
  })

export const certificationSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  logoUrl: z.string().nullable(),
  isActive: z.boolean(),
  sortOrder: z.number(),
  /** Number of products carrying it. */
  productCount: z.number(),
}).meta({ title: 'Certification' })

export type CreateCertification = z.infer<typeof createCertificationSchema>
export type UpdateCertification = z.infer<typeof updateCertificationSchema>
export type CertificationResponse = z.infer<typeof certificationSchema>
