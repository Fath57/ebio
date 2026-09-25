import { Entity, Enum, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'

export enum HomeSectionMode {
  /** The products are whichever ones match a set of criteria. */
  CRITERIA = 'CRITERIA',
  /** The products are picked one by one. */
  MANUAL = 'MANUAL',
}

/**
 * What defines a section's products.
 *
 * The fields mirror the search on purpose: a section is nothing but a saved
 * search, and everything the search already does — distance, promotions,
 * rating — holds here without being rewritten.
 */
export interface HomeSectionCriteria {
  categorySlug?: string
  supplierId?: string
  validatedOnly?: boolean
  promoOnly?: boolean
  minRating?: number
  maxPrice?: number
  newerThanDays?: number
  /** Radius in kilometres around the buyer. */
  maxDistanceKm?: number
  sortBy?: 'distance' | 'rating' | 'price'
}

/**
 * A home section, as the back-office defines it.
 *
 * They used to be hard-coded in the app — "Près de vous", "Validé eBio", "En
 * promotion" — and renaming one meant a build and a Play Store submission.
 * They become data: created, renamed, reordered, switched off.
 */
@Entity({ tableName: 'home_sections' })
export class HomeSection {
  [OptionalProps]?: 'id' | 'icon' | 'active' | 'limit' | 'criteria' | 'productIds' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  /** What the buyer reads above the rail. */
  @Property()
  title!: string

  /** A line of explanation under the title, when it adds something. */
  @Property({ nullable: true })
  subtitle?: string | null

  /**
   * The rail's icon, chosen from a closed list.
   *
   * A closed list rather than a free name: the app can only draw what it
   * ships, and an unknown name would leave a hole. Empty gives the default.
   */
  @Property({ nullable: true })
  icon?: string | null

  @Enum({ items: () => HomeSectionMode })
  mode!: HomeSectionMode

  @Property({ type: 'json', nullable: true })
  criteria?: HomeSectionCriteria | null

  /** The products of a hand-picked section, in the order intended. */
  @Property({ fieldName: 'product_ids', type: 'json', nullable: true })
  productIds?: string[] | null

  /**
   * The display order.
   *
   * An integer rather than an implicit position: reordering must not depend on
   * creation dates, and two sections can cross without anything breaking.
   */
  @Property()
  position!: number

  /**
   * Switched off rather than deleted.
   *
   * A seasonal section comes back every year; rebuilding it each time would
   * lose its criteria.
   */
  @Property({ default: true })
  active: boolean = true

  /** How many products the rail shows. */
  @Property({ default: 10 })
  limit: number = 10

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
