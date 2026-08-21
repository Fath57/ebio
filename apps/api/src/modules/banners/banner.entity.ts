import { Entity, Enum, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'

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
  [OptionalProps]?: 'id' | 'subtitle' | 'targetId' | 'targetUrl' | 'isActive' | 'position' | 'createdAt' | 'updatedAt'

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

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
