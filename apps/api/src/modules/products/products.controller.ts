import type { BetterAuthSession, LoggedInBetterAuthSession } from '../../config/better-auth.config'
import type { ProductPagination } from './contracts/product.contract'
import { PaginationParams, TypedBody } from '@lonestone/nzoth/server'
import {
  Controller,
  Delete,
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
import { Roles } from '../../common/decorators/roles.decorator'
import { ActiveSupplierGuard } from '../../common/guards/active-supplier.guard'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Public, Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { ValidationStatus } from '../suppliers/supplier.entity'
import { SuppliersService } from '../suppliers/suppliers.service'
import {
  createProductSchema,
  productPaginationSchema,
  promotionSchema,
  stockUpdateSchema,
  updateProductSchema,
} from './contracts/product.contract'
import { ProductStatus } from './entities/product.entity'
import { ProductMapper } from './products.mapper'
import { ProductsService } from './products.service'
import { StockAlertService } from './stock-alert.service'

@Controller()
@UseGuards(AuthGuard, ActiveSupplierGuard)
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly stockAlertService: StockAlertService,
    private readonly suppliersService: SuppliersService,
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
    if (supplier.validationStatus !== ValidationStatus.VALIDATED && supplierId !== 'me') {
      return emptyResult
    }

    // The owner manages their whole catalogue, withdrawn and deleted items
    // included; a buyer only ever sees what is on sale. Recognising the owner
    // by id too, not just by the `me` alias, keeps the dashboard working
    // whichever form it uses.
    const isOwner = supplierId === 'me'
      || (!!session?.user?.id && supplier.user?.id === session.user.id)

    const result = await this.productsService.findBySupplierId(
      resolvedId,
      pagination,
      { status, categoryId, includeHidden: isOwner },
    )

    return {
      data: result.products.map(p => ProductMapper.toSummary(p)),
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

    const [variants, stats] = await Promise.all([
      this.productsService.getVariantsByProductId(product.id),
      this.productsService.getProductStats(product.id),
    ])
    return { ...ProductMapper.toResponse(product, variants), stats }
  }

  @Post('suppliers/me/products')
  @Roles('SUPPLIER')
  @UseGuards(RolesGuard, CaslGuard)
  @CanCreate('Product')
  async create(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(createProductSchema) body: z.infer<typeof createProductSchema>,
  ) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    const product = await this.productsService.create(supplier.id, body)
    const variants = await this.productsService.getVariantsByProductId(product.id)
    return ProductMapper.toResponse(product, variants)
  }

  @Put('suppliers/me/products/:id')
  @Roles('SUPPLIER')
  @UseGuards(RolesGuard, CaslGuard)
  @CanUpdate('Product')
  async update(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
    @TypedBody(updateProductSchema) body: z.infer<typeof updateProductSchema>,
  ) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    const product = await this.productsService.update(id, supplier.id, body)
    const variants = await this.productsService.getVariantsByProductId(product.id)
    return ProductMapper.toResponse(product, variants)
  }

  @Patch('suppliers/me/products/:id/stock')
  @Roles('SUPPLIER')
  @UseGuards(RolesGuard, CaslGuard)
  @CanUpdate('Product')
  async updateStock(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
    @TypedBody(stockUpdateSchema) body: z.infer<typeof stockUpdateSchema>,
  ) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    const previousProduct = await this.productsService.findById(id)
    const previousStock = previousProduct.stock

    const product = await this.productsService.updateStock(id, supplier.id, body.stock)

    if (previousStock === 0 && body.stock > 0) {
      await this.stockAlertService.notifyOnRestock(id)
    }

    const variants = await this.productsService.getVariantsByProductId(product.id)
    return ProductMapper.toResponse(product, variants)
  }

  @Delete('suppliers/me/products/:id')
  @Roles('SUPPLIER')
  @UseGuards(RolesGuard, CaslGuard)
  @CanDelete('Product')
  async softDelete(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
  ) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    await this.productsService.softDelete(id, supplier.id)
    return { success: true }
  }

  @Post('suppliers/me/products/:id/promotion')
  @Roles('SUPPLIER')
  @UseGuards(RolesGuard, CaslGuard)
  @CanUpdate('Product')
  async setPromotion(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
    @TypedBody(promotionSchema) body: z.infer<typeof promotionSchema>,
  ) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    const product = await this.productsService.setPromotion(
      id,
      supplier.id,
      body.promotionalPrice,
      body.expiresAt,
    )
    const variants = await this.productsService.getVariantsByProductId(product.id)
    return ProductMapper.toResponse(product, variants)
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
