import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import type {
  CreatePayoutNumberInput,
  CreateWithdrawalInput,
  TopupInput,
  VerifyTopupInput,
} from './contracts/wallet.contract'
import { TypedBody } from '@lonestone/nzoth/server'
import { EntityManager } from '@mikro-orm/postgresql'
import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { CourierProfile } from '../deliveries/entities/courier-profile.entity'
import { ValidationStatus } from '../suppliers/supplier.entity'
import {
  createPayoutNumberSchema,
  createWithdrawalSchema,
  topupSchema,
  verifyTopupSchema,
} from './contracts/wallet.contract'
import { TopupService } from './topup.service'
import { WalletService } from './wallet.service'
import { WithdrawalsService } from './withdrawals.service'

/**
 * The courier wallet: delivery earnings, cash-commission debt, top-ups,
 * payout numbers and withdrawal requests. Mirrors the shop wallet routes.
 * Reads are open to any courier applicant; writes need a validated profile.
 */
@Controller('couriers/me/wallet')
@UseGuards(AuthGuard)
export class CourierWalletController {
  constructor(
    private readonly em: EntityManager,
    private readonly walletService: WalletService,
    private readonly withdrawalsService: WithdrawalsService,
    private readonly topupService: TopupService,
  ) {}

  @Get()
  async getWallet(
    @Session() session: LoggedInBetterAuthSession,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    const courier = await this.resolveCourier(session.user.id)
    const wallet = await this.walletService.getOrCreate({ courierId: courier.id })
    const transactions = await this.walletService.getTransactions(wallet.id, Number(page), Number(limit))
    return {
      id: wallet.id,
      balance: Number(wallet.balance),
      transactions,
    }
  }

  @Get('payout-numbers')
  async listNumbers(@Session() session: LoggedInBetterAuthSession) {
    const courier = await this.resolveCourier(session.user.id)
    return this.withdrawalsService.listNumbers({ courierId: courier.id })
  }

  @Post('payout-numbers')
  async addNumber(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(createPayoutNumberSchema) body: CreatePayoutNumberInput,
  ) {
    const courier = await this.resolveCourier(session.user.id, true)
    return this.withdrawalsService.addNumber({ courierId: courier.id }, body)
  }

  @Delete('payout-numbers/:id')
  async removeNumber(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
  ) {
    const courier = await this.resolveCourier(session.user.id, true)
    await this.withdrawalsService.removeNumber({ courierId: courier.id }, id)
    return { success: true }
  }

  @Get('withdrawals')
  async listWithdrawals(
    @Session() session: LoggedInBetterAuthSession,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    const courier = await this.resolveCourier(session.user.id)
    return this.withdrawalsService.listWithdrawals({ courierId: courier.id }, Number(page), Number(limit))
  }

  @Post('withdrawals')
  async requestWithdrawal(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(createWithdrawalSchema) body: CreateWithdrawalInput,
  ) {
    const courier = await this.resolveCourier(session.user.id, true)
    return this.withdrawalsService.requestWithdrawal({ courierId: courier.id }, body)
  }

  @Patch('withdrawals/:id/cancel')
  async cancelWithdrawal(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
  ) {
    const courier = await this.resolveCourier(session.user.id, true)
    return this.withdrawalsService.cancelWithdrawal({ courierId: courier.id }, id)
  }

  /** Starts a FedaPay payment whose confirmation credits the courier wallet. */
  @Post('topup')
  async topup(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(topupSchema) body: TopupInput,
  ) {
    await this.resolveCourier(session.user.id, true)
    return this.topupService.initiate(session.user.id, body.amount, 'courier')
  }

  /** Topups of this user restricted to the courier wallet — pending and failed ones included. */
  @Get('topups')
  async listTopups(
    @Session() session: LoggedInBetterAuthSession,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    const courier = await this.resolveCourier(session.user.id)
    const wallet = await this.walletService.getOrCreate({ courierId: courier.id })
    return this.topupService.listForUser(session.user.id, Number(page), Number(limit), wallet.id)
  }

  /** The widget's completion, re-checked server-side before any credit. */
  @Post('topups/:id/verify')
  async verifyTopup(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
    @TypedBody(verifyTopupSchema) body: VerifyTopupInput,
  ) {
    await this.resolveCourier(session.user.id, true)
    return this.topupService.verify(session.user.id, id, body.fedapayTransactionId)
  }

  /**
   * The caller's courier profile. Entity-only access on purpose: WalletModule
   * must never depend on DeliveriesModule (which imports it).
   */
  private async resolveCourier(userId: string, write = false): Promise<CourierProfile> {
    const profile = await this.em.findOne(CourierProfile, { user: { id: userId } })
    if (!profile) {
      throw new NotFoundException('Profil livreur introuvable')
    }
    if (write && profile.validationStatus !== ValidationStatus.VALIDATED) {
      throw new ForbiddenException('Votre compte livreur doit être validé')
    }
    return profile
  }
}
