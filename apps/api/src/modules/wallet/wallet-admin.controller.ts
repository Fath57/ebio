import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import type { AdminWalletFilters, WalletOwnerType } from './admin-wallets.service'
import type { AdminPayoutNumberAction, AdminWalletDebit, AdminWithdrawalAction } from './contracts/wallet.contract'
import { TypedBody } from '@lonestone/nzoth/server'
import { BadRequestException, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { CanManage, CanRead } from '../../common/decorators/check-permissions.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { AdminWalletsService } from './admin-wallets.service'
import { adminPayoutNumberActionSchema, adminWalletDebitSchema, adminWithdrawalActionSchema } from './contracts/wallet.contract'
import { PlatformAccount } from './entities/wallet.entity'
import { PlatformAccountsService } from './platform-accounts.service'
import { TopupService } from './topup.service'
import { WithdrawalsService } from './withdrawals.service'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

@Controller('admin')
@UseGuards(AuthGuard, RolesGuard, CaslGuard)
@Roles('ADMIN')
export class WalletAdminController {
  constructor(
    private readonly withdrawalsService: WithdrawalsService,
    private readonly topupService: TopupService,
    private readonly platformAccounts: PlatformAccountsService,
    private readonly adminWallets: AdminWalletsService,
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
    @Query('q') q?: string,
    @Query('walletId') walletId?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    return this.topupService.adminList({
      status: status || undefined,
      q: q?.trim() || undefined,
      walletId: walletId && UUID.test(walletId) ? walletId : undefined,
      page: Number(page) || 1,
      limit: Number(limit) || 20,
    })
  }

  @CanRead('Payment')
  @Get('wallets')
  async walletsOverview() {
    return this.withdrawalsService.adminWalletsOverview()
  }

  /** The wallets, paged and filtered; eBio's own accounts live on their own page. */
  @CanRead('Payment')
  @Get('wallets/list')
  async listWallets(
    @Query('q') q?: string,
    @Query('ownerType') ownerType?: string,
    @Query('balance') balance?: string,
    @Query('sort') sort?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    return this.adminWallets.list({
      q: q?.trim() || undefined,
      ownerType: ['SUPPLIER', 'COURIER', 'USER', 'FAMILY'].includes(ownerType ?? '') ? ownerType as WalletOwnerType : undefined,
      balance: ['positive', 'negative', 'zero'].includes(balance ?? '') ? balance as AdminWalletFilters['balance'] : undefined,
      sort: ['balance_desc', 'balance_asc', 'updated_desc'].includes(sort ?? '') ? sort as AdminWalletFilters['sort'] : undefined,
      page: Number(page) || 1,
      limit: Number(limit) || 20,
    })
  }

  @CanRead('Payment')
  @Get('wallets/:id')
  async getWallet(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.adminWallets.get(id)
  }

  @CanRead('Payment')
  @Get('wallets/:id/transactions')
  async walletTransactions(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    return this.adminWallets.transactions(id, Number(page) || 1, Number(limit) || 20)
  }

  /** Staff debit of a wallet: written in the owner's history, the audit trail, and told to the owner. */
  @CanManage('Withdrawal')
  @Post('wallets/:id/debit')
  async debitWallet(
    @Param('id', new ParseUUIDPipe()) id: string,
    @TypedBody(adminWalletDebitSchema) body: AdminWalletDebit,
    @Session() session: LoggedInBetterAuthSession,
  ) {
    return this.adminWallets.debit(id, body, session.user.id)
  }
}
