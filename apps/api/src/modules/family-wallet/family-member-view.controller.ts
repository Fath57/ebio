import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import type { FamilyTransactionsQuery, MemberFamilyTransactionList, MemberFamilyWallet } from './contracts/family-wallet.contract'
import { TypedQueryObject } from '@lonestone/nzoth/server'
import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { familyTransactionsQuerySchema } from './contracts/family-wallet.contract'
import { FamilyHistoryMapper } from './family-history.mapper'
import { FamilyMemberViewService } from './family-member-view.service'
import { FamilyWalletEnabledGuard } from './family-wallet-enabled.guard'

/** The member's side (010, US4): what they may spend and their own purchases — never the balance. */
@Controller('family-wallets/mine')
@UseGuards(AuthGuard, FamilyWalletEnabledGuard)
export class FamilyMemberViewController {
  constructor(private readonly view: FamilyMemberViewService) {}

  @Get()
  async mine(@Session() session: LoggedInBetterAuthSession): Promise<MemberFamilyWallet[]> {
    const wallets = await this.view.mine(session.user.id)
    return wallets.map(FamilyHistoryMapper.toMemberWallet)
  }

  /** `memberId` filter of the query is ignored: the path already says whose lines. */
  @Get(':memberId/transactions')
  async transactions(
    @Session() session: LoggedInBetterAuthSession,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @TypedQueryObject(familyTransactionsQuerySchema) query: FamilyTransactionsQuery,
  ): Promise<MemberFamilyTransactionList> {
    const page = await this.view.transactions(session.user.id, memberId, query.page, query.limit)
    return FamilyHistoryMapper.toMemberTransactionList(page)
  }
}
