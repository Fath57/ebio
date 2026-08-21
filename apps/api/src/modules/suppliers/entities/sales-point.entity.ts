import type { Rel } from '@mikro-orm/core'
import { Entity, Index, ManyToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { Supplier } from '../supplier.entity'

/**
 * A place where a supplier sells besides their main shop: a market stall, a
 * kiosk in another neighborhood, a partner store. The map surfaces the shop at
 * whichever of its points is closest to the buyer.
 */
@Entity({ tableName: 'sales_points' })
@Index({ properties: ['supplier'] })
export class SalesPoint {
  [OptionalProps]?: 'id' | 'isActive' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => Supplier, { fieldName: 'supplier_id', deleteRule: 'cascade' })
  supplier!: Rel<Supplier>

  /** « Étal du marché Dantokpa », « Kiosque Fidjrossè »… */
  @Property()
  name!: string

  @Property({ nullable: true })
  address?: string

  @Property({ nullable: true })
  phone?: string

  /**
   * Same opaque PostGIS column as the supplier's own location: written and
   * read through raw SQL, never through the entity.
   */
  @Property({ type: 'unknown', columnType: 'geography(Point, 4326)', nullable: true })
  location?: unknown

  /**
   * Hours specific to this point — a market stall only lives on market days.
   * Same shape as the supplier's opening hours; null means « as the shop ».
   */
  @Property({ fieldName: 'opening_hours', type: 'jsonb', nullable: true })
  openingHours?: Record<string, unknown>

  /** A paused point disappears from buyers without losing its setup. */
  @Property({ fieldName: 'is_active', default: true })
  isActive: boolean = true

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
