import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import type { VerifyTopupInput } from '../wallet/contracts/wallet.contract'
import type { AddFamilyMember, FamilyAmount, FamilyClosureResponse, FamilyMemberResponse, FamilyTopupResponse, FamilyTransactionList, FamilyTransactionsQuery, FamilyTransferResponse, FamilyWalletResponse, UpdateFamilyMember, UpdateFamilyWallet } from './contracts/family-wallet.contract'
import type { FamilyWalletMember } from './entities/family-wallet-member.entity'
import { TypedBody, TypedQueryObject } from '@lonestone/nzoth/server'
import { Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { verifyTopupSchema } from '../wallet/contracts/wallet.contract'
import { addFamilyMemberSchema, familyAmountSchema, familyTransactionsQuerySchema, updateFamilyMemberSchema, updateFamilyWalletSchema } from './contracts/family-wallet.contract'
import { FamilyFundingService } from './family-funding.service'
import { FamilyHistoryMapper } from './family-history.mapper'
import { FamilyMembersService } from './family-members.service'
import { FamilyWalletEnabledGuard } from './family-wallet-enabled.guard'
import { FamilyWalletMapper } from './family-wallet.mapper'
import { FamilyWalletsService } from './family-wallets.service'

/** The payer's family wallet (010): opening, members, money in, history, control. */
@Controller('family-wallet')
@UseGuards(AuthGuard, FamilyWalletEnabledGuard)
export class FamilyWalletController {
  constructor(
    private readonly familyWallets: FamilyWalletsService,
    private readonly members: FamilyMembersService,
    private readonly funding: FamilyFundingService,
  ) {}

  @Get()
  async get(@Session() session: LoggedInBetterAuthSession): Promise<FamilyWalletResponse> {
    return FamilyWalletMapper.toResponse(await this.familyWallets.get(session.user.id))
  }

  @Post()
  async open(@Session() session: LoggedInBetterAuthSession): Promise<FamilyWalletResponse> {
    await this.familyWallets.open(session.user.id)
    return FamilyWalletMapper.toResponse(await this.familyWallets.get(session.user.id))
  }

  @Patch()
  async update(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(updateFamilyWalletSchema) body: UpdateFamilyWallet,
  ): Promise<FamilyWalletResponse> {
    return FamilyWalletMapper.toResponse(await this.familyWallets.updateDefaults(session.user.id, body))
  }

  @Post('suspend')
  async suspend(@Session() session: LoggedInBetterAuthSession): Promise<FamilyWalletResponse> {
    return FamilyWalletMapper.toResponse(await this.familyWallets.suspend(session.user.id))
  }

  /** 403 `FAMILY_WALLET_SUSPENDED_BY_ADMIN` when eBio suspended it. */
  @Post('resume')
  async resume(@Session() session: LoggedInBetterAuthSession): Promise<FamilyWalletResponse> {
    return FamilyWalletMapper.toResponse(await this.familyWallets.resume(session.user.id))
  }

  /** For good: the balance goes back to the personal wallet, once even if replayed. */
  @Post('close')
  async close(@Session() session: LoggedInBetterAuthSession): Promise<FamilyClosureResponse> {
    return this.familyWallets.close(session.user.id)
  }

  /** Top-ups, transfers, purchases with member, shop and products, refunds; never an address nor a message. */
  @Get('transactions')
  async transactions(
    @Session() session: LoggedInBetterAuthSession,
    @TypedQueryObject(familyTransactionsQuerySchema) query: FamilyTransactionsQuery,
  ): Promise<FamilyTransactionList> {
    return FamilyHistoryMapper.toTransactionList(await this.familyWallets.transactions(session.user.id, query))
  }

  @Post('members')
  async addMember(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(addFamilyMemberSchema) body: AddFamilyMember,
  ): Promise<FamilyMemberResponse> {
    return this.memberResponse(session.user.id, await this.members.add(session.user.id, body))
  }

  /** The member's own limits; null goes back to the default. */
  @Patch('members/:id')
  async updateMember(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id', ParseUUIDPipe) id: string,
    @TypedBody(updateFamilyMemberSchema) body: UpdateFamilyMember,
  ): Promise<FamilyMemberResponse> {
    return this.memberResponse(session.user.id, await this.members.updateLimits(session.user.id, id, body.limits))
  }

  @Post('members/:id/suspend')
  async suspendMember(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FamilyMemberResponse> {
    return this.memberResponse(session.user.id, await this.members.suspend(session.user.id, id))
  }

  /** 403 `FAMILY_MEMBER_SUSPENDED_BY_ADMIN` when eBio suspended this member. */
  @Post('members/:id/resume')
  async resumeMember(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FamilyMemberResponse> {
    return this.memberResponse(session.user.id, await this.members.resume(session.user.id, id))
  }

  /** Pending members only, once per 24 h (429 `FAMILY_INVITE_TOO_SOON`). */
  @Post('members/:id/invite')
  async invite(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FamilyMemberResponse> {
    return this.memberResponse(session.user.id, await this.members.resendInvitation(session.user.id, id))
  }

  @Delete('members/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.members.remove(session.user.id, id)
  }

  /** Opens a card or Mobile Money payment; its confirmation credits the family wallet. */
  @Post('topups')
  async topup(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(familyAmountSchema) body: FamilyAmount,
  ): Promise<FamilyTopupResponse> {
    return this.funding.initiateTopup(session.user.id, body.amount)
  }

  /** Same contract as `/wallet/me/topups/:id/verify`: anything but a credited top-up is an error. */
  @Post('topups/:id/verify')
  async verifyTopup(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id', ParseUUIDPipe) id: string,
    @TypedBody(verifyTopupSchema) body: VerifyTopupInput,
  ): Promise<{ status: string, balance: number }> {
    return this.funding.verifyTopup(session.user.id, id, body.fedapayTransactionId)
  }

  @Post('transfer')
  async transfer(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(familyAmountSchema) body: FamilyAmount,
  ): Promise<FamilyTransferResponse> {
    return this.funding.transferFromPersonal(session.user.id, body.amount)
  }

  /** The member as the payer's list shows it, with its spending of the month. */
  private async memberResponse(payerId: string, member: FamilyWalletMember): Promise<FamilyMemberResponse> {
    const view = await this.familyWallets.get(payerId)
    const found = view.members.find(candidate => candidate.member.id === member.id) ?? { member, spentThisMonth: 0 }
    return FamilyWalletMapper.toMemberResponse(view.wallet, found)
  }
}
