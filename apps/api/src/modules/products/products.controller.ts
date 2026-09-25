import type { BetterAuthSession, LoggedInBetterAuthSession } from '../../config/better-auth.config'
import type { ProductPagination } from './contracts/product.contract'
import { PaginationParams, TypedBody } from '@lonestone/nzoth/server'
import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common'
import { z } from 'zod'
import { CanCreate, CanDelete, CanUpdate } from '../../common/decorators/check-permissions.decorator'
import { ActiveSupplierGuard } from '../../common/guards/active-supplier.guard'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { AuditService } from '../admin/audit.service'
import { Public, Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { CaslAbilityFactory } from '../auth/casl/casl-ability.factory'
import { ValidationStatus } from '../suppliers/supplier.entity'
import { SuppliersService } from '../suppliers/suppliers.service'
import {
  createProductSchema,
  productPaginationSchema,
  promotionSchema,
  stockUpdateSchema,
  updateProductSchema,
} from './contracts/product.contract'
import { PromotionAuthor } from './entities/product-promotion.entity'
import { ProductStatus } from './entities/product.entity'
import { ProductMapper } from './products.mapper'
import { ProductsService } from './products.service'
import { PromotionsService } from './promotions.service'
import { StockAlertService } from './stock-alert.service'

@Controller()
@UseGuards(AuthGuard, ActiveSupplierGuard)
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly stockAlertService: StockAlertService,
    private readonly suppliersService: SuppliersService,
    private readonly promotionsService: PromotionsService,
    private readonly caslAbilityFactory: CaslAbilityFactory,
    private readonly audit: AuditService,
  ) {}

  @Get('suppliers/:supplierId/products')
  @Public()
  async findBySupplier(
    @Session() session: BetterAuthSession,
    @Param('supplierId') supplierId: string,
    @PaginationParams(productPaginationSchema) pagination: ProductPagination,
    @Query('status') status?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    const emptyResult = { data: [], meta: { itemCount: 0, pageSize: pagination.pageSize, offset: pagination.offset, hasMore: false } }

    // Resolve 'me' to the authenticated supplier's ID
    let resolvedId = supplierId
    if (supplierId === 'me') {
      if (!session?.user?.id) {
        return emptyResult
      }
      const supplier = await this.suppliersService.findByUserId(session.user.id)
      resolvedId = supplier.id
    }

    const supplier = await this.suppliersService.findById(resolvedId)

    // Someone from eBio who may work inside a catalogue sees it as the shop
    // does — otherwise the studio would show a truncated catalogue and let
    // them edit a product they cannot see.
    const manages = session?.user?.id
      ? (await this.caslAbilityFactory.createForUser(session.user as never)).can('manage', 'Product')
      : false

    if (supplier.validationStatus !== ValidationStatus.VALIDATED && supplierId !== 'me' && !manages) {
      return emptyResult
    }

    // The owner manages their whole catalogue, withdrawn and deleted items
    // included; a buyer only ever sees what is on sale. Recognising the owner
    // by id too, not just by the `me` alias, keeps the dashboard working
    // whichever form it uses.
    const isOwner = supplierId === 'me'
      || manages
      || (!!session?.user?.id && supplier.user?.id === session.user.id)

    const result = await this.productsService.findBySupplierId(
      resolvedId,
      pagination,
      { status, categoryId, includeHidden: isOwner },
    )

    const promotions = await this.promotionsService.liveByProduct(result.products.map(p => p.id))
    return {
      data: result.products.map(p => ProductMapper.toSummary(p, promotions.get(p.id) ?? [])),
      meta: {
        itemCount: result.total,
        pageSize: pagination.pageSize,
        offset: pagination.offset,
        hasMore: pagination.offset + pagination.pageSize < result.total,
      },
    }
  }

  @Get('products/:id')
  @Public()
  async findById(
    @Session() session: BetterAuthSession,
    @Param('id') id: string,
  ) {
    const product = await this.productsService.findById(id)

    // Neither a suspended shop's catalogue nor a product its owner withdrew or
    // deleted must stay reachable by direct link, which is how a product page
    // is opened from a share, a notification or an old order. The owner keeps
    // access, so they can still see what buyers no longer can.
    const isOwner = !!session?.user?.id
      && product.supplier.user?.id === session.user.id
    const isWithdrawn = product.supplier.validationStatus === ValidationStatus.SUSPENDED
      || product.status === ProductStatus.HIDDEN
    if (isWithdrawn && !isOwner) {
      throw new NotFoundException('Product not found')
    }

    const [variants, stats, promotions] = await Promise.all([
      this.productsService.getVariantsByProductId(product.id),
      this.productsService.getProductStats(product.id),
      this.promotionsService.listForProduct(product.id),
    ])
    return { ...ProductMapper.toResponse(product, variants, promotions), stats }
  }

  /**
   * Which shop this write is for, and whether the caller may make it.
   *
   * `me` is a shop owner working on their own catalogue. Anything else is
   * someone from eBio working on a shop's behalf, which takes the permission
   * to manage suppliers — and is written down, because "the shop changed its
   * price" and "eBio changed the shop's price" are not the same fact, and the
   * difference matters the day it has to be explained.
   *
   * Returns the shop id and whether it was acted on from the outside.
   */
  private async resolveShop(
    session: LoggedInBetterAuthSession,
    supplierId: string,
  ): Promise<{ id: string, onBehalf: boolean }> {
    if (supplierId === 'me') {
      const own = await this.suppliersService.findByUserId(session.user.id)
      return { id: own.id, onBehalf: false }
    }

    // `manage Product` is the back-office right to work inside a shop's
    // catalogue — deliberately not `manage Supplier`, which is about
    // validating and suspending shops, a different job.
    const ability = await this.caslAbilityFactory.createForUser(session.user as never)
    if (!ability.can('manage', 'Product')) {
      throw new ForbiddenException('Vous ne pouvez pas modifier le catalogue d\'une autre boutique')
    }
    // It must exist: a typo in an id should say so rather than create a
    // product nobody will ever find.
    const shop = await this.suppliersService.findById(supplierId)
    return { id: shop.id, onBehalf: true }
  }

  /** Written after the fact and never in the way: a trace must not fail a sale. */
  private noteOnBehalf(
    session: LoggedInBetterAuthSession,
    shop: { id: string, onBehalf: boolean },
    action: string,
    productId: string,
  ): void {
    if (!shop.onBehalf) {
      return
    }
    void this.audit.record({
      actorUserId: session.user.id,
      action,
      targetType: 'product',
      targetId: productId,
      payload: { supplierId: shop.id },
    })
  }

  @Post('suppliers/:supplierId/products')
  @UseGuards(RolesGuard, CaslGuard)
  @CanCreate('Product')
  async create(
    @Session() session: LoggedInBetterAuthSession,
    @Param('supplierId') supplierId: string,
    @TypedBody(createProductSchema) body: z.infer<typeof createProductSchema>,
  ) {
    const shop = await this.resolveShop(session, supplierId)
    const product = await this.productsService.create(shop.id, body)
    this.noteOnBehalf(session, shop, 'PRODUCT_CREATED_ON_BEHALF', product.id)
    const variants = await this.productsService.getVariantsByProductId(product.id)
    return ProductMapper.toResponse(product, variants)
  }

  @Put('suppliers/:supplierId/products/:id')
  @UseGuards(RolesGuard, CaslGuard)
  @CanUpdate('Product')
  async update(
    @Session() session: LoggedInBetterAuthSession,
    @Param('supplierId') supplierId: string,
    @Param('id') id: string,
    @TypedBody(updateProductSchema) body: z.infer<typeof updateProductSchema>,
  ) {
    const shop = await this.resolveShop(session, supplierId)
    const product = await this.productsService.update(id, shop.id, body)
    this.noteOnBehalf(session, shop, 'PRODUCT_UPDATED_ON_BEHALF', product.id)
    const variants = await this.productsService.getVariantsByProductId(product.id)
    return ProductMapper.toResponse(product, variants)
  }

  @Patch('suppliers/:supplierId/products/:id/stock')
  @UseGuards(RolesGuard, CaslGuard)
  @CanUpdate('Product')
  async updateStock(
    @Session() session: LoggedInBetterAuthSession,
    @Param('supplierId') supplierId: string,
    @Param('id') id: string,
    @TypedBody(stockUpdateSchema) body: z.infer<typeof stockUpdateSchema>,
  ) {
    const shop = await this.resolveShop(session, supplierId)
    const previousProduct = await this.productsService.findById(id)
    const previousStock = previousProduct.stock

    const product = await this.productsService.updateStock(id, shop.id, body.stock)
    this.noteOnBehalf(session, shop, 'PRODUCT_STOCK_SET_ON_BEHALF', product.id)

    if (previousStock === 0 && body.stock > 0) {
      await this.stockAlertService.notifyOnRestock(id)
    }

    const variants = await this.productsService.getVariantsByProductId(product.id)
    return ProductMapper.toResponse(product, variants)
  }

  @Delete('suppliers/:supplierId/products/:id')
  @UseGuards(RolesGuard, CaslGuard)
  @CanDelete('Product')
  async softDelete(
    @Session() session: LoggedInBetterAuthSession,
    @Param('supplierId') supplierId: string,
    @Param('id') id: string,
  ) {
    const shop = await this.resolveShop(session, supplierId)
    await this.productsService.softDelete(id, shop.id)
    this.noteOnBehalf(session, shop, 'PRODUCT_DELETED_ON_BEHALF', id)
    return { success: true }
  }

  @Post('suppliers/:supplierId/products/:id/promotion')
  @UseGuards(RolesGuard, CaslGuard)
  @CanUpdate('Product')
  async setPromotion(
    @Session() session: LoggedInBetterAuthSession,
    @Param('supplierId') supplierId: string,
    @Param('id') id: string,
    @TypedBody(promotionSchema) body: z.infer<typeof promotionSchema>,
  ) {
    // Legacy shape kept for older app versions; the row lives in product_promotions.
    const shop = await this.resolveShop(session, supplierId)
    const product = await this.productsService.findByIdAndVerifyOwnership(id, shop.id)
    await this.promotionsService.create(product, PromotionAuthor.SUPPLIER, {
      type: 'PRICE',
      promoPrice: body.promotionalPrice,
      endsAt: body.expiresAt,
    })
    this.noteOnBehalf(session, shop, 'PRODUCT_PROMOTION_SET_ON_BEHALF', product.id)
    const variants = await this.productsService.getVariantsByProductId(product.id)
    const promotions = await this.promotionsService.listForProduct(product.id)
    return ProductMapper.toResponse(product, variants, promotions)
  }

  @Delete('suppliers/:supplierId/products/:id/promotion')
  @UseGuards(RolesGuard, CaslGuard)
  @CanUpdate('Product')
  async clearPromotion(
    @Session() session: LoggedInBetterAuthSession,
    @Param('supplierId') supplierId: string,
    @Param('id') id: string,
  ) {
    const shop = await this.resolveShop(session, supplierId)
    const product = await this.productsService.findByIdAndVerifyOwnership(id, shop.id)
    for (const promotion of await this.promotionsService.listForProduct(product.id, true)) {
      if (promotion.type === 'PRICE' && promotion.isActive)
        await this.promotionsService.remove(product.id, promotion.id)
    }
    this.noteOnBehalf(session, shop, 'PRODUCT_PROMOTION_CLEARED_ON_BEHALF', product.id)
    const variants = await this.productsService.getVariantsByProductId(product.id)
    return ProductMapper.toResponse(product, variants, await this.promotionsService.listForProduct(product.id))
  }

  @Post('products/:id/stock-alert')
  async subscribeToStockAlert(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
  ) {
    const alert = await this.stockAlertService.subscribe(session.user.id, id)
    return { id: alert.id, productId: id, subscribed: true }
  }
}
