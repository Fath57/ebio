import type { Rel } from '@mikro-orm/core'
import { Entity, Enum, Index, ManyToOne, OptionalProps, PrimaryKey, Property, Unique } from '@mikro-orm/core'
import { User } from '../auth/auth.entity'

export enum ReferralStatus {
  /** Le lien est noué, la récompense attend la première commande livrée. */
  PENDING = 'PENDING',
  /** Les deux portefeuilles ont été crédités. */
  REWARDED = 'REWARDED',
}

/**
 * Un parrainage : qui a amené qui, et ce que ça leur a rapporté.
 *
 * Le filleul est unique — on ne peut être parrainé qu'une fois, et seulement
 * avant sa première commande livrée. Sans cette règle, un client de longue
 * date pourrait se faire « parrainer » le jour où il apprend que ça rapporte.
 *
 * La récompense n'est versée qu'à la livraison : ni l'inscription ni le
 * paiement ne prouvent qu'il y a quelqu'un au bout. C'est la seule barrière
 * sérieuse contre les faux comptes, et elle ne coûte rien à tenir.
 */
@Entity({ tableName: 'referrals' })
@Unique({ properties: ['referee'] })
export class Referral {
  [OptionalProps]?: 'id' | 'status' | 'sponsorAmount' | 'refereeAmount' | 'createdAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  /** Celui qui a donné son code. */
  @Index()
  @ManyToOne(() => User, { fieldName: 'sponsor_id' })
  sponsor!: Rel<User>

  /** Celui qui l'a saisi. Une seule fois dans sa vie. */
  @ManyToOne(() => User, { fieldName: 'referee_id' })
  referee!: Rel<User>

  /** Le code tel qu'il a été saisi, gardé même si le parrain le change. */
  @Property({ length: 16 })
  code!: string

  @Enum({ items: () => ReferralStatus, default: ReferralStatus.PENDING })
  status: ReferralStatus = ReferralStatus.PENDING

  /**
   * Montants figés au moment du versement.
   *
   * Le barème se règle au back-office : le relire plus tard donnerait un
   * historique qui change tout seul. Ce qui a été versé reste écrit ici.
   */
  @Property({ fieldName: 'sponsor_amount', type: 'int', default: 0 })
  sponsorAmount: number = 0

  @Property({ fieldName: 'referee_amount', type: 'int', default: 0 })
  refereeAmount: number = 0

  /** La commande livrée qui a déclenché le versement. */
  @Property({ fieldName: 'order_id', type: 'uuid', nullable: true })
  orderId?: string | null

  @Property({ fieldName: 'rewarded_at', type: 'Date', nullable: true })
  rewardedAt?: Date | null

  @Property({ fieldName: 'created_at', type: 'Date' })
  createdAt: Date = new Date()
}
