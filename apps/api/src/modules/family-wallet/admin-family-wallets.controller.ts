import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import type { AdminFamilyWalletDetailView, AdminFamilyWalletRowView } from './admin-family-wallets.service'
import type { AdminFamilyReason, AdminFamilyResume, AdminFamilyWalletDetail, AdminFamilyWalletList, AdminFamilyWalletRow, AdminFamilyWalletsQuery } from './contracts/family-wallet.contract'
import { TypedBody, TypedQueryObject } from '@lonestone/nzoth/server'
import { Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import { CanManage, CanRead } from '../../common/decorators/check-permissions.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { AdminFamilyWalletsService } from './admin-family-wallets.service'
import { adminFamilyReasonSchema, adminFamilyResumeSchema, adminFamilyWalletsQuerySchema } from './contracts/family-wallet.contract'
import { FamilyHistoryMapper } from './family-history.mapper'

function toRow(view: AdminFamilyWalletRowView): AdminFamilyWalletRow {
  const { wallet } = view
  return {
    id: wallet.id,
    status: wallet.status,
    suspendedByAdmin: wallet.suspendedByAdmin,
    balance: view.balance,
    walletId: view.walletId,
    payer: {
      id: wallet.payer.id,
      name: wallet.payer.name,
      phone: wallet.payer.phone ?? null,
      email: wallet.payer.email,
    },
    memberCount: view.memberCount,
    createdAt: wallet.createdAt.toISOString(),
    closedAt: wallet.closedAt?.toISOString() ?? null,
  }
}

function toDetail(view: AdminFamilyWalletDetailView): AdminFamilyWalletDetail {
  const { wallet } = view
  return {
    ...toRow(view),
    lowBalanceThreshold: Number(wallet.lowBalanceThreshold),
    defaults: {
      monthlyCap: wallet.defaultMonthlyCap == null ? null : Number(wallet.defaultMonthlyCap),
      orderMax: wallet.defaultOrderMax == null ? null : Number(wallet.defaultOrderMax),
      categoryIds: wallet.defaultCategoryIds ?? null,
    },
    members: view.members.map(({ member, suspendedByAdmin, effective, spentThisMonth }) => ({
      id: member.id,
      nickname: member.nickname,
      phone: member.phone,
      status: member.status,
      userId: member.user?.id ?? null,
      suspendedByAdmin,
      effective,
      spentThisMonth,
      createdAt: member.createdAt.toISOString(),
    })),
    transactions: FamilyHistoryMapper.toTransactionList(view.history),
  }
}

/**
 * Family wallets in the back office (010, FR-032, FR-033). Not behind the
 * platform switch: staff must reach the wallets even once it is turned off.
 */
@Controller('admin/family-wallets')
@UseGuards(AuthGuard, RolesGuard, CaslGuard)
@Roles('ADMIN')
export class AdminFamilyWalletsController {
  constructor(private readonly service: AdminFamilyWalletsService) {}

  @CanRead('Payment')
  @Get()
  async list(@TypedQueryObject(adminFamilyWalletsQuerySchema) query: AdminFamilyWalletsQuery): Promise<AdminFamilyWalletList> {
    const { rows, total, page, limit } = await this.service.list(query)
    return { items: rows.map(toRow), total, page, limit }
  }

  /** Member status changes; the full ledger through `/admin/wallets/:walletId/transactions`. */
  @CanManage('Payment')
  @Post('members/:id/suspend')
  async suspendMember(
    @Param('id', ParseUUIDPipe) id: string,
    @TypedBody(adminFamilyReasonSchema) body: AdminFamilyReason,
    @Session() session: LoggedInBetterAuthSession,
  ): Promise<AdminFamilyWalletDetail> {
    return toDetail(await this.service.suspendMember(id, body.reason, session.user.id))
  }

  @CanManage('Payment')
  @Post('members/:id/resume')
  async resumeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @TypedBody(adminFamilyResumeSchema) body: AdminFamilyResume,
    @Session() session: LoggedInBetterAuthSession,
  ): Promise<AdminFamilyWalletDetail> {
    return toDetail(await this.service.resumeMember(id, body.reason || null, session.user.id))
  }

  @CanRead('Payment')
  @Get(':id')
  async detail(@Param('id', ParseUUIDPipe) id: string): Promise<AdminFamilyWalletDetail> {
    return toDetail(await this.service.detail(id))
  }

  @CanManage('Payment')
  @Post(':id/suspend')
  async suspend(
    @Param('id', ParseUUIDPipe) id: string,
    @TypedBody(adminFamilyReasonSchema) body: AdminFamilyReason,
    @Session() session: LoggedInBetterAuthSession,
  ): Promise<AdminFamilyWalletDetail> {
    return toDetail(await this.service.suspendWallet(id, body.reason, session.user.id))
  }

  @CanManage('Payment')
  @Post(':id/resume')
  async resume(
    @Param('id', ParseUUIDPipe) id: string,
    @TypedBody(adminFamilyResumeSchema) body: AdminFamilyResume,
    @Session() session: LoggedInBetterAuthSession,
  ): Promise<AdminFamilyWalletDetail> {
    return toDetail(await this.service.resumeWallet(id, body.reason || null, session.user.id))
  }
}
