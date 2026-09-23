import type { Rel } from '@mikro-orm/core'
import { Entity, Index, ManyToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { User } from '../../auth/auth.entity'

/**
 * Une conversation avec l'assistant.
 *
 * C'est un **contexte**, pas un historique : il porte ce qu'il faut pour que
 * l'assistant suive le fil, et se purge au bout de quelques jours. Ce qui
 * mérite d'être gardé — la commande — l'est déjà ailleurs.
 */
@Entity({ tableName: 'assistant_sessions' })
@Index({ properties: ['buyer', 'createdAt'] })
export class AssistantSession {
  [OptionalProps]?: 'id' | 'messages' | 'state' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => User, { fieldName: 'buyer_id' })
  buyer!: Rel<User>

  /** Le fil tel que le modèle le voit, tours et appels d'outils compris. */
  @Property({ type: 'jsonb', default: '[]' })
  messages: unknown[] = []

  /**
   * Ce que la conversation a construit — le panier, pour l'instant.
   *
   * eBio n'a pas de panier côté serveur : il vit dans l'application. Celui de
   * l'assistant vit donc ici, et l'application le reprend quand la
   * conversation aboutit, plutôt que d'entretenir deux paniers serveur qui
   * divergeraient au premier défaut.
   */
  @Property({ type: 'jsonb', default: '{}' })
  state: Record<string, unknown> = {}

  @Property({ fieldName: 'closed_at', nullable: true })
  closedAt?: Date

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
