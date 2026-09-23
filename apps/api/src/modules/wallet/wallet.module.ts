import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Module } from '@nestjs/common'
import { NotificationsModule } from '../notifications/notifications.module'
import { PaymentGatewayFactory } from '../payments/gateways/payment-gateway.factory'
import { SuppliersModule } from '../suppliers/suppliers.module'
import { CourierWalletController } from './courier-wallet.controller'
import { PayoutNumber } from './entities/payout-number.entity'
import { WalletTopup } from './entities/wallet-topup.entity'
import { WalletTransaction } from './entities/wallet-transaction.entity'
import { Wallet } from './entities/wallet.entity'
import { WithdrawalRequest } from './entities/withdrawal-request.entity'
import { PlatformAccountsService } from './platform-accounts.service'
import { SupplierWalletController } from './supplier-wallet.controller'
import { TopupService } from './topup.service'
import { WalletAdminController } from './wallet-admin.controller'
import { WalletController } from './wallet.controller'
import { WalletService } from './wallet.service'
import { WithdrawalsService } from './withdrawals.service'

@Module({
  imports: [
    MikroOrmModule.forFeature([Wallet, WalletTransaction, WalletTopup, PayoutNumber, WithdrawalRequest]),
    NotificationsModule,
    SuppliersModule,
  ],
  controllers: [WalletController, SupplierWalletController, CourierWalletController, WalletAdminController],
  /**
   * The gateway factory is provided here rather than imported from
   * `PaymentsModule`: that module already imports this one, and a second
   * instance of a stateless factory costs nothing — far less than a circular
   * import held together by `forwardRef`.
   */
  providers: [WalletService, WithdrawalsService, TopupService, PlatformAccountsService, PaymentGatewayFactory],
  exports: [WalletService, WithdrawalsService, TopupService, PlatformAccountsService],
})
export class WalletModule {}
