import type { Rel } from '@mikro-orm/core'
import { Entity, Enum, Index, ManyToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { User } from '../../auth/auth.entity'

export enum CheckoutAttemptKind {
  /** A quote: what the cart would cost. Nothing is created. */
  QUOTE = 'QUOTE',
  /** The real thing: orders are created and money moves. */
  ORDER = 'ORDER',
}

export enum CheckoutAttemptOutcome {
  OK = 'OK',
  REFUSED = 'REFUSED',
}

/**
 * What a buyer tried, and what the server answered.
 *
 * Written for the person who picks up the phone. "I can't order" is not a
 * question about the basket — the contents are almost never the problem — it
 * is a question about the refusal, and the refusal had nowhere to be read.
 *
 * On purpose it holds no product: counts and totals are enough to follow a
 * conversation, and the basket itself is read elsewhere, under its own
 * permission.
 */
@Entity({ tableName: 'checkout_attempts' })
export class CheckoutAttempt {
  [OptionalProps]?: 'id' | 'at' | 'detail' | 'distanceKm'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => User, { fieldName: 'user_id', deleteRule: 'cascade' })
  user!: Rel<User>

  @Enum({ items: () => CheckoutAttemptKind })
  kind!: CheckoutAttemptKind

  @Enum({ items: () => CheckoutAttemptOutcome })
  outcome!: CheckoutAttemptOutcome

  /**
   * Why it was refused, in the words the buyer saw.
   *
   * The server already writes its refusals for a human — "Hors zone de
   * livraison", "Solde insuffisant" — so the agent and the caller are reading
   * the same sentence. Null when nothing was refused.
   */
  @Property({ length: 300, nullable: true })
  detail?: string

  @Property({ fieldName: 'shop_count' })
  shopCount!: number

  @Property({ fieldName: 'item_count' })
  itemCount!: number

  @Property()
  total!: number

  @Property({ fieldName: 'distance_km', type: 'float', nullable: true })
  distanceKm?: number

  // Always read as "this person's last attempts", newest first.
  @Index()
  @Property()
  at: Date = new Date()
}
