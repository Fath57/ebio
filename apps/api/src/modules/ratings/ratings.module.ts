import { Module } from '@nestjs/common'
import { NotificationsModule } from '../notifications/notifications.module'
import { PlatformSettingsModule } from '../settings/platform-settings.module'
import { FraudDetectionService } from './fraud-detection.service'
import { ProductReviewInvitesService } from './product-review-invites.service'
import { ProductReviewsController } from './product-reviews.controller'
import { ProductReviewsService } from './product-reviews.service'
import { RatingsController } from './ratings.controller'
import { RatingsService } from './ratings.service'

// FraudDetectionService was declared but wired nowhere — neither provided nor
// injected — so nothing it contains had ever run. It is provided here because
// the product reviews call it.
@Module({
  imports: [NotificationsModule, PlatformSettingsModule],
  controllers: [RatingsController, ProductReviewsController],
  providers: [RatingsService, ProductReviewsService, FraudDetectionService, ProductReviewInvitesService],
  exports: [RatingsService, ProductReviewsService],
})
export class RatingsModule {}
