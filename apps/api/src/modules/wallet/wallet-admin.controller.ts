import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import type { AdminPayoutNumberAction, AdminWithdrawalAction } from './contracts/wallet.contract'
import { TypedBody } from '@lonestone/nzoth/server'
import { BadRequestException, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common'
import { CanManage, CanRead } from '../../common/decorators/check-permissions.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { adminPayoutNumberActionSchema, adminWithdrawalActionSchema } from './contracts/wallet.contract'
import { PlatformAccount } from './entities/wallet.entity'
import { PlatformAccountsService } from './platform-accounts.service'
import { TopupService } from './topup.service'
import { WithdrawalsService } from './withdrawals.service'

@Controller('admin')
@UseGuards(AuthGuard, RolesGuard, CaslGuard)
@Roles('ADMIN')
export class WalletAdminController {
  constructor(
    private readonly withdrawalsService: WithdrawalsService,
    private readonly topupService: TopupService,
    private readonly platformAccounts: PlatformAccountsService,
  ) {}

  /** eBio's own accounts: live balance per revenue stream. */
  @CanRead('Payment')
  @Get('platform-accounts')
  async platformOverview(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const parse = (value?: string): Date | undefined => {
      const date = value ? new Date(value) : undefined
      return date && !Number.isNaN(date.getTime()) ? date : undefined
    }
    return this.platformAccounts.overview(parse(from), parse(to))
  }

  @CanRead('Payment')
  @Get('platform-accounts/:account/transactions')
  async platformTransactions(
    @Param('account') account: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    if (!Object.values(PlatformAccount).includes(account as PlatformAccount)) {
      throw new BadRequestException('Compte inconnu')
    }
    return this.platformAccounts.transactions(account as PlatformAccount, Number(page), Number(limit))
  }

  @CanRead('Payment')
  @Get('payout-numbers')
  async listNumbers(
    @Query('status') status?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    return this.withdrawalsService.adminListNumbers(status, Number(page), Number(limit))
  }

  @CanManage('Withdrawal')
  @Patch('payout-numbers/:id')
  async actOnNumber(
    @Param('id') id: string,
    @TypedBody(adminPayoutNumberActionSchema) body: AdminPayoutNumberAction,
    @Session() session: LoggedInBetterAuthSession,
  ) {
    return this.withdrawalsService.adminActOnNumber(id, session.user.id, body.action, body.rejectionReason)
  }

  @CanRead('Payment')
  @Get('withdrawals')
  async listWithdrawals(
    @Query('status') status?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    return this.withdrawalsService.adminList(status, Number(page), Number(limit))
  }

  /** approve fires the FedaPay payout; reject re-credits the wallet. */
  @CanManage('Withdrawal')
  @Patch('withdrawals/:id')
  async actOnWithdrawal(
    @Param('id') id: string,
    @TypedBody(adminWithdrawalActionSchema) body: AdminWithdrawalAction,
    @Session() session: LoggedInBetterAuthSession,
  ) {
    if (body.action === 'approve') {
      return this.withdrawalsService.approve(id, session.user.id)
    }
    if (!body.rejectionReason) {
      throw new BadRequestException('Un motif de refus est requis')
    }
    return this.withdrawalsService.reject(id, session.user.id, body.rejectionReason)
  }

  @CanRead('Payment')
  @Get('wallet-topups')
  async listTopups(
    @Query('status') status?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    return this.topupService.adminList(status, Number(page), Number(limit))
  }

  @CanRead('Payment')
  @Get('wallets')
  async walletsOverview() {
    return this.withdrawalsService.adminWalletsOverview()
  }
}
