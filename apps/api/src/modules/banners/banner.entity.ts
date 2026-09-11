import type { Rel } from '@mikro-orm/core'
import { Entity, Enum, ManyToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { Supplier } from '../suppliers/supplier.entity'

/** Ce vers quoi une bannière renvoie quand on la touche. */
export enum BannerTargetType {
  SUPPLIER = 'SUPPLIER',
  PRODUCT = 'PRODUCT',
  /** Lien externe, ouvert dans le navigateur. */
  URL = 'URL',
  /** Simple visuel publicitaire : toucher ne mène nulle part. */
  NONE = 'NONE',
}

@Entity({ tableName: 'banners' })
export class Banner {
  [OptionalProps]?: 'id' | 'subtitle' | 'targetId' | 'targetUrl' | 'isActive' | 'position' | 'sponsored' | 'impressions' | 'clicks' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property()
  title!: string

  @Property({ nullable: true })
  subtitle?: string

  @Property({ fieldName: 'image_url' })
  imageUrl!: string

  @Enum({ items: () => BannerTargetType, fieldName: 'target_type' })
  targetType!: BannerTargetType

  /**
   * Identifiant de la cible pour SUPPLIER et PRODUCT. Pas de clé étrangère :
   * la cible change de table selon `targetType`, et une bannière doit survivre
   * à la suppression de sa cible — le service écarte les orphelines.
   */
  @Property({ fieldName: 'target_id', type: 'uuid', nullable: true })
  targetId?: string

  /** Lien ouvert au toucher, pour le type URL uniquement. */
  @Property({ fieldName: 'target_url', nullable: true })
  targetUrl?: string

  @Property({ fieldName: 'is_active', default: true })
  isActive: boolean = true

  /** Ordre d'affichage croissant dans le carrousel. */
  @Property({ default: 0 })
  position: number = 0

  /** Boutique qui a payé la bannière (null pour l'éditorial eBio). */
  @ManyToOne(() => Supplier, { fieldName: 'supplier_id', nullable: true })
  supplier?: Rel<Supplier> | null

  @Property({ default: false })
  sponsored: boolean = false

  /** Fenêtre de diffusion ; null = sans limite. */
  @Property({ fieldName: 'starts_at', type: 'Date', nullable: true })
  startsAt?: Date | null

  @Property({ fieldName: 'ends_at', type: 'Date', nullable: true })
  endsAt?: Date | null

  @Property({ type: 'int', default: 0 })
  impressions: number = 0

  @Property({ type: 'int', default: 0 })
  clicks: number = 0

  isLive(now = new Date()): boolean {
    return this.isActive && (!this.startsAt || this.startsAt <= now) && (!this.endsAt || this.endsAt > now)
  }

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
