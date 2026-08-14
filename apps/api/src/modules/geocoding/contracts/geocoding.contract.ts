import { z } from 'zod'

export const placeSuggestionSchema = z.object({
  /** Identifiant Google, à repasser tel quel pour obtenir les coordonnées. */
  placeId: z.string(),
  /** Libellé principal — le plus souvent le nom de la ville. */
  label: z.string(),
  /** Contexte : région, pays. Vide si Google n'en fournit pas. */
  context: z.string(),
}).meta({ title: 'PlaceSuggestion' })

export const placeSuggestionsSchema = z.object({
  suggestions: z.array(placeSuggestionSchema),
}).meta({ title: 'PlaceSuggestions' })

export const resolvedPlaceSchema = z.object({
  placeId: z.string(),
  label: z.string(),
  latitude: z.number(),
  longitude: z.number(),
}).meta({ title: 'ResolvedPlace' })

export type PlaceSuggestion = z.infer<typeof placeSuggestionSchema>
export type ResolvedPlace = z.infer<typeof resolvedPlaceSchema>
