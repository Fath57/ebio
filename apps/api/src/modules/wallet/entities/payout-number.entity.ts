import type { Rel } from '@mikro-orm/core'
import { Entity, Enum, ManyToOne, OptionalProps, PrimaryKey, Property, Unique } from '@mikro-orm/core'
import { CourierProfile } from '../../deliveries/entities/courier-profile.entity'
import { Supplier } from '../../suppliers/supplier.entity'

export enum PayoutNumberStatus {
  PENDING = 'PENDING',
  VALIDATED = 'VALIDATED',
  REJECTED = 'REJECTED',
}

/**
 * A Mobile Money number a supplier or a courier wants their money sent to.
 * Exactly one owner (DB CHECK `payout_numbers_single_owner`). Every number
 * goes through an admin validation (anti-fraud checkpoint); only a VALIDATED
 * number can carry a withdrawal.
 */
@Entity({ tableName: 'payout_numbers' })
@Unique({ properties: ['supplier', 'phoneNumber'] })
@Unique({ properties: ['courier', 'phoneNumber'] })
export class PayoutNumber {
  [OptionalProps]?: 'id' | 'status' | 'createdAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => Supplier, { fieldName: 'supplier_id', nullable: true })
  supplier?: Rel<Supplier> | null

  @ManyToOne(() => CourierProfile, { fieldName: 'courier_profile_id', nullable: true })
  courier?: Rel<CourierProfile> | null

  @Property({ fieldName: 'phone_number', length: 20 })
  phoneNumber!: string

  /** FedaPay payout mode, derived from the number's prefix: mtn_open | moov | sbin. */
  @Property({ length: 20 })
  operator!: string

  @Property({ fieldName: 'holder_name', length: 100 })
  holderName!: string

  @Enum({ items: () => PayoutNumberStatus, default: PayoutNumberStatus.PENDING })
  status: PayoutNumberStatus = PayoutNumberStatus.PENDING

  @Property({ fieldName: 'rejection_reason', nullable: true })
  rejectionReason?: string | null

  @Property({ fieldName: 'validated_by', type: 'uuid', nullable: true })
  validatedBy?: string | null

  @Property({ fieldName: 'validated_at', nullable: true })
  validatedAt?: Date | null

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()
}
