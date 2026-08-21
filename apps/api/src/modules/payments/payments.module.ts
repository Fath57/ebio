import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Module } from '@nestjs/common'
import { NotificationsModule } from '../notifications/notifications.module'
import { Order } from '../orders/entities/order.entity'
import { WalletModule } from '../wallet/wallet.module'
import { CommissionService } from './commission.service'
import { PaymentMethod } from './entities/payment-method.entity'
import { EscrowSchedulerService } from './escrow-scheduler.service'
import { PaymentGatewayFactory } from './gateways/payment-gateway.factory'
import { PaymentMethodAdminController } from './payment-methods-admin.controller'
import { PaymentMethodPublicController } from './payment-methods-public.controller'
import { PaymentMethodService } from './payment-methods.service'
import { Payment } from './payment.entity'
import { PaymentsWebhookController } from './payments-webhook.controller'
import { PaymentsController } from './payments.controller'
import { PaymentsService } from './payments.service'
import { ReceiptService } from './receipt.service'

@Module({
  imports: [
    MikroOrmModule.forFeature([Payment, PaymentMethod, Order]),
    NotificationsModule,
    WalletModule,
  ],
  controllers: [
    PaymentsController,
    PaymentsWebhookController,
    PaymentMethodAdminController,
    PaymentMethodPublicController,
  ],
  providers: [
    PaymentsService,
    PaymentMethodService,
    PaymentGatewayFactory,
    CommissionService,
    ReceiptService,
    EscrowSchedulerService,
  ],
  exports: [PaymentsService, PaymentMethodService, CommissionService, ReceiptService],
})
export class PaymentsModule {}
