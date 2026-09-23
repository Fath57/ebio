import type { Rel } from '@mikro-orm/core'
import { Entity, Index, ManyToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { AssistantSession } from './assistant-session.entity'

/**
 * Un tour de parole, et ce qu'il a coûté.
 *
 * Les jetons et le coût ne sont pas de la curiosité : sans eux, la décision
 * d'ouvrir l'assistant à tous se prendrait au doigt mouillé. Et le coût qui
 * compte est celui d'une commande **aboutie**, pas d'une conversation.
 */
@Entity({ tableName: 'assistant_turns' })
@Index({ properties: ['session', 'createdAt'] })
export class AssistantTurn {
  [OptionalProps]?: 'id' | 'toolCalls' | 'inputTokens' | 'outputTokens' | 'createdAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => AssistantSession, { fieldName: 'session_id' })
  session!: Rel<AssistantSession>

  /** Ce que l'acheteur a dit — transcrit, le jour où il y aura du son. */
  @Property({ type: 'text' })
  input!: string

  /** Ce que l'assistant a répondu. */
  @Property({ type: 'text', nullable: true })
  output?: string

  /** Les outils appelés pendant ce tour : un ancrage qu'on ne peut pas relire n'en est pas un. */
  @Property({ type: 'jsonb', fieldName: 'tool_calls', default: '[]' })
  toolCalls: unknown[] = []

  @Property({ fieldName: 'input_tokens', default: 0 })
  inputTokens: number = 0

  @Property({ fieldName: 'output_tokens', default: 0 })
  outputTokens: number = 0

  /** En FCFA, arrondi au centième. Nul tant que le tarif n'est pas renseigné. */
  @Property({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  cost?: string

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()
}
