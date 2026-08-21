import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { CanCreate } from '../../common/decorators/check-permissions.decorator'
import { Public } from '../../common/decorators/public.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { createReviewSchema } from './contracts/rating.contract'
import { RatingsService } from './ratings.service'

@Controller()
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}

  // Session auth like every buyer route — the JWT guard here belonged to the
  // chat module and rejected the app's session token as « expired ».
  @Post('reviews')
  @UseGuards(AuthGuard, CaslGuard)
  @CanCreate('Review')
  async createReview(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(createReviewSchema) body: z.infer<typeof createReviewSchema>,
  ) {
    return this.ratingsService.createReview(session.user.id, body)
  }

  @Public()
  @Get('suppliers/:id/reviews')
  async getSupplierReviews(
    @Param('id') supplierId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.ratingsService.getSupplierReviews(supplierId, Number(page), Number(limit))
  }

  @Public()
  @Get('suppliers/:id/badges')
  async getSupplierBadges(@Param('id') supplierId: string) {
    const badges = await this.ratingsService.getSupplierBadges(supplierId)
    return {
      badges: badges.map(b => ({
        type: b.type,
        grantedAt: b.grantedAt.toISOString(),
      })),
    }
  }

  @Post('reviews/:id/report')
  @UseGuards(AuthGuard, CaslGuard)
  @CanCreate('ContentReport')
  async reportReview(
    @Session() _session: LoggedInBetterAuthSession,
    @Param('id') _reviewId: string,
    @TypedBody(z.object({ reason: z.string().max(500) })) _body: { reason: string },
  ) {
    // Content report creation would use admin module's ContentReport entity
    return { reported: true }
  }
}
