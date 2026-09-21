import type { Rel } from '@mikro-orm/core'
import { Collection, Entity, Enum, Index, ManyToOne, OneToMany, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { User } from '../../auth/auth.entity'
import { Payment } from '../payment.entity'

/**
 * Un passage en caisse : l'acheteur paie une fois pour un panier qui peut
 * couvrir plusieurs boutiques.
 *
 * Le checkout ne porte que ce qui est réellement commun aux commandes —
 * la transaction chez le prestataire, le moyen de paiement, l'adresse, le
 * total encaissé. Chaque `Payment` reste propriétaire d'un `@OneToOne(Order)`,
 * de sorte que l'escrow continue de libérer les fonds commande par commande :
 * une boutique est payée au rythme de la sienne, pas de la plus lente.
 */
export enum CheckoutStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  DISPATCHED = 'DISPATCHED',
  /** Au moins une commande dédommagée, mais pas toutes. */
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
  REFUNDED = 'REFUNDED',
  FAILED = 'FAILED',
}

export enum CheckoutDeliveryMode {
  DELIVERY = 'DELIVERY',
  ON_SITE = 'ON_SITE',
}

@Entity({ tableName: 'checkouts' })
export class Checkout {
  [OptionalProps]?: 'id' | 'status' | 'deliveryFee' | 'discount' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Index()
  @ManyToOne(() => User, { fieldName: 'buyer_id' })
  buyer!: Rel<User>

  @OneToMany(() => Payment, payment => payment.checkout)
  payments = new Collection<Payment>(this)

  /** Ce qui est réellement encaissé : articles − réduction + frais. */
  @Property({ fieldName: 'total_amount', columnType: 'numeric(12,2)' })
  totalAmount!: number

  @Property({ fieldName: 'items_total', columnType: 'numeric(12,2)' })
  itemsTotal!: number

  /** Frais uniques de la tournée, 0 en retrait sur place. */
  @Property({ fieldName: 'delivery_fee', columnType: 'numeric(12,2)', default: 0 })
  deliveryFee: number = 0

  /** Réduction du code promo, répartie au prorata entre les boutiques. */
  @Property({ columnType: 'numeric(12,2)', default: 0 })
  discount: number = 0

  @Property({ fieldName: 'payment_method' })
  paymentMethod!: string

  @Index()
  @Property({ fieldName: 'provider_transaction_id', nullable: true })
  providerTransactionId?: string

  @Enum({ items: () => CheckoutStatus, default: CheckoutStatus.PENDING })
  status: CheckoutStatus = CheckoutStatus.PENDING

  /** Un seul mode pour tout le panier : le mode mixte est hors périmètre v1. */
  @Enum({ items: () => CheckoutDeliveryMode, fieldName: 'delivery_mode' })
  deliveryMode!: CheckoutDeliveryMode

  @Property({ fieldName: 'delivery_address', type: 'text', nullable: true })
  deliveryAddress?: string

  @Property({ fieldName: 'delivery_latitude', type: 'double', nullable: true })
  deliveryLatitude?: number

  @Property({ fieldName: 'delivery_longitude', type: 'double', nullable: true })
  deliveryLongitude?: number

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
