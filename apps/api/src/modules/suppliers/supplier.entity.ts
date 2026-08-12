import type { Rel } from '@mikro-orm/core'
import {
  Entity,
  Enum,
  Index,
  ManyToOne,
  OptionalProps,
  PrimaryKey,
  Property,

} from '@mikro-orm/core'
import { User } from '../auth/auth.entity'

/** Fuseau par défaut : le marché eBio est béninois. */
export const DEFAULT_TIMEZONE = 'Africa/Porto-Novo'

export enum SupplierType {
  INPUTS = 'INPUTS',
  TRANSFORMER = 'TRANSFORMER',
}

export enum ValidationStatus {
  PENDING = 'PENDING',
  VALIDATED = 'VALIDATED',
  REJECTED = 'REJECTED',
  COMPLEMENT_REQUESTED = 'COMPLEMENT_REQUESTED',
  SUSPENDED = 'SUSPENDED',
}

export enum SupplierMode {
  CONTACT = 'CONTACT',
  ORDER = 'ORDER',
}

@Entity({ tableName: 'suppliers' })
export class Supplier {
  [OptionalProps]?: 'id' | 'validationStatus' | 'mode' | 'timezone' | 'totalReviews' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => User, { fieldName: 'user_id' })
  user!: Rel<User>

  @Property({ fieldName: 'shop_name' })
  shopName!: string

  @Enum({ items: () => SupplierType })
  type!: SupplierType

  @Property({ fieldName: 'cover_photo', nullable: true })
  coverPhoto?: string

  @Property({ fieldName: 'profile_photo', nullable: true })
  profilePhoto?: string

  @Property({ columnType: 'geography(Point, 4326)', nullable: true })
  @Index({ type: 'GiST' })
  location?: string

  @Property({ nullable: true })
  address?: string

  @Property({ nullable: true })
  neighborhood?: string

  @Property({ fieldName: 'mobile_money_number', nullable: true })
  mobileMoneyNumber?: string

  @Enum({ items: () => ValidationStatus, default: ValidationStatus.PENDING })
  @Property({ fieldName: 'validation_status' })
  validationStatus: ValidationStatus = ValidationStatus.PENDING

  @Enum({ items: () => SupplierMode, default: SupplierMode.ORDER })
  mode: SupplierMode = SupplierMode.ORDER

  @Property({ fieldName: 'opening_hours', type: 'jsonb', nullable: true })
  openingHours?: Record<string, unknown>

  /**
   * Fuseau IANA dans lequel `openingHours` doit être interprété. Les horaires
   * sont saisis en heure locale du commerce : sans ce repère, un serveur
   * hébergé ailleurs déclare les boutiques ouvertes au mauvais moment.
   */
  @Property({ default: DEFAULT_TIMEZONE })
  timezone: string = DEFAULT_TIMEZONE

  @Property({ fieldName: 'global_rating', type: 'float', nullable: true })
  globalRating?: number

  @Property({ fieldName: 'total_reviews', default: 0 })
  totalReviews: number = 0

  @Property({ fieldName: 'identity_document', nullable: true })
  identityDocument?: string

  @Property({ fieldName: 'business_proof', nullable: true })
  businessProof?: string

  @Property({ fieldName: 'validated_at', nullable: true })
  validatedAt?: Date

  @Property({ fieldName: 'validated_by', nullable: true })
  validatedBy?: string

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
