import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Module } from '@nestjs/common'
import { NotificationsModule } from '../notifications/notifications.module'
import { SuppliersModule } from '../suppliers/suppliers.module'
import { PayoutNumber } from './entities/payout-number.entity'
import { WalletTopup } from './entities/wallet-topup.entity'
import { WalletTransaction } from './entities/wallet-transaction.entity'
import { Wallet } from './entities/wallet.entity'
import { WithdrawalRequest } from './entities/withdrawal-request.entity'
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
  controllers: [WalletController, SupplierWalletController, WalletAdminController],
  providers: [WalletService, WithdrawalsService, TopupService],
  exports: [WalletService, WithdrawalsService, TopupService],
})
export class WalletModule {}
