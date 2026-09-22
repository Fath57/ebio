import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { Public } from '../../common/decorators/public.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { createProductReviewsSchema, reportProductReviewSchema } from './contracts/product-review.contract'
import { ProductReviewsService } from './product-reviews.service'

@Controller()
export class ProductReviewsController {
  constructor(private readonly productReviews: ProductReviewsService) {}

  /** Public: a product page is readable without an account. */
  @Get('products/:id/reviews')
  @Public()
  async getProductReviews(
    @Param('id') productId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.productReviews.getProductReviews(productId, Number(page), Number(limit))
  }

  /** Feeds the rating step: the lines of a delivered order, and their reviews. */
  @Get('orders/:orderId/rateable-products')
  @UseGuards(AuthGuard)
  async getRateableProducts(
    @Session() session: LoggedInBetterAuthSession,
    @Param('orderId') orderId: string,
  ) {
    return this.productReviews.listRateableItems(orderId, session.user.id)
  }

  /**
   * The whole rating step in one call. Three products rated is one round
   * trip — on a mobile network, three sequential calls are three chances to
   * half-fail.
   */
  @Post('orders/:orderId/product-reviews')
  @UseGuards(AuthGuard)
  async createProductReviews(
    @Session() session: LoggedInBetterAuthSession,
    @Param('orderId') orderId: string,
    @TypedBody(createProductReviewsSchema) body: z.infer<typeof createProductReviewsSchema>,
  ) {
    return this.productReviews.createMany(orderId, session.user.id, body)
  }

  /** The review stays visible: a report asks for a decision, it is not one. */
  @Post('product-reviews/:id/report')
  @UseGuards(AuthGuard)
  async reportProductReview(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') reviewId: string,
    @TypedBody(reportProductReviewSchema) body: z.infer<typeof reportProductReviewSchema>,
  ) {
    return this.productReviews.reportReview(reviewId, session.user.id, body.reason)
  }

  /** The moderation queue, product reviews only. */
  @Get('admin/product-review-reports')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @UseGuards(AuthGuard, RolesGuard)
  async listReports() {
    return this.productReviews.listPendingReports()
  }

  /** Moderation: hiding pulls the review out of the lists and the average. */
  @Patch('admin/product-reviews/:id/visibility')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @UseGuards(AuthGuard, RolesGuard)
  async setVisibility(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') reviewId: string,
    @TypedBody(z.object({ hidden: z.boolean() })) body: { hidden: boolean },
  ) {
    return this.productReviews.setVisibility(reviewId, body.hidden, session.user.id)
  }
}
