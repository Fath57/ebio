import { Entity, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'

/** A partner shown on the landing page, managed from the backoffice. */
@Entity({ tableName: 'landing_partners' })
export class LandingPartner {
  [OptionalProps]?: 'id' | 'isActive' | 'sortOrder' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ type: 'text' })
  name!: string

  /**
   * The logo, as the URL the browser will load.
   *
   * The media module hands back a public URL once the file is uploaded, so the
   * landing needs no token and no round trip to show it.
   */
  @Property({ fieldName: 'logo_url', type: 'text' })
  logoUrl!: string

  /** A partner being negotiated, or one that has left, is hidden rather than deleted. */
  @Property({ fieldName: 'is_active', default: true })
  isActive: boolean = true

  @Property({ fieldName: 'sort_order', default: 0 })
  sortOrder: number = 0

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
