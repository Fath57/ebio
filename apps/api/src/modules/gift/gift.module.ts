import { forwardRef, Module } from '@nestjs/common'
import { SmsModule } from '../../common/sms.module'
import { EmailModule } from '../email/email.module'
import { MediaModule } from '../media/media.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { OrdersModule } from '../orders/orders.module'
import { PaymentsModule } from '../payments/payments.module'
import { GiftFailureService } from './gift-failure.service'
import { GiftNotifierService } from './gift-notifier.service'
import { GiftProofPurgeScheduler } from './gift-proof-purge.scheduler'
import { GiftTrackingController } from './gift-tracking.controller'
import { GiftTrackingService } from './gift-tracking.service'
import { GiftViewService } from './gift-view.service'
import { ReceivedOrdersService } from './received-orders.service'

/**
 * Ordering for a relative (009): what is said to the relative and to the
 * payer, what a failed hand-over does with the money, the public tracking
 * link, the carts the relative received, and the purge of hand-over photos.
 *
 * Payments, orders and deliveries all call in here, and the failure path
 * calls back into orders and payments: hence the forwardRefs, on both sides.
 */
@Module({
  imports: [
    SmsModule,
    EmailModule,
    MediaModule,
    NotificationsModule,
    forwardRef(() => PaymentsModule),
    forwardRef(() => OrdersModule),
  ],
  controllers: [GiftTrackingController],
  providers: [GiftNotifierService, GiftFailureService, GiftViewService, GiftTrackingService, ReceivedOrdersService, GiftProofPurgeScheduler],
  exports: [GiftNotifierService, GiftFailureService, GiftViewService, ReceivedOrdersService],
})
export class GiftModule {}
