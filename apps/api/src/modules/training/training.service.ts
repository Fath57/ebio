import type { CompletionResult, UserProgress } from './contracts/training.contract'
import { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import { Injectable, NotFoundException } from '@nestjs/common'
import { User } from '../auth/auth.entity'
import { TrainingCompletion } from './entities/training-completion.entity'
import { TrainingFormat, TrainingModule } from './entities/training-module.entity'

const PASSING_SCORE = 60

interface ModuleFilters {
  theme?: string
  format?: TrainingFormat
  page?: number
  limit?: number
}

@Injectable()
export class TrainingService {
  constructor(private readonly em: EntityManager) {}

  async getModules(filters: ModuleFilters): Promise<{
    modules: TrainingModule[]
    total: number
    hasMore: boolean
  }> {
    const page = filters.page ?? 1
    const limit = filters.limit ?? 20

    const where: FilterQuery<TrainingModule> = {}
    if (filters.theme)
      where.theme = filters.theme
    if (filters.format)
      where.format = filters.format

    const [modules, total] = await this.em.findAndCount(TrainingModule, where, {
      orderBy: { createdAt: 'DESC' },
      limit,
      offset: (page - 1) * limit,
    })

    return { modules, total, hasMore: page * limit < total }
  }

  async getModuleById(id: string): Promise<TrainingModule> {
    const module = await this.em.findOne(TrainingModule, { id })
    if (!module)
      throw new NotFoundException('Module de formation introuvable')
    return module
  }

  async getDownloadUrl(id: string): Promise<{ url: string }> {
    const module = await this.getModuleById(id)
    if (!module.downloadable) {
      throw new NotFoundException('Ce module ne peut pas etre telecharge')
    }

    module.downloadCount += 1
    await this.em.flush()

    // In production, generate a signed URL from S3/MinIO
    const signedUrl = `${module.contentUrl}?token=${Date.now()}&expires=${Date.now() + 3600000}`
    return { url: signedUrl }
  }

  async completeModule(
    userId: string,
    moduleId: string,
    answers: Record<string, unknown>[],
  ): Promise<CompletionResult> {
    const module = await this.getModuleById(moduleId)

    const existing = await this.em.findOne(TrainingCompletion, {
      user: { id: userId },
      module: { id: moduleId },
    })

    const score = this.calculateScore(module.quizData, answers)
    const passed = score >= PASSING_SCORE

    if (existing) {
      existing.quizScore = score
      existing.completedAt = new Date()
    }
    else {
      this.em.create(TrainingCompletion, {
        user: this.em.getReference(User, userId),
        module: this.em.getReference(TrainingModule, moduleId),
        quizScore: score,
      })
    }

    await this.em.flush()

    return { score, passed, badgeAwarded: passed }
  }

  async getUserProgress(userId: string): Promise<UserProgress> {
    const completions = await this.em.find(
      TrainingCompletion,
      { user: { id: userId }, quizScore: { $gte: PASSING_SCORE } },
      { populate: ['module'], orderBy: { completedAt: 'DESC' } },
    )

    const totalModules = await this.em.count(TrainingModule)

    const badges = completions.map(c => ({
      moduleId: c.module.id,
      moduleTitle: c.module.title,
      score: c.quizScore,
      completedAt: c.completedAt.toISOString(),
    }))

    return {
      completedCount: completions.length,
      totalModules,
      badges,
    }
  }

  private calculateScore(
    quizData: Record<string, unknown> | undefined,
    answers: Record<string, unknown>[],
  ): number {
    if (!quizData || !Array.isArray(quizData.questions)) {
      return 100
    }

    const questions = quizData.questions as Array<{ correctAnswer: unknown }>
    if (questions.length === 0)
      return 100

    let correctCount = 0
    for (let i = 0; i < questions.length; i++) {
      const question = questions[i]
      const answer = answers[i]
      if (answer && question && JSON.stringify(answer) === JSON.stringify(question.correctAnswer)) {
        correctCount++
      }
    }

    return Math.round((correctCount / questions.length) * 100)
  }
}
