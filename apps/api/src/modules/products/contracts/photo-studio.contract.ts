import { z } from 'zod'

/**
 * What may be done to a photo.
 *
 * Every one of these is arithmetic on the pixels that were photographed. None
 * of them adds anything that was not in front of the lens — a product listing
 * has to show the product, and a retouched photo that flatters a different
 * item is a dispute waiting to happen.
 */
export const photoAdjustmentsSchema = z.object({
  /** Cut the uniform margin around the subject so it fills the card. */
  trim: z.boolean().default(true),
  /** Stretch the histogram: rescues the dim, flat look of an indoor shot. */
  light: z.boolean().default(true),
  /** Pad to a square on white, so a grid of products lines up. */
  square: z.boolean().default(true),
  /** A touch of definition, applied last so it does not amplify noise. */
  sharpen: z.boolean().default(true),
  /** Warmth and saturation, as a percentage. Bounded: no cartoon colours. */
  warmth: z.number().min(-30).max(30).default(0),
}).meta({
  title: 'PhotoAdjustments',
  description: 'Retouches déterministes appliquées à une photo de produit',
})

export type PhotoAdjustments = z.infer<typeof photoAdjustmentsSchema>

export const enhancePhotoSchema = z.object({
  /** The photo's public URL, as the form holds it. */
  url: z.string().url(),
  adjustments: photoAdjustmentsSchema,
}).meta({
  title: 'EnhancePhoto',
  description: 'Retoucher une photo de produit et enregistrer le résultat',
})

export type EnhancePhotoInput = z.infer<typeof enhancePhotoSchema>

export const enhancedPhotoSchema = z.object({
  mediaId: z.string().uuid(),
  url: z.string(),
  thumbnailUrl: z.string().nullable(),
}).meta({
  title: 'EnhancedPhoto',
  description: 'La photo retouchée, enregistrée à côté de l\'originale',
})

export const reviewPhotoSchema = z.object({
  url: z.string().url(),
  /** Helps the model judge framing: a sack of rice is not a bottle of oil. */
  productName: z.string().max(200).optional(),
}).meta({
  title: 'ReviewPhoto',
  description: 'Demander un avis sur une photo de produit',
})

export type ReviewPhotoInput = z.infer<typeof reviewPhotoSchema>

export const photoReviewSchema = z.object({
  /** 5 = publiable telle quelle, 1 = à reprendre. */
  note: z.number().int().min(1).max(5),
  resume: z.string(),
  problemes: z.array(z.object({
    code: z.string(),
    conseil: z.string(),
  })),
}).meta({
  title: 'PhotoReview',
  description: 'Ce qu\'un acheteur reprocherait à cette photo',
})

export type PhotoReview = z.infer<typeof photoReviewSchema>

/**
 * A deeper pass: the product is kept, its surroundings are rebuilt.
 *
 * Unlike the adjustments above, this one does not move pixels — it asks a
 * model to draw the scene again around the product. That is a real risk, and
 * it is why every result comes back with a fidelity verdict attached: on a
 * bottle with no label, the model has been observed inventing one reading
 * « EXTRA VIRGIN OLIVE OIL ». A claim like that on a food listing is not a
 * cosmetic defect.
 */
export const restagePhotoSchema = z.object({
  url: z.string().url(),
  productName: z.string().max(200).optional(),
  /** What the shop wants around the product, in its own words. */
  consigne: z.string().max(300).optional(),
}).meta({
  title: 'RestagePhoto',
  description: 'Remettre le produit en scène en conservant le produit lui-même',
})

export type RestagePhotoInput = z.infer<typeof restagePhotoSchema>

export const photoFidelitySchema = z.object({
  /** False as soon as the product itself differs, or something was added. */
  fidele: z.boolean(),
  ecarts: z.array(z.object({
    code: z.string(),
    detail: z.string(),
  })),
}).meta({
  title: 'PhotoFidelity',
  description: 'Ce que la remise en scène a changé du produit lui-même',
})

export type PhotoFidelity = z.infer<typeof photoFidelitySchema>

export const restagedPhotoSchema = z.object({
  mediaId: z.string().uuid(),
  url: z.string(),
  thumbnailUrl: z.string().nullable(),
  fidelity: photoFidelitySchema,
}).meta({
  title: 'RestagedPhoto',
  description: 'La photo remise en scène, et le verdict de fidélité qui l\'accompagne',
})
