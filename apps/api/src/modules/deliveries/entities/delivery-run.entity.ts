import type { Rel } from '@mikro-orm/core'
import { Collection, Entity, Enum, Index, ManyToOne, OneToMany, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { Checkout } from '../../payments/entities/checkout.entity'
import { CourierProfile } from './courier-profile.entity'
import { Delivery } from './delivery.entity'
import { DispatchPhase } from './dispatch-phase.enum'

/**
 * Une tournée : les livraisons d'un même passage en caisse, confiées à un seul
 * livreur qui collecte chez chaque boutique puis remet une fois.
 *
 * Chaque `Delivery` reste 1-1 avec sa commande — statut, événements et preuve
 * de remise ne bougent pas, et les écrans fournisseur non plus. C'est la
 * tournée qui devient l'unité de diffusion, d'acceptation et de rémunération.
 */
export enum DeliveryRunStatus {
  AWAITING_COURIER = 'AWAITING_COURIER',
  /** 15 min sans preneur : le back-office peut attribuer à la main. */
  ESCALATED = 'ESCALATED',
  /** 30 min sans preneur : l'acheteur choisit d'attendre ou d'annuler. */
  BUYER_DECISION = 'BUYER_DECISION',
  ACCEPTED = 'ACCEPTED',
  COLLECTING = 'COLLECTING',
  DELIVERING = 'DELIVERING',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

/** Comment s'est terminée la recherche d'un livreur. Sert à la mesure. */
export enum DeliveryRunOutcome {
  ACCEPTED = 'ACCEPTED',
  REFUSED_ALL = 'REFUSED_ALL',
  UNSERVED = 'UNSERVED',
  CANCELLED = 'CANCELLED',
}

@Entity({ tableName: 'delivery_runs' })
export class DeliveryRun {
  [OptionalProps]?: 'id' | 'status' | 'pickupOrder' | 'supplierIds' | 'deliveryFee' | 'courierEarning' | 'dispatchPhase' | 'shopCount' | 'offersSent' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  /**
   * Un panier produit autant de tournées que le regroupement en autorise : au
   * delà de deux boutiques, ou au delà de l'écart admis entre elles, il en
   * naît une seconde. Le lien n'est donc plus 1-1.
   */
  @Index()
  @ManyToOne(() => Checkout, { fieldName: 'checkout_id' })
  checkout!: Rel<Checkout>

  /**
   * Les boutiques que cette tournée collecte. Renseigné à l'ouverture, avant
   * qu'aucune livraison n'existe : c'est ce qui permet à chaque livraison de
   * rejoindre la bonne tournée quand sa commande naît.
   */
  @Property({ fieldName: 'supplier_ids', type: 'jsonb' })
  supplierIds: string[] = []

  /** Frais de cette tournée. Le panier en porte la somme, pas le détail. */
  @Property({ fieldName: 'delivery_fee', columnType: 'numeric(12,2)', default: 0 })
  deliveryFee: number = 0

  @Index()
  @ManyToOne(() => CourierProfile, { fieldName: 'courier_id', nullable: true })
  courier?: Rel<CourierProfile>

  @OneToMany(() => Delivery, delivery => delivery.deliveryRun)
  deliveries = new Collection<Delivery>(this)

  @Enum({ items: () => DeliveryRunStatus, default: DeliveryRunStatus.AWAITING_COURIER })
  status: DeliveryRunStatus = DeliveryRunStatus.AWAITING_COURIER

  /** Identifiants de livraison, dans l'ordre de passage chez les boutiques. */
  @Property({ fieldName: 'pickup_order', type: 'jsonb' })
  pickupOrder: string[] = []

  /** Distance de la tournée complète, collectes comprises. */
  @Property({ fieldName: 'total_distance_km', type: 'double', nullable: true })
  totalDistanceKm?: number

  /** Rémunération de la tournée, et non par commande transportée. */
  @Property({ fieldName: 'courier_earning', columnType: 'numeric(12,2)', default: 0 })
  courierEarning: number = 0

  @Enum({ items: () => DispatchPhase, fieldName: 'dispatch_phase', default: DispatchPhase.TARGETED })
  dispatchPhase: DispatchPhase = DispatchPhase.TARGETED

  @Property({ fieldName: 'offer_expires_at', nullable: true })
  offerExpiresAt?: Date

  @Property({ fieldName: 'escalated_at', nullable: true })
  escalatedAt?: Date

  @Property({ fieldName: 'buyer_prompted_at', nullable: true })
  buyerPromptedAt?: Date

  /*
   * Mesure. Les seuils de regroupement — deux boutiques, 3 km entre elles —
   * sont posés, pas devinés ; ces colonnes servent à les ajuster sur des faits
   * plutôt que sur une intuition.
   */

  @Property({ fieldName: 'shop_count', default: 0 })
  shopCount: number = 0

  /** Écart entre les deux collectes les plus éloignées ; null si une position manque. */
  @Property({ fieldName: 'pickup_spread_km', type: 'double', nullable: true })
  pickupSpreadKm?: number

  @Property({ fieldName: 'offers_sent', default: 0 })
  offersSent: number = 0

  @Enum({ items: () => DeliveryRunOutcome, nullable: true })
  outcome?: DeliveryRunOutcome

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
