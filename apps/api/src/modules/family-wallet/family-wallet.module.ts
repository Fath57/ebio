import { Module } from '@nestjs/common'
import { SmsModule } from '../../common/sms.module'
import { CurrencyModule } from '../currency/currency.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { RelativesModule } from '../relatives/relatives.module'
import { PlatformSettingsModule } from '../settings/platform-settings.module'
import { WalletModule } from '../wallet/wallet.module'
import { FamilyFundingService } from './family-funding.service'
import { FamilyMembersService } from './family-members.service'
import { FamilyNotifierService } from './family-notifier.service'
import { FamilyWalletEnabledGuard } from './family-wallet-enabled.guard'
import { FamilyWalletController } from './family-wallet.controller'
import { FamilyWalletsService } from './family-wallets.service'

/**
 * The family wallet (010): a payer's balance their relatives spend on eBio
 * orders, within limits. The balance itself is an ordinary wallet; this
 * module adds the members, the limits and what is said to whom.
 *
 * Shipped closed: every route answers 403 while `family_wallet_enabled` is off.
 */
@Module({
  imports: [
    SmsModule,
    NotificationsModule,
    CurrencyModule,
    PlatformSettingsModule,
    RelativesModule,
    WalletModule,
  ],
  controllers: [FamilyWalletController],
  providers: [FamilyWalletsService, FamilyMembersService, FamilyFundingService, FamilyNotifierService, FamilyWalletEnabledGuard],
  exports: [FamilyWalletsService, FamilyMembersService, FamilyFundingService, FamilyNotifierService],
})
export class FamilyWalletModule {}
