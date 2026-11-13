import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import type { CreateRelative, UpdateRelative } from './contracts/relative.contract'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { createRelativeSchema, updateRelativeSchema } from './contracts/relative.contract'
import { RelativesMapper } from './relatives.mapper'
import { RelativesService } from './relatives.service'

/** The signed-in payer's address book of relatives (009, US4). */
@Controller('relatives')
@UseGuards(AuthGuard)
export class RelativesController {
  constructor(private readonly relatives: RelativesService) {}

  @Get()
  async list(@Session() session: LoggedInBetterAuthSession) {
    const relatives = await this.relatives.list(session.user.id)
    return relatives.map(relative => RelativesMapper.toResponse(relative))
  }

  @Post()
  async create(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(createRelativeSchema) body: CreateRelative,
  ) {
    const relative = await this.relatives.create(session.user.id, body)
    return RelativesMapper.toResponse(relative)
  }

  @Patch(':id')
  async update(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id', ParseUUIDPipe) id: string,
    @TypedBody(updateRelativeSchema) body: UpdateRelative,
  ) {
    const relative = await this.relatives.update(session.user.id, id, body)
    return RelativesMapper.toResponse(relative)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.relatives.remove(session.user.id, id)
  }
}
