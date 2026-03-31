import { Entity, Enum, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'

export enum TrainingFormat {
  VIDEO = 'VIDEO',
  AUDIO = 'AUDIO',
  ILLUSTRATED = 'ILLUSTRATED',
}

@Entity({ tableName: 'training_modules' })
export class TrainingModule {
  [OptionalProps]?: 'id' | 'downloadable' | 'downloadCount' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property()
  title!: string

  @Property()
  theme!: string

  @Enum({ items: () => TrainingFormat })
  format!: TrainingFormat

  @Property({ fieldName: 'duration_seconds' })
  durationSeconds!: number

  @Property({ fieldName: 'content_url' })
  contentUrl!: string

  @Property({ fieldName: 'thumbnail_url' })
  thumbnailUrl!: string

  @Property({ fieldName: 'quiz_data', type: 'jsonb', nullable: true })
  quizData?: Record<string, unknown>

  @Property({ default: true })
  downloadable: boolean = true

  @Property({ fieldName: 'download_count', default: 0 })
  downloadCount: number = 0

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
