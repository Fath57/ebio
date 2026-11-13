import { Module } from '@nestjs/common'
import { SmsModule } from '../../common/sms.module'
import { CurrencyModule } from '../currency/currency.module'
import { EmailModule } from '../email/email.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { RelativesModule } from '../relatives/relatives.module'
import { PlatformSettingsModule } from '../settings/platform-settings.module'
import { WalletModule } from '../wallet/wallet.module'
import { AdminFamilyWalletsController } from './admin-family-wallets.controller'
import { AdminFamilyWalletsService } from './admin-family-wallets.service'
import { FamilyFundingService } from './family-funding.service'
import { FamilyMemberViewController } from './family-member-view.controller'
import { FamilyMemberViewService } from './family-member-view.service'
import { FamilyMembersService } from './family-members.service'
import { FamilyNotifierService } from './family-notifier.service'
import { FamilyPaymentService } from './family-payment.service'
import { FamilyPendingScheduler } from './family-pending.scheduler'
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
    EmailModule,
    PlatformSettingsModule,
    RelativesModule,
    WalletModule,
  ],
  controllers: [FamilyWalletController, FamilyMemberViewController, AdminFamilyWalletsController],
  providers: [
    FamilyWalletsService,
    FamilyMembersService,
    FamilyFundingService,
    FamilyNotifierService,
    FamilyPaymentService,
    FamilyWalletEnabledGuard,
    FamilyMemberViewService,
    FamilyPendingScheduler,
    AdminFamilyWalletsService,
  ],
  exports: [FamilyWalletsService, FamilyMembersService, FamilyFundingService, FamilyNotifierService, FamilyPaymentService],
})
export class FamilyWalletModule {}
