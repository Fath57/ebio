import type { Rel } from '@mikro-orm/core'
import {
  Entity,
  Enum,
  Index,
  ManyToOne,
  OptionalProps,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/core'
import { User } from '../../auth/auth.entity'
import { ValidationStatus } from '../../suppliers/supplier.entity'

export enum VehicleType {
  MOTO = 'MOTO',
  BICYCLE = 'BICYCLE',
  CAR = 'CAR',
  ON_FOOT = 'ON_FOOT',
}

/**
 * Courier application + profile. Couriers form a shared eBio fleet: once
 * validated by an admin they can deliver for any supplier on the platform.
 */
@Entity({ tableName: 'courier_profiles' })
export class CourierProfile {
  [OptionalProps]?: 'id' | 'validationStatus' | 'isAvailable' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => User, { fieldName: 'user_id' })
  @Unique()
  user!: Rel<User>

  @Property({ fieldName: 'full_name' })
  fullName!: string

  @Property()
  phone!: string

  @Enum({ items: () => VehicleType, fieldName: 'vehicle_type' })
  vehicleType!: VehicleType

  /** Declared operating zone label (city picked on the map at registration). */
  @Property()
  zone!: string

  // Zone center + radius picked on the registration map. Dispatch falls back
  // to this circle when the live position is missing or stale.
  @Property({ fieldName: 'zone_latitude', type: 'float', nullable: true })
  zoneLatitude?: number

  @Property({ fieldName: 'zone_longitude', type: 'float', nullable: true })
  zoneLongitude?: number

  @Property({ fieldName: 'zone_radius_km', type: 'float', nullable: true })
  zoneRadiusKm?: number

  /** Media id of the identity document, same convention as Supplier. */
  @Property({ fieldName: 'identity_document', nullable: true })
  identityDocument?: string

  @Enum({ items: () => ValidationStatus, fieldName: 'validation_status', default: ValidationStatus.PENDING })
  validationStatus: ValidationStatus = ValidationStatus.PENDING

  @Property({ fieldName: 'rejection_reason', nullable: true })
  rejectionReason?: string

  /** Declared availability; only available + validated couriers receive offers. */
  @Property({ fieldName: 'is_available', default: false })
  isAvailable: boolean = false

  /**
   * Foreground-only position, written via raw SQL (ST_MakePoint). Dispatch
   * ignores positions older than 12h (see lastLocationAt).
   */
  @Property({ columnType: 'geography(Point, 4326)', fieldName: 'last_known_location', nullable: true })
  @Index({ type: 'GiST' })
  lastKnownLocation?: string

  @Property({ fieldName: 'last_location_at', nullable: true })
  lastLocationAt?: Date

  // Plain copies of lastKnownLocation, readable without PostGIS functions —
  // written by the same UPDATE, consumed by the buyer live-tracking map.
  @Property({ fieldName: 'last_latitude', type: 'float', nullable: true })
  lastLatitude?: number

  @Property({ fieldName: 'last_longitude', type: 'float', nullable: true })
  lastLongitude?: number

  @Property({ fieldName: 'validated_at', nullable: true })
  validatedAt?: Date

  @Property({ fieldName: 'validated_by', nullable: true })
  validatedBy?: string

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
