import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import type { TopupInput } from './contracts/wallet.contract'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { topupSchema } from './contracts/wallet.contract'
import { TopupService } from './topup.service'
import { WalletService } from './wallet.service'

/** The signed-in user's personal wallet. */
@Controller('wallet')
@UseGuards(AuthGuard)
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly topupService: TopupService,
  ) {}

  @Get('me')
  async getMyWallet(
    @Session() session: LoggedInBetterAuthSession,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    const wallet = await this.walletService.getOrCreate({ userId: session.user.id })
    const transactions = await this.walletService.getTransactions(wallet.id, Number(page), Number(limit))
    return {
      id: wallet.id,
      balance: Number(wallet.balance),
      transactions,
    }
  }

  /** Starts a FedaPay payment whose confirmation credits the wallet. */
  @Post('topup')
  async topup(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(topupSchema) body: TopupInput,
  ) {
    return this.topupService.initiate(session.user.id, body.amount)
  }
}
