import { forwardRef, Module } from '@nestjs/common'
import { MediaModule } from '../media/media.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { OrdersModule } from '../orders/orders.module'
import { PlatformSettingsModule } from '../settings/platform-settings.module'
import { WalletModule } from '../wallet/wallet.module'
import { AdminCouriersController } from './admin-couriers.controller'
import { AdminCouriersService } from './admin-couriers.service'
import { CouriersController } from './couriers.controller'
import { DeliveriesController } from './deliveries.controller'
import { DeliveriesService } from './deliveries.service'
import { ORDER_DELIVERY_HOOKS } from './deliveries.tokens'
import { DispatchService } from './dispatch.service'

// forwardRef at the module level only: OrdersService reaches DeliveriesService
// through the ORDER_DELIVERY_HOOKS token (no service-level import cycle).
@Module({
  imports: [MediaModule, NotificationsModule, WalletModule, PlatformSettingsModule, forwardRef(() => OrdersModule)],
  controllers: [CouriersController, DeliveriesController, AdminCouriersController],
  providers: [
    DeliveriesService,
    DispatchService,
    AdminCouriersService,
    { provide: ORDER_DELIVERY_HOOKS, useExisting: DeliveriesService },
  ],
  exports: [DeliveriesService, DispatchService, ORDER_DELIVERY_HOOKS],
})
export class DeliveriesModule {}
