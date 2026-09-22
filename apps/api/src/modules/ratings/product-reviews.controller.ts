import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { Public } from '../../common/decorators/public.decorator'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { createProductReviewsSchema } from './contracts/product-review.contract'
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
}
