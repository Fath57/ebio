import type { Rel } from '@mikro-orm/core'
import { Entity, Enum, Index, ManyToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { BannerTargetType } from '../banners/banner.entity'
import { Supplier } from '../suppliers/supplier.entity'

export enum AnnouncementOrigin {
  /** Publiée par eBio, sans paiement. */
  PLATFORM = 'PLATFORM',
  /** Demandée et payée par une boutique. */
  SUPPLIER = 'SUPPLIER',
}

/**
 * Ce qui s'affiche à l'ouverture de l'application.
 *
 * Une annonce interrompt : elle se place devant ce que l'acheteur venait
 * faire. C'est pour cela qu'elle est datée, qu'elle ne revient pas avant un
 * délai réglé, et qu'il n'en passe qu'une à la fois — deux modaux l'un après
 * l'autre, personne ne les lit.
 */
@Entity({ tableName: 'announcements' })
@Index({ properties: ['active', 'startsAt'] })
export class Announcement {
  [OptionalProps]?: 'id' | 'active' | 'priority' | 'subtitle' | 'imageUrl' | 'targetId' | 'supplier' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property()
  title!: string

  @Property({ length: 500, nullable: true })
  subtitle?: string | null

  @Property({ fieldName: 'image_url', length: 1024, nullable: true })
  imageUrl?: string | null

  @Enum({ items: () => BannerTargetType, fieldName: 'target_type' })
  targetType!: BannerTargetType

  @Property({ fieldName: 'target_id', length: 1024, nullable: true })
  targetId?: string | null

  @Enum({ items: () => AnnouncementOrigin })
  origin!: AnnouncementOrigin

  /** La boutique qui l'a payée ; nul pour une annonce d'eBio. */
  @ManyToOne(() => Supplier, { fieldName: 'supplier_id', nullable: true })
  supplier?: Rel<Supplier> | null

  @Property({ fieldName: 'starts_at' })
  startsAt!: Date

  @Property({ fieldName: 'ends_at' })
  endsAt!: Date

  @Property({ default: true })
  active: boolean = true

  /**
   * Qui passe en premier quand plusieurs annonces sont en cours.
   *
   * Une seule s'affiche par ouverture : la plus prioritaire que l'acheteur
   * n'a pas vue récemment.
   */
  @Property({ default: 0 })
  priority: number = 0

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
