import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import type { CampaignInput, CampaignTest } from './contracts/campaign.contract'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { CanManage, CanRead } from '../../common/decorators/check-permissions.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { CampaignsService } from './campaigns.service'
import { campaignInputSchema, campaignTestSchema } from './contracts/campaign.contract'
import { CampaignSegment } from './entities/campaign.entity'

/**
 * Broadcast notifications, from the back-office.
 *
 * Under `manage Settings` rather than a permission of its own: writing to
 * every phone at once is not an everyday act, and it should take the same
 * standing as changing what the platform does.
 */
/**
 * What the app reports back.
 *
 * Separate from the admin controller: this is written to by every phone, not
 * by the few people who compose campaigns.
 */
@Controller('campaigns')
@UseGuards(AuthGuard)
export class CampaignFeedbackController {
  constructor(private readonly campaigns: CampaignsService) {}

  /** Called when someone taps the notification. Counted once per person. */
  @Post(':id/opened')
  async opened(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
  ) {
    await this.campaigns.recordOpen(id, session.user.id)
    return { recorded: true }
  }
}

@Controller('admin/campaigns')
@UseGuards(AuthGuard, RolesGuard, CaslGuard)
@Roles('ADMIN')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @CanRead('Settings')
  @Get()
  async list() {
    return { campaigns: await this.campaigns.list() }
  }

  /** How many phones a segment reaches — asked while the message is written. */
  @CanRead('Settings')
  @Get('reach')
  async reach(@Query('app') app?: string, @Query('segment') segment?: string) {
    const variant = app === 'supplier' || app === 'courier' ? app : 'client'
    const which = segment && segment in CampaignSegment
      ? CampaignSegment[segment as keyof typeof CampaignSegment]
      : CampaignSegment.ALL
    return { app: variant, segment: which, count: await this.campaigns.countFor(variant, which) }
  }

  @CanManage('Settings')
  @Post()
  async create(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(campaignInputSchema) body: CampaignInput,
  ) {
    return this.campaigns.create(body, session.user.id)
  }

  /** One phone first. A campaign cannot be taken back once it has gone. */
  @CanManage('Settings')
  @Post(':id/test')
  async test(
    @Param('id') id: string,
    @TypedBody(campaignTestSchema) body: CampaignTest,
  ) {
    return this.campaigns.sendTest(id, body.userId)
  }

  @CanManage('Settings')
  @Post(':id/send')
  async send(@Param('id') id: string) {
    return this.campaigns.send(id)
  }

  @CanManage('Settings')
  @Post(':id/cancel')
  async cancel(@Param('id') id: string) {
    return this.campaigns.cancel(id)
  }
}
