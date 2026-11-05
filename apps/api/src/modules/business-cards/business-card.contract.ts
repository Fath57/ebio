import { z } from 'zod'

/** Above this, the admin uses « all » rather than a hand-picked list. */
export const MAX_SELECTED_SUPPLIERS = 200

export const generateBusinessCardsSchema = z.object({
  supplierIds: z.array(z.uuid()).min(1).max(MAX_SELECTED_SUPPLIERS).optional(),
  all: z.boolean().optional(),
}).refine(body => body.all === true || (body.supplierIds?.length ?? 0) > 0, {
  message: 'Choisissez au moins un fournisseur',
}).meta({
  title: 'GenerateBusinessCards',
  description: 'The validated suppliers to print: a selection, or all of them',
})

export type GenerateBusinessCardsInput = z.infer<typeof generateBusinessCardsSchema>
