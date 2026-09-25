import { z } from 'zod'

/**
 * What the seller has already typed, and nothing else.
 *
 * The model writes *from* these facts; it is never asked to find new ones. A
 * description that invents an origin, a certification or a health benefit is a
 * claim the shop cannot back — and on food, that is the kind of claim that
 * ends in a refund or worse.
 */
export const describeProductSchema = z.object({
  name: z.string().min(2).max(200),
  categoryName: z.string().max(100).optional(),
  /** The unit of sale, so the text can say what a buyer actually receives. */
  unit: z.string().max(100).optional(),
  origin: z.string().max(200).optional(),
  ingredients: z.string().max(2000).optional(),
  conservation: z.string().max(1000).optional(),
  labels: z.array(z.string().max(100)).max(10).optional(),
  /** An existing description to rework rather than replace outright. */
  current: z.string().max(2000).optional(),
}).meta({
  title: 'DescribeProduct',
  description: 'Rédiger une description à partir des informations déjà saisies',
})

export type DescribeProductInput = z.infer<typeof describeProductSchema>

export const productDescriptionSchema = z.object({
  description: z.string(),
}).meta({
  title: 'ProductDescription',
  description: 'La proposition de description, à relire avant publication',
})

export type ProductDescription = z.infer<typeof productDescriptionSchema>
