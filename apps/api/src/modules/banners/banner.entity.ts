import { Entity, Enum, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'

/** Ce vers quoi une bannière renvoie quand on la touche. */
export enum BannerTargetType {
  SUPPLIER = 'SUPPLIER',
  PRODUCT = 'PRODUCT',
}

@Entity({ tableName: 'banners' })
export class Banner {
  [OptionalProps]?: 'id' | 'subtitle' | 'isActive' | 'position' | 'createdAt' | 'updatedAt'

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
   * Identifiant de la cible. Pas de clé étrangère : la cible change de table
   * selon `targetType`, et une bannière doit survivre à la suppression de sa
   * cible — le service se charge d'écarter les bannières devenues orphelines.
   */
  @Property({ fieldName: 'target_id', type: 'uuid' })
  targetId!: string

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
