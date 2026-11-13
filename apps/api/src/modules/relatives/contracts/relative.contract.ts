import { z } from 'zod'

/** Same rule as the recipient at checkout: a relative is reached in Benin. */
export const BENIN_PHONE = /^\+229\d{10}$/

/** At most this many entries per owner (FR-028). */
export const RELATIVES_LIMIT = 20

const relativeFields = {
  nickname: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().regex(BENIN_PHONE, 'Numéro béninois attendu : +229 suivi de 10 chiffres'),
  // Same floor as the delivery address: a landmark, not just a district.
  // Optional since 010: a family wallet member may have no known address. A
  // cart sent to a relative still asks for one at checkout.
  address: z.string().trim().min(10, 'Ajoutez un repère : au moins 10 caractères').max(500).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
}

/** A point is both coordinates or neither. */
function pointIsWhole(value: { latitude?: number | null, longitude?: number | null }): boolean {
  const hasLatitude = value.latitude !== undefined && value.latitude !== null
  const hasLongitude = value.longitude !== undefined && value.longitude !== null
  return hasLatitude === hasLongitude
}

const POINT_MESSAGE = { message: 'Placez le point sur la carte : latitude et longitude vont ensemble', path: ['latitude'] }

export const createRelativeSchema = z.object(relativeFields).refine(pointIsWhole, POINT_MESSAGE).meta({
  title: 'CreateRelative',
  description: 'Ajouter un proche au carnet',
})

export const updateRelativeSchema = z.object(relativeFields).partial().refine(pointIsWhole, POINT_MESSAGE).meta({
  title: 'UpdateRelative',
  description: 'Modifier un proche du carnet ; seuls les champs envoyés changent',
})

export const relativeResponseSchema = z.object({
  id: z.string().uuid(),
  nickname: z.string(),
  name: z.string(),
  phone: z.string(),
  address: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  createdAt: z.string().datetime(),
}).meta({
  title: 'Relative',
  description: 'Un proche du carnet du payeur',
})

export const relativeListResponseSchema = z.array(relativeResponseSchema).meta({
  title: 'RelativeList',
  description: 'Le carnet de proches, du plus récent au plus ancien',
})

export type CreateRelative = z.infer<typeof createRelativeSchema>
export type UpdateRelative = z.infer<typeof updateRelativeSchema>
export type RelativeResponse = z.infer<typeof relativeResponseSchema>
