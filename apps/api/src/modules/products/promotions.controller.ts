import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import type { CreateProductPromotion } from './contracts/product.contract'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common'
import { CanManage, CanUpdate } from '../../common/decorators/check-permissions.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { SuppliersService } from '../suppliers/suppliers.service'
import { createProductPromotionSchema } from './contracts/product.contract'
import { PromotionAuthor } from './entities/product-promotion.entity'
import { ProductsService } from './products.service'
import { PromotionsService } from './promotions.service'

/** The shop's own promotions: it pays for them out of its price. */
@Controller('suppliers/me/products/:id/promotions')
@UseGuards(AuthGuard, RolesGuard, CaslGuard)
@Roles('SUPPLIER')
export class SupplierPromotionsController {
  constructor(
    private readonly promotions: PromotionsService,
    private readonly products: ProductsService,
    private readonly suppliers: SuppliersService,
  ) {}

  @Get()
  @CanUpdate('Product')
  async list(@Session() session: LoggedInBetterAuthSession, @Param('id') id: string) {
    const supplier = await this.suppliers.findByUserId(session.user.id)
    await this.products.findByIdAndVerifyOwnership(id, supplier.id)
    const rows = await this.promotions.listForProduct(id, true)
    return rows.map(PromotionsService.toResponse)
  }

  @Post()
  @CanUpdate('Product')
  async create(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
    @TypedBody(createProductPromotionSchema) body: CreateProductPromotion,
  ) {
    const supplier = await this.suppliers.findByUserId(session.user.id)
    const product = await this.products.findByIdAndVerifyOwnership(id, supplier.id)
    const promotion = await this.promotions.create(product, PromotionAuthor.SUPPLIER, body)
    return PromotionsService.toResponse(promotion)
  }

  @Delete(':promotionId')
  @CanUpdate('Product')
  async remove(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
    @Param('promotionId') promotionId: string,
  ) {
    const supplier = await this.suppliers.findByUserId(session.user.id)
    await this.products.findByIdAndVerifyOwnership(id, supplier.id)
    await this.promotions.remove(id, promotionId)
    return { removed: true }
  }
}

/** eBio-funded promotions: the shop is compensated at settlement. */
@Controller('admin/products/:id/promotions')
@UseGuards(AuthGuard, RolesGuard, CaslGuard)
@Roles('ADMIN')
export class AdminPromotionsController {
  constructor(
    private readonly promotions: PromotionsService,
    private readonly products: ProductsService,
  ) {}

  @Get()
  @CanManage('Promotion')
  async list(@Param('id') id: string) {
    await this.products.findById(id)
    const rows = await this.promotions.listForProduct(id, true)
    return rows.map(PromotionsService.toResponse)
  }

  @Post()
  @CanManage('Promotion')
  async create(@Param('id') id: string, @TypedBody(createProductPromotionSchema) body: CreateProductPromotion) {
    const product = await this.products.findById(id)
    const promotion = await this.promotions.create(product, PromotionAuthor.PLATFORM, body)
    return PromotionsService.toResponse(promotion)
  }

  @Delete(':promotionId')
  @CanManage('Promotion')
  async remove(@Param('id') id: string, @Param('promotionId') promotionId: string) {
    await this.promotions.remove(id, promotionId)
    return { removed: true }
  }
}
