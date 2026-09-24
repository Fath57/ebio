import { Entity, Enum, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'

export enum HomeSectionMode {
  /** Les produits sont ceux qui répondent à des critères. */
  CRITERIA = 'CRITERIA',
  /** Les produits sont choisis un par un. */
  MANUAL = 'MANUAL',
}

/**
 * Ce qui définit les produits d'une section.
 *
 * Les champs reprennent ceux de la recherche, volontairement : une section
 * n'est rien d'autre qu'une recherche enregistrée, et tout ce que la
 * recherche sait déjà faire — la distance, les promotions, la note — vaut
 * ici sans être réécrit.
 */
export interface HomeSectionCriteria {
  categorySlug?: string
  supplierId?: string
  validatedOnly?: boolean
  promoOnly?: boolean
  minRating?: number
  maxPrice?: number
  newerThanDays?: number
  /** Rayon en kilomètres autour de l'acheteur. */
  maxDistanceKm?: number
  sortBy?: 'distance' | 'rating' | 'price'
}

/**
 * Une section de l'accueil, telle que le back-office la définit.
 *
 * Elles étaient écrites en dur dans l'application — « Près de vous », « Validé
 * eBio », « En promotion » — et renommer l'une d'elles demandait un build puis
 * une soumission au Play Store. Elles deviennent des données : on les crée, on
 * les renomme, on les range, on les éteint.
 */
@Entity({ tableName: 'home_sections' })
export class HomeSection {
  [OptionalProps]?: 'id' | 'icon' | 'active' | 'limit' | 'criteria' | 'productIds' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  /** Ce que l'acheteur lit au-dessus du rail. */
  @Property()
  title!: string

  /** Une ligne d'explication sous le titre, quand elle apporte quelque chose. */
  @Property({ nullable: true })
  subtitle?: string | null

  /**
   * Le pictogramme du rail, choisi dans une liste fermée.
   *
   * Une liste fermée et non un nom libre : l'application ne peut dessiner que
   * ce qu'elle embarque, et un nom inconnu laisserait un trou. Vide donne le
   * pictogramme par défaut.
   */
  @Property({ nullable: true })
  icon?: string | null

  @Enum({ items: () => HomeSectionMode })
  mode!: HomeSectionMode

  @Property({ type: 'json', nullable: true })
  criteria?: HomeSectionCriteria | null

  /** Les produits d'une section composée à la main, dans l'ordre voulu. */
  @Property({ fieldName: 'product_ids', type: 'json', nullable: true })
  productIds?: string[] | null

  /**
   * L'ordre d'affichage.
   *
   * Un entier plutôt qu'une position implicite : réordonner ne doit pas
   * dépendre de la date de création, et deux sections peuvent se croiser sans
   * que rien ne casse.
   */
  @Property()
  position!: number

  /**
   * Éteinte plutôt que supprimée.
   *
   * Une section saisonnière revient chaque année ; la refaire à chaque fois
   * ferait perdre ses critères.
   */
  @Property({ default: true })
  active: boolean = true

  /** Combien de produits le rail montre. */
  @Property({ default: 10 })
  limit: number = 10

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
