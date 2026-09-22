import { Module } from '@nestjs/common'
import { FraudDetectionService } from './fraud-detection.service'
import { ProductReviewsController } from './product-reviews.controller'
import { ProductReviewsService } from './product-reviews.service'
import { RatingsController } from './ratings.controller'
import { RatingsService } from './ratings.service'

// FraudDetectionService was declared but wired nowhere — neither provided nor
// injected — so nothing it contains had ever run. It is provided here because
// the product reviews call it.
@Module({
  controllers: [RatingsController, ProductReviewsController],
  providers: [RatingsService, ProductReviewsService, FraudDetectionService],
  exports: [RatingsService, ProductReviewsService],
})
export class RatingsModule {}
