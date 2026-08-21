import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import type { CreatePayoutNumberInput, CreateWithdrawalInput } from './contracts/wallet.contract'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ActiveSupplierGuard } from '../../common/guards/active-supplier.guard'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { SuppliersService } from '../suppliers/suppliers.service'
import { createPayoutNumberSchema, createWithdrawalSchema } from './contracts/wallet.contract'
import { WalletService } from './wallet.service'
import { WithdrawalsService } from './withdrawals.service'

/** The shop wallet: balance, payout numbers, withdrawal requests. */
@Controller('suppliers/me/wallet')
@UseGuards(AuthGuard, ActiveSupplierGuard)
export class SupplierWalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly withdrawalsService: WithdrawalsService,
    private readonly suppliersService: SuppliersService,
  ) {}

  @Get()
  async getWallet(
    @Session() session: LoggedInBetterAuthSession,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    const wallet = await this.walletService.getOrCreate({ supplierId: supplier.id })
    const transactions = await this.walletService.getTransactions(wallet.id, Number(page), Number(limit))
    return {
      id: wallet.id,
      balance: Number(wallet.balance),
      transactions,
    }
  }

  @Get('payout-numbers')
  async listNumbers(@Session() session: LoggedInBetterAuthSession) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    return this.withdrawalsService.listNumbers(supplier.id)
  }

  @Post('payout-numbers')
  async addNumber(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(createPayoutNumberSchema) body: CreatePayoutNumberInput,
  ) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    return this.withdrawalsService.addNumber(supplier.id, body)
  }

  @Delete('payout-numbers/:id')
  async removeNumber(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
  ) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    await this.withdrawalsService.removeNumber(supplier.id, id)
    return { success: true }
  }

  @Get('withdrawals')
  async listWithdrawals(
    @Session() session: LoggedInBetterAuthSession,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    return this.withdrawalsService.listWithdrawals(supplier.id, Number(page), Number(limit))
  }

  @Post('withdrawals')
  async requestWithdrawal(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(createWithdrawalSchema) body: CreateWithdrawalInput,
  ) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    return this.withdrawalsService.requestWithdrawal(supplier.id, body)
  }

  @Patch('withdrawals/:id/cancel')
  async cancelWithdrawal(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
  ) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    return this.withdrawalsService.cancelWithdrawal(supplier.id, id)
  }
}
