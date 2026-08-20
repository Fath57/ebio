import { Entity, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'

/**
 * One editable section of the public landing site, stored as a JSON document
 * under a stable key ('hero', 'stores', …). The shape of each document is
 * enforced by the zod contract matching its key, not by the database: sections
 * evolve with the site, the storage does not have to.
 */
@Entity({ tableName: 'landing_contents' })
export class LandingContent {
  [OptionalProps]?: 'updatedAt'

  @PrimaryKey()
  key!: string

  @Property({ type: 'jsonb' })
  value!: Record<string, unknown>

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
