import type { Rel } from '@mikro-orm/core'
import { Collection, Entity, OneToMany, OneToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { User } from '../../auth/auth.entity'
import { CartItem } from './cart-item.entity'

/**
 * The basket, as the server knows it.
 *
 * It used to live only on the phone. That was enough to buy with, and wrong
 * for everything else: it did not follow its owner to another device, nobody
 * could be reminded of what they left behind, and support had nothing to look
 * at when someone called.
 *
 * One row per buyer, replaced whole on each sync. A basket has no history
 * worth keeping — only its current state and when it last moved.
 */
@Entity({ tableName: 'carts' })
export class Cart {
  [OptionalProps]?: 'id' | 'createdAt' | 'updatedAt' | 'remindedAt' | 'reminders'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @OneToOne(() => User, { fieldName: 'user_id', deleteRule: 'cascade', unique: true })
  user!: Rel<User>

  @OneToMany(() => CartItem, item => item.cart, { orphanRemoval: true })
  items = new Collection<CartItem>(this)

  /**
   * When the basket last changed.
   *
   * This is what "abandoned" is measured from, so it moves on a real change
   * and not on a sync that brought the same thing back.
   */
  @Property({ fieldName: 'updated_at' })
  updatedAt: Date = new Date()

  @Property({ fieldName: 'created_at' })
  createdAt: Date = new Date()

  /** Last reminder sent about this basket; cleared whenever it changes. */
  @Property({ fieldName: 'reminded_at', nullable: true })
  remindedAt?: Date

  /** How many reminders this basket has already drawn. */
  @Property({ default: 0 })
  reminders: number = 0
}
