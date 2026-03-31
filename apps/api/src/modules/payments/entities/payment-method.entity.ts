import {
  Entity,
  Enum,
  Index,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/core'
import { PaymentMethodType, PaymentProvider } from '../payment.entity'

@Entity({ tableName: 'payment_method' })
@Unique({ properties: ['code', 'countryCode', 'provider'] })
export class PaymentMethod {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property()
  name!: string

  @Property()
  @Index()
  code!: string

  @Enum({ items: () => PaymentMethodType })
  type!: PaymentMethodType

  @Enum({ items: () => PaymentProvider })
  provider!: PaymentProvider

  @Property({ fieldName: 'country_code', length: 3 })
  @Index()
  countryCode!: string

  @Property({ columnType: 'numeric(5,2)', default: '0.00' })
  commission: string = '0.00'

  @Property({ default: 0 })
  priority: number = 0

  @Property({ default: true })
  active: boolean = true

  @Property({ fieldName: 'use_fedapay_checkout', default: false })
  useFedapayCheckout: boolean = false

  @Property({ fieldName: 'supports_payout', default: false })
  supportsPayout: boolean = false

  @Property({ fieldName: 'supports_refund', default: false })
  supportsRefund: boolean = false

  @Property({ nullable: true })
  icon?: string

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
