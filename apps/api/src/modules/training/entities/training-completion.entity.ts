import type { Rel } from '@mikro-orm/core'
import { Entity, ManyToOne, OptionalProps, PrimaryKey, Property, Unique } from '@mikro-orm/core'
import { User } from '../../auth/auth.entity'
import { TrainingModule } from './training-module.entity'

@Entity({ tableName: 'training_completions' })
@Unique({ properties: ['user', 'module'] })
export class TrainingCompletion {
  [OptionalProps]?: 'id' | 'completedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => User, { fieldName: 'user_id' })
  user!: Rel<User>

  @ManyToOne(() => TrainingModule, { fieldName: 'module_id' })
  module!: Rel<TrainingModule>

  @Property({ fieldName: 'quiz_score', type: 'float' })
  quizScore!: number

  @Property({ fieldName: 'completed_at' })
  completedAt: Date = new Date()
}
