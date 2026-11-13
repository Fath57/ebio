import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import type { VerifyTopupInput } from '../wallet/contracts/wallet.contract'
import type { AddFamilyMember, FamilyAmount, FamilyMemberResponse, FamilyTopupResponse, FamilyTransferResponse, FamilyWalletResponse, UpdateFamilyWallet } from './contracts/family-wallet.contract'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { verifyTopupSchema } from '../wallet/contracts/wallet.contract'
import { addFamilyMemberSchema, familyAmountSchema, updateFamilyWalletSchema } from './contracts/family-wallet.contract'
import { FamilyFundingService } from './family-funding.service'
import { FamilyMembersService } from './family-members.service'
import { FamilyWalletEnabledGuard } from './family-wallet-enabled.guard'
import { FamilyWalletMapper } from './family-wallet.mapper'
import { FamilyWalletsService } from './family-wallets.service'

/** The payer's family wallet (010, US1): opening, members, money in. */
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

  @Post('members')
  async addMember(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(addFamilyMemberSchema) body: AddFamilyMember,
  ): Promise<FamilyMemberResponse> {
    const member = await this.members.add(session.user.id, body)
    const view = await this.familyWallets.get(session.user.id)
    const added = view.members.find(candidate => candidate.member.id === member.id) ?? { member, spentThisMonth: 0 }
    return FamilyWalletMapper.toMemberResponse(view.wallet, added)
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
}
