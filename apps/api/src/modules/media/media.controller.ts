import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { completeUploadSchema, initiateUploadSchema } from './media.contract'
import { MediaMapper } from './media.mapper'
import { MediaService } from './media.service'

@Controller('media')
@UseGuards(AuthGuard)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  /**
   * Step 1: Request presigned upload URL(s).
   * For files > 5Mo, returns multiple part URLs for chunked upload.
   */
  @Post('upload')
  async initiateUpload(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(initiateUploadSchema) body: z.infer<typeof initiateUploadSchema>,
  ) {
    return this.mediaService.initiateUpload(session.user.id, body)
  }

  /**
   * Step 2: Notify upload complete, trigger optimization.
   */
  @Post('complete')
  async completeUpload(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(completeUploadSchema) body: z.infer<typeof completeUploadSchema>,
  ) {
    return this.mediaService.completeUpload(session.user.id, body)
  }

  /**
   * Get media by ID.
   */
  @Get(':id')
  async findById(@Param('id') id: string) {
    const media = await this.mediaService.findById(id)
    return MediaMapper.toResponse(media)
  }

  /**
   * Get signed download URL for private media (documents).
   */
  @Get(':id/download')
  async getDownloadUrl(
    @Param('id') id: string,
    @Query('expiresIn') expiresIn?: string,
  ) {
    const url = await this.mediaService.getSignedUrl(id, expiresIn ? Number(expiresIn) : undefined)
    return { downloadUrl: url }
  }

  /**
   * Get all media for an entity (e.g., product photos).
   */
  @Get('entity/:entityType/:entityId')
  async findByEntity(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    const items = await this.mediaService.findByEntity(entityType, entityId)
    return { media: items.map(MediaMapper.toResponse) }
  }

  /**
   * Delete a media.
   */
  @Delete(':id')
  async deleteMedia(@Param('id') id: string) {
    await this.mediaService.deleteMedia(id)
    return { deleted: true }
  }
}
