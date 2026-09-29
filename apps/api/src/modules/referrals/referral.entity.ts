import type { Rel } from '@mikro-orm/core'
import { Entity, Enum, Index, ManyToOne, OptionalProps, PrimaryKey, Property, Unique } from '@mikro-orm/core'
import { User } from '../auth/auth.entity'

export enum ReferralStatus {
  /** The link is made; the reward waits for the first delivered order. */
  PENDING = 'PENDING',
  /** Both wallets have been credited. */
  REWARDED = 'REWARDED',
}

/**
 * A referral: who brought whom, and what it earned them.
 *
 * The referee is unique — one can only be referred once, and only before
 * their first delivered order. Without that rule a long-standing customer
 * could get themselves "referred" the day they learn it pays.
 *
 * The reward is paid on delivery and nowhere else: neither signing up nor
 * paying proves there is someone at the other end. That is the only serious
 * barrier against fake accounts, and it costs nothing to hold.
 */
@Entity({ tableName: 'referrals' })
@Unique({ properties: ['referee'] })
export class Referral {
  [OptionalProps]?: 'id' | 'status' | 'sponsorAmount' | 'refereeAmount' | 'createdAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  /** The one who gave out their code. */
  @Index()
  @ManyToOne(() => User, { fieldName: 'sponsor_id' })
  sponsor!: Rel<User>

  /** The one who entered it. Once in their life. */
  @ManyToOne(() => User, { fieldName: 'referee_id' })
  referee!: Rel<User>

  /** The code as entered, kept even if the sponsor changes theirs. */
  @Property({ length: 16 })
  code!: string

  @Enum({ items: () => ReferralStatus, default: ReferralStatus.PENDING })
  status: ReferralStatus = ReferralStatus.PENDING

  /**
   * Amounts frozen at payout time.
   *
   * The rates are set from the back-office: reading them again later would
   * give a history that rewrites itself. What was paid stays written here.
   */
  @Property({ fieldName: 'sponsor_amount', type: 'int', default: 0 })
  sponsorAmount: number = 0

  @Property({ fieldName: 'referee_amount', type: 'int', default: 0 })
  refereeAmount: number = 0

  /** The delivered order that triggered the payout. */
  @Property({ fieldName: 'order_id', type: 'uuid', nullable: true })
  orderId?: string | null

  @Property({ fieldName: 'rewarded_at', type: 'Date', nullable: true })
  rewardedAt?: Date | null

  @Property({ fieldName: 'created_at', type: 'Date' })
  createdAt: Date = new Date()
}
