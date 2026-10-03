import { Entity, Enum, Index, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'

/** What the money movement was for, on our side. */
export enum ProviderTransactionKind {
  /** A wallet topup (buyer, shop or courier). Subject: `wallet_topups.id`. */
  TOPUP = 'TOPUP',
  /** The single payment of a cart. Subject: `checkouts.id`. */
  CART_PAYMENT = 'CART_PAYMENT',
  /** A withdrawal paid out to a Mobile Money number. Subject: `withdrawal_requests.id`. */
  PAYOUT = 'PAYOUT',
}

export enum ProviderTransactionStatus {
  /** Opened, or opened and not yet resolved at the provider. */
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  /**
   * Still pending at the provider long after the page was opened: the buyer
   * walked away. Kept under watch a while longer, since a late payment must
   * still be honoured.
   */
  ABANDONED = 'ABANDONED',
}

/**
 * One operation sent to a payment provider, whatever came of it.
 *
 * The business rows (topup, checkout, withdrawal) only tell the outcome the
 * business cares about, and a retried cart payment overwrote the reference of
 * the attempt before it. This journal keeps every attempt: opened before the
 * provider is called, so even an opening that fails leaves its line, then
 * updated each time the provider is asked. It is what support reads when a
 * customer says « I paid ».
 */
@Entity({ tableName: 'provider_transactions' })
@Index({ properties: ['status', 'createdAt'] })
export class ProviderTransaction {
  [OptionalProps]?: 'id' | 'status' | 'reference' | 'providerStatus' | 'failureReason' | 'lastCheckedAt' | 'settledAt' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  /** `PaymentProvider` value: `intram`, `fedapay`… */
  @Property({ length: 32 })
  provider!: string

  @Enum({ items: () => ProviderTransactionKind })
  kind!: ProviderTransactionKind

  /** The topup, checkout or withdrawal this operation belongs to. */
  @Index()
  @Property({ fieldName: 'subject_id', type: 'uuid' })
  subjectId!: string

  /** The provider's reference, known once the operation was accepted. */
  @Index()
  @Property({ type: 'text', nullable: true })
  reference: string | null = null

  /** In FCFA, as sent to the provider. */
  @Property({ type: 'int' })
  amount!: number

  @Enum({ items: () => ProviderTransactionStatus, default: ProviderTransactionStatus.PENDING })
  status: ProviderTransactionStatus = ProviderTransactionStatus.PENDING

  /** The provider's last answer, as mapped by the gateway (`pending`, `failed`…). */
  @Property({ fieldName: 'provider_status', length: 32, nullable: true })
  providerStatus: string | null = null

  @Property({ fieldName: 'failure_reason', type: 'text', nullable: true })
  failureReason: string | null = null

  @Property({ fieldName: 'last_checked_at', type: 'Date', nullable: true })
  lastCheckedAt: Date | null = null

  @Property({ fieldName: 'settled_at', type: 'Date', nullable: true })
  settledAt: Date | null = null

  @Property({ fieldName: 'created_at', type: 'Date' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updated_at', type: 'Date', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
