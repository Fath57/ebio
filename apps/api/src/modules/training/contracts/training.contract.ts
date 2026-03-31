import { z } from 'zod'

export const trainingFormatEnum = z.enum(['VIDEO', 'AUDIO', 'ILLUSTRATED']).meta({
  title: 'TrainingFormat',
  description: 'Format of the training module content',
})

export const trainingModuleSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  theme: z.string(),
  format: trainingFormatEnum,
  durationSeconds: z.number().int(),
  thumbnailUrl: z.string(),
  downloadable: z.boolean(),
  downloadCount: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).meta({
  title: 'TrainingModule',
  description: 'A training module available on the platform',
})

export const trainingModuleDetailSchema = trainingModuleSchema.extend({
  contentUrl: z.string(),
  quizData: z.record(z.string(), z.unknown()).nullable(),
}).meta({
  title: 'TrainingModuleDetail',
  description: 'Training module with content URL and quiz data',
})

export const trainingModuleListSchema = z.object({
  modules: z.array(trainingModuleSchema),
  total: z.number().int(),
  hasMore: z.boolean(),
}).meta({
  title: 'TrainingModuleList',
  description: 'Paginated list of training modules',
})

export const completeModuleSchema = z.object({
  answers: z.array(z.record(z.string(), z.unknown())),
}).meta({
  title: 'CompleteModule',
  description: 'Answers submitted to complete a training module quiz',
})

export const completionResultSchema = z.object({
  score: z.number(),
  passed: z.boolean(),
  badgeAwarded: z.boolean(),
}).meta({
  title: 'CompletionResult',
  description: 'Result after completing a training module',
})

export const userProgressSchema = z.object({
  completedCount: z.number().int(),
  totalModules: z.number().int(),
  badges: z.array(z.object({
    moduleId: z.string().uuid(),
    moduleTitle: z.string(),
    score: z.number(),
    completedAt: z.string().datetime(),
  })),
}).meta({
  title: 'UserProgress',
  description: 'User training progress summary',
})

export type TrainingModuleResponse = z.infer<typeof trainingModuleSchema>
export type TrainingModuleDetail = z.infer<typeof trainingModuleDetailSchema>
export type CompleteModule = z.infer<typeof completeModuleSchema>
export type CompletionResult = z.infer<typeof completionResultSchema>
export type UserProgress = z.infer<typeof userProgressSchema>
