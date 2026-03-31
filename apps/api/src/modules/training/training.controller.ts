import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import type { TrainingFormat } from './entities/training-module.entity'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { Public, Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { completeModuleSchema } from './contracts/training.contract'
import { TrainingService } from './training.service'

@Controller('training')
@UseGuards(AuthGuard)
export class TrainingController {
  constructor(private readonly trainingService: TrainingService) {}

  @Public()
  @Get('modules')
  async getModules(
    @Query('theme') theme?: string,
    @Query('format') format?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.trainingService.getModules({
      theme,
      format: format as TrainingFormat | undefined,
      page: Number(page),
      limit: Number(limit),
    })
  }

  @Public()
  @Get('modules/:id')
  async getModuleById(@Param('id') id: string) {
    return this.trainingService.getModuleById(id)
  }

  @Get('modules/:id/download')
  async getDownloadUrl(@Param('id') id: string) {
    return this.trainingService.getDownloadUrl(id)
  }

  @Post('modules/:id/complete')
  async completeModule(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') moduleId: string,
    @TypedBody(completeModuleSchema) body: z.infer<typeof completeModuleSchema>,
  ) {
    return this.trainingService.completeModule(session.user.id, moduleId, body.answers)
  }

  @Get('my-progress')
  async getMyProgress(@Session() session: LoggedInBetterAuthSession) {
    return this.trainingService.getUserProgress(session.user.id)
  }
}
