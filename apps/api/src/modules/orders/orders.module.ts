import { forwardRef, Module } from '@nestjs/common'
import { DeliveriesModule } from '../deliveries/deliveries.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { PaymentsModule } from '../payments/payments.module'
import { PromoCodesModule } from '../promo-codes/promo-codes.module'
import { SuppliersModule } from '../suppliers/suppliers.module'
import { WalletModule } from '../wallet/wallet.module'
import { OrdersController } from './orders.controller'
import { OrdersService } from './orders.service'

@Module({
  imports: [NotificationsModule, PaymentsModule, PromoCodesModule, SuppliersModule, WalletModule, forwardRef(() => DeliveriesModule)],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
