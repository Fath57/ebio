import type { Rel } from '@mikro-orm/core'
import { Collection, Entity, Enum, Index, ManyToOne, OneToMany, OneToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
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
  [OptionalProps]?: 'id' | 'status' | 'pickupOrder' | 'courierEarning' | 'dispatchPhase' | 'shopCount' | 'offersSent' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @OneToOne(() => Checkout, { fieldName: 'checkout_id', owner: true, unique: true })
  checkout!: Rel<Checkout>

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
   * Mesure. Le regroupement est volontairement sans limite en v1 : ces trois
   * colonnes sont le seul moyen de poser ces limites plus tard sur des faits
   * plutôt que sur une intuition.
   */

  @Property({ fieldName: 'shop_count', default: 0 })
  shopCount: number = 0

  @Property({ fieldName: 'offers_sent', default: 0 })
  offersSent: number = 0

  @Enum({ items: () => DeliveryRunOutcome, nullable: true })
  outcome?: DeliveryRunOutcome

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
