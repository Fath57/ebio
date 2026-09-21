import type { Rel } from '@mikro-orm/core'
import { Entity, Index, ManyToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { CourierProfile } from './courier-profile.entity'
import { DeliveryRun } from './delivery-run.entity'
import { Delivery } from './delivery.entity'

export enum DeliveryOfferResponse {
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
  EXPIRED = 'EXPIRED',
  /** The run left the courier's hands another way (admin, cancellation, broadcast claim). */
  SUPERSEDED = 'SUPERSEDED',
}

/**
 * One targeted offer of a run to one courier. The history feeds the
 * courier's acceptance rate and lets the back-office see who was asked.
 */
@Entity({ tableName: 'delivery_offers' })
@Index({ properties: ['courier', 'offeredAt'] })
export class DeliveryOffer {
  [OptionalProps]?: 'id' | 'offeredAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  /**
   * L'objet proposé : une course isolée, ou une tournée. Jamais les deux —
   * une contrainte en base le garantit, parce que deux cibles pour une offre
   * laisseraient deux réponses possibles pour un seul refus.
   */
  @ManyToOne(() => Delivery, { fieldName: 'delivery_id', deleteRule: 'cascade', nullable: true })
  @Index()
  delivery?: Rel<Delivery> | null

  @ManyToOne(() => DeliveryRun, { fieldName: 'delivery_run_id', deleteRule: 'cascade', nullable: true })
  @Index()
  deliveryRun?: Rel<DeliveryRun> | null

  @ManyToOne(() => CourierProfile, { fieldName: 'courier_id', deleteRule: 'cascade' })
  courier!: Rel<CourierProfile>

  @Property({ type: 'int' })
  round!: number

  /** Ranking score at offer time (lower is better); kept for tuning. */
  @Property({ type: 'float', nullable: true })
  score?: number

  @Property({ fieldName: 'offered_at' })
  offeredAt: Date = new Date()

  @Property({ fieldName: 'expires_at' })
  expiresAt!: Date

  @Property({ fieldName: 'responded_at', nullable: true })
  respondedAt?: Date

  @Property({ type: 'string', length: 16, nullable: true })
  response?: DeliveryOfferResponse
}
