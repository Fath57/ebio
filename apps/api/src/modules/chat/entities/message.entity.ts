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
import { User } from '../../auth/auth.entity'
import { Conversation } from './conversation.entity'

export enum MessageType {
  TEXT = 'TEXT',
  PHOTO = 'PHOTO',
  VOICE = 'VOICE',
  LOCATION = 'LOCATION',
}

@Entity({ tableName: 'messages' })
@Index({ properties: ['conversation', 'createdAt'] })
export class Message {
  [OptionalProps]?: 'id' | 'createdAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => Conversation, { fieldName: 'conversation_id' })
  conversation!: Rel<Conversation>

  @ManyToOne(() => User, { fieldName: 'sender_id' })
  sender!: Rel<User>

  @Enum({ items: () => MessageType })
  type!: MessageType

  @Property({ columnType: 'text', nullable: true })
  content?: string

  @Property({ fieldName: 'media_url', nullable: true })
  mediaUrl?: string

  @Property({ type: 'float', nullable: true })
  latitude?: number

  @Property({ type: 'float', nullable: true })
  longitude?: number

  @Property({ fieldName: 'read_at', nullable: true })
  readAt?: Date

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()
}
