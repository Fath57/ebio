import { z } from 'zod'

export const appVariantEnum = z.enum(['client', 'supplier', 'courier']).meta({
  title: 'AppVariant',
  description: 'Laquelle des trois applications',
})

/**
 * A version, as three numbers.
 *
 * Not free text: it is compared, and "1.10.0" must come after "1.9.0" — which
 * a string comparison gets wrong.
 */
const version = z.string().regex(/^\d+\.\d+\.\d+$/, 'Format attendu : 1.2.3')

export const appVersionRuleSchema = z.object({
  /**
   * Below this, the app refuses to go on.
   *
   * For the day a release must not be skipped — a payment that changed, a
   * field the API no longer accepts. Everything else is a suggestion.
   */
  minimum: version,
  /** The newest published version; offered, never imposed. */
  latest: version,
}).meta({ title: 'AppVersionRule' })

export const appVersionsSchema = z.object({
  client: appVersionRuleSchema,
  supplier: appVersionRuleSchema,
  courier: appVersionRuleSchema,
}).meta({
  title: 'AppVersions',
  description: 'Versions minimale et courante de chaque application',
})

export const appVersionResponseSchema = appVersionRuleSchema.extend({
  /** Where to go to get it. */
  storeUrl: z.string(),
}).meta({ title: 'AppVersionResponse' })

export type AppVariant = z.infer<typeof appVariantEnum>
export type AppVersionRule = z.infer<typeof appVersionRuleSchema>
export type AppVersions = z.infer<typeof appVersionsSchema>
