import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import type {
  CreatePromoCodeInput,
  UpdatePromoCodeInput,
} from './contracts/promo-code.contract'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { CanManage } from '../../common/decorators/check-permissions.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import {
  createPromoCodeSchema,
  updatePromoCodeSchema,
} from './contracts/promo-code.contract'
import { mapPromo, PromoCodesController } from './promo-codes.controller'
import { PromoCodesService } from './promo-codes.service'

/** Admin sees every code — platform ones it creates, shop ones it can retire. */
@Controller('admin/promo-codes')
@UseGuards(AuthGuard, RolesGuard, CaslGuard)
@Roles('ADMIN')
@CanManage('all')
export class AdminPromoCodesController {
  constructor(private readonly promoCodesService: PromoCodesService) {}

  @Get()
  async list(
    @Query('scope') scope?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
  ) {
    const { items, total } = await this.promoCodesService.list({
      // scope=platform → platform codes only; scope omitted → everything.
      supplierId: scope === 'platform' ? null : undefined,
      page: Number(page),
      limit: Number(limit),
    })
    return { items: items.map(mapPromo), total }
  }

  /** Admin codes are platform-wide: eBio funds the discount. */
  @Post()
  async create(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(createPromoCodeSchema) body: CreatePromoCodeInput,
  ) {
    const promo = await this.promoCodesService.create(body, session.user.id, null)
    return mapPromo(promo)
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @TypedBody(updatePromoCodeSchema) body: UpdatePromoCodeInput,
  ) {
    const promo = await this.promoCodesService.update(id, body, null)
    return mapPromo(promo)
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.promoCodesService.remove(id, null)
    return { success: true }
  }
}

export { PromoCodesController }
