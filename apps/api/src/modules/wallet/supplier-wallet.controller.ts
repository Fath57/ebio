import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import type { CreatePayoutNumberInput, CreateWithdrawalInput, TopupInput, VerifyTopupInput } from './contracts/wallet.contract'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ActiveSupplierGuard } from '../../common/guards/active-supplier.guard'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { SuppliersService } from '../suppliers/suppliers.service'
import { createPayoutNumberSchema, createWithdrawalSchema, topupSchema, verifyTopupSchema } from './contracts/wallet.contract'
import { TopupService } from './topup.service'
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
    private readonly topupService: TopupService,
  ) {}

  /** FedaPay top-up of the shop wallet (to pay a banner, or clear a cash debt). */
  @Post('topup')
  async topup(@Session() session: LoggedInBetterAuthSession, @TypedBody(topupSchema) body: TopupInput) {
    return this.topupService.initiate(session.user.id, body.amount, 'supplier')
  }

  @Post('topups/:id/verify')
  async verifyTopup(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
    @TypedBody(verifyTopupSchema) body: VerifyTopupInput,
  ) {
    return this.topupService.verify(session.user.id, id, body.fedapayTransactionId)
  }

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
    return this.withdrawalsService.listNumbers({ supplierId: supplier.id })
  }

  @Post('payout-numbers')
  async addNumber(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(createPayoutNumberSchema) body: CreatePayoutNumberInput,
  ) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    return this.withdrawalsService.addNumber({ supplierId: supplier.id }, body)
  }

  @Delete('payout-numbers/:id')
  async removeNumber(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
  ) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    await this.withdrawalsService.removeNumber({ supplierId: supplier.id }, id)
    return { success: true }
  }

  @Get('withdrawals')
  async listWithdrawals(
    @Session() session: LoggedInBetterAuthSession,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    return this.withdrawalsService.listWithdrawals({ supplierId: supplier.id }, Number(page), Number(limit))
  }

  @Post('withdrawals')
  async requestWithdrawal(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(createWithdrawalSchema) body: CreateWithdrawalInput,
  ) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    return this.withdrawalsService.requestWithdrawal({ supplierId: supplier.id }, body)
  }

  @Patch('withdrawals/:id/cancel')
  async cancelWithdrawal(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
  ) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    return this.withdrawalsService.cancelWithdrawal({ supplierId: supplier.id }, id)
  }
}
