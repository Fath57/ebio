import { Module } from '@nestjs/common'
import { NotificationsModule } from '../notifications/notifications.module'
import { PlatformSettingsModule } from '../settings/platform-settings.module'
import { CartRemindersService } from './cart-reminders.service'
import { CartStatsService } from './cart-stats.service'
import { AdminCartsController, CartController } from './cart.controller'
import { CartService } from './cart.service'
import { CheckoutAttemptsService } from './checkout-attempts.service'

/**
 * The basket, on the server.
 *
 * It holds three things that all need the same table: the copy that follows a
 * buyer between phones, the reminder for what was left behind, and what the
 * back-office reads about either.
 */
@Module({
  imports: [NotificationsModule, PlatformSettingsModule],
  controllers: [CartController, AdminCartsController],
  providers: [CartService, CartStatsService, CartRemindersService, CheckoutAttemptsService],
  exports: [CartService, CheckoutAttemptsService],
})
export class CartModule {}
