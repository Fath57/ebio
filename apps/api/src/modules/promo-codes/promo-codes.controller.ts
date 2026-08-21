import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import type {
  CreatePromoCodeInput,
  UpdatePromoCodeInput,
  ValidatePromoInput,
} from './contracts/promo-code.contract'
import type { PromoCode } from './entities/promo-code.entity'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ActiveSupplierGuard } from '../../common/guards/active-supplier.guard'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { SuppliersService } from '../suppliers/suppliers.service'
import {
  createPromoCodeSchema,
  updatePromoCodeSchema,
  validatePromoSchema,
} from './contracts/promo-code.contract'
import { PromoCodesService } from './promo-codes.service'

export function mapPromo(promo: PromoCode) {
  return {
    id: promo.id,
    code: promo.code,
    supplierId: promo.supplier?.id ?? null,
    shopName: promo.supplier?.shopName ?? null,
    type: promo.type,
    value: promo.value,
    maxDiscount: promo.maxDiscount ?? null,
    minOrderAmount: promo.minOrderAmount,
    startsAt: promo.startsAt?.toISOString() ?? null,
    expiresAt: promo.expiresAt?.toISOString() ?? null,
    maxUses: promo.maxUses ?? null,
    maxUsesPerUser: promo.maxUsesPerUser,
    useCount: promo.useCount,
    isActive: promo.isActive,
    createdAt: promo.createdAt.toISOString(),
  }
}

/** Buyer-side: pre-checkout validation. */
@Controller('promo-codes')
@UseGuards(AuthGuard)
export class PromoCodesController {
  constructor(private readonly promoCodesService: PromoCodesService) {}

  @Post('validate')
  async validate(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(validatePromoSchema) body: ValidatePromoInput,
  ) {
    const result = await this.promoCodesService.check(
      body.code,
      body.supplierId,
      body.itemsTotal,
      session.user.id,
    )
    if (!result.valid) {
      return { valid: false, discount: 0, message: result.message }
    }
    return { valid: true, discount: result.discount, message: null }
  }
}

/** Shop-side management: a supplier only ever sees and edits its own codes. */
@Controller('suppliers/me/promo-codes')
@UseGuards(AuthGuard, ActiveSupplierGuard)
export class SupplierPromoCodesController {
  constructor(
    private readonly promoCodesService: PromoCodesService,
    private readonly suppliersService: SuppliersService,
  ) {}

  @Get()
  async list(
    @Session() session: LoggedInBetterAuthSession,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
  ) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    const { items, total } = await this.promoCodesService.list({
      supplierId: supplier.id,
      page: Number(page),
      limit: Number(limit),
    })
    return { items: items.map(mapPromo), total }
  }

  @Post()
  async create(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(createPromoCodeSchema) body: CreatePromoCodeInput,
  ) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    const promo = await this.promoCodesService.create(body, session.user.id, supplier.id)
    return mapPromo(promo)
  }

  @Patch(':id')
  async update(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
    @TypedBody(updatePromoCodeSchema) body: UpdatePromoCodeInput,
  ) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    const promo = await this.promoCodesService.update(id, body, supplier.id)
    return mapPromo(promo)
  }

  @Delete(':id')
  async remove(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
  ) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    await this.promoCodesService.remove(id, supplier.id)
    return { success: true }
  }
}
