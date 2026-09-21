import { forwardRef, Module } from '@nestjs/common'
import { DeliveriesModule } from '../deliveries/deliveries.module'
import { EmailModule } from '../email/email.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { PaymentsModule } from '../payments/payments.module'
import { ProductsModule } from '../products/products.module'
import { PromoCodesModule } from '../promo-codes/promo-codes.module'
import { PlatformSettingsModule } from '../settings/platform-settings.module'
import { SuppliersModule } from '../suppliers/suppliers.module'
import { WalletModule } from '../wallet/wallet.module'
import { CheckoutService } from './checkout.service'
import { OrderEmailsModule } from './order-emails.module'
import { OrdersController } from './orders.controller'
import { OrdersService } from './orders.service'

@Module({
  imports: [OrderEmailsModule, EmailModule, NotificationsModule, PaymentsModule, PromoCodesModule, ProductsModule, SuppliersModule, WalletModule, PlatformSettingsModule, forwardRef(() => DeliveriesModule)],
  controllers: [OrdersController],
  providers: [OrdersService, CheckoutService],
  exports: [OrdersService, CheckoutService],
})
export class OrdersModule {}
