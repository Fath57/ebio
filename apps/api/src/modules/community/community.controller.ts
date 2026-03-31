import type { JwtAuthenticatedRequest } from '../../common/guards/jwt-auth.guard'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { CanCreate, CanRead } from '../../common/decorators/check-permissions.decorator'
import { Public } from '../../common/decorators/public.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CommunityService } from './community.service'

const createPublicationSchema = z.object({
  type: z.enum(['PRODUCT_ANNOUNCEMENT', 'TECHNICAL_QUESTION', 'MARKET_ALERT', 'TRAINING_SHARE']),
  content: z.string().min(10).max(2000),
  mediaUrls: z.array(z.string().url()).max(4).optional(),
}).meta({ title: 'CreatePublication' })

@Controller('groups')
export class CommunityController {
  constructor(private readonly communityService: CommunityService) {}

  @Public()
  @Get()
  async getGroups(
    @Query('type') type?: string,
    @Query('sector') sector?: string,
    @Query('region') region?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.communityService.getGroups({ type, sector, region, page: Number(page), limit: Number(limit) })
  }

  @Post(':id/join')
  @UseGuards(JwtAuthGuard, CaslGuard)
  @CanRead('CommunityGroup')
  async joinGroup(@Req() req: JwtAuthenticatedRequest, @Param('id') groupId: string) {
    await this.communityService.joinGroup(req.user.sub, groupId)
    return { joined: true }
  }

  @Delete(':id/leave')
  @UseGuards(JwtAuthGuard, CaslGuard)
  @CanRead('CommunityGroup')
  async leaveGroup(@Req() req: JwtAuthenticatedRequest, @Param('id') groupId: string) {
    await this.communityService.leaveGroup(req.user.sub, groupId)
    return { left: true }
  }

  @Public()
  @Get(':id/publications')
  async getPublications(
    @Param('id') groupId: string,
    @Query('type') type?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.communityService.getPublications(groupId, { type, page: Number(page), limit: Number(limit) })
  }

  @Post(':id/publications')
  @UseGuards(JwtAuthGuard, CaslGuard)
  @CanCreate('Publication')
  async createPublication(
    @Req() req: JwtAuthenticatedRequest,
    @Param('id') groupId: string,
    @TypedBody(createPublicationSchema) body: z.infer<typeof createPublicationSchema>,
  ) {
    return this.communityService.createPublication(req.user.sub, groupId, body)
  }

  @Post('publications/:id/report')
  @UseGuards(JwtAuthGuard, CaslGuard)
  @CanCreate('ContentReport')
  async reportPublication(
    @Req() req: JwtAuthenticatedRequest,
    @Param('id') publicationId: string,
    @TypedBody(z.object({ reason: z.string() })) body: { reason: string },
  ) {
    await this.communityService.reportPublication(req.user.sub, publicationId, body.reason)
    return { reported: true }
  }

  @Public()
  @Get('publications/:id/share-url')
  async getShareUrl(@Param('id') publicationId: string) {
    return this.communityService.getShareUrl(publicationId)
  }
}
