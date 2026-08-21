import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import type { AdminPayoutNumberAction, AdminWithdrawalAction } from './contracts/wallet.contract'
import { TypedBody } from '@lonestone/nzoth/server'
import { BadRequestException, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common'
import { CanManage } from '../../common/decorators/check-permissions.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { adminPayoutNumberActionSchema, adminWithdrawalActionSchema } from './contracts/wallet.contract'
import { WithdrawalsService } from './withdrawals.service'

@Controller('admin')
@UseGuards(AuthGuard, RolesGuard, CaslGuard)
@Roles('ADMIN')
@CanManage('all')
export class WalletAdminController {
  constructor(private readonly withdrawalsService: WithdrawalsService) {}

  @Get('payout-numbers')
  async listNumbers(
    @Query('status') status?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    return this.withdrawalsService.adminListNumbers(status, Number(page), Number(limit))
  }

  @Patch('payout-numbers/:id')
  async actOnNumber(
    @Param('id') id: string,
    @TypedBody(adminPayoutNumberActionSchema) body: AdminPayoutNumberAction,
    @Session() session: LoggedInBetterAuthSession,
  ) {
    return this.withdrawalsService.adminActOnNumber(id, session.user.id, body.action, body.rejectionReason)
  }

  @Get('withdrawals')
  async listWithdrawals(
    @Query('status') status?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    return this.withdrawalsService.adminList(status, Number(page), Number(limit))
  }

  /** approve fires the FedaPay payout; reject re-credits the wallet. */
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

  @Get('wallets')
  async walletsOverview() {
    return this.withdrawalsService.adminWalletsOverview()
  }
}
