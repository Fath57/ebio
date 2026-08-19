import type { CreateProduct, UpdateProduct } from './contracts/product.contract'
import { EntityManager } from '@mikro-orm/postgresql'
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Media, MediaStatus } from '../media/media.entity'
import { NotificationChannel, NotificationType } from '../notifications/notification.entity'
import { NotificationsService } from '../notifications/notifications.service'
import { Supplier } from '../suppliers/supplier.entity'
import { Category } from './entities/category.entity'
import { ProductVariant } from './entities/product-variant.entity'
import { Product, ProductStatus } from './entities/product.entity'
import { ProductUnitsService } from './product-units.service'

const PLAN_PRODUCT_LIMITS: Record<string, number> = {
  FREE: 5,
  ESSENTIAL: 20,
  PRO: Infinity,
  COOP: Infinity,
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly em: EntityManager,
    private readonly notificationsService: NotificationsService,
    private readonly productUnitsService: ProductUnitsService,
  ) {}

  async create(supplierId: string, data: CreateProduct): Promise<Product> {
    const supplier = await this.em.findOneOrFail(Supplier, { id: supplierId }, { populate: ['user'] })

    const category = await this.em.findOne(Category, { id: data.categoryId })
    if (!category) {
      throw new NotFoundException('Category not found')
    }

    await this.productUnitsService.assertUsable(data.unit)

    // Resolve mediaIds to photo URLs
    let photos: string[] = []
    if (data.mediaIds?.length) {
      const mediaRecords = await this.em.find(Media, {
        id: { $in: data.mediaIds },
        status: MediaStatus.READY,
      })
      photos = mediaRecords
        .map(m => m.publicUrl)
        .filter((url): url is string => !!url)
    }

    const product = this.em.create(Product, {
      supplier,
      category,
      name: data.name,
      description: data.description,
      photos,
      pricePerUnit: data.pricePerUnit,
      unit: data.unit,
      stock: data.stock ?? 0,
      stockAlertThreshold: data.stockAlertThreshold ?? 5,
      status: (data.status as ProductStatus) ?? ProductStatus.ACTIVE,
    })

    await this.em.flush()

    // Link media records to this product
    if (data.mediaIds?.length) {
      await this.em.nativeUpdate(Media, { id: { $in: data.mediaIds } }, {
        entityType: 'PRODUCT',
        entityId: product.id,
      })
    }

    if (data.variants?.length) {
      for (const v of data.variants) {
        this.em.create(ProductVariant, {
          product,
          label: v.label,
          pricePerUnit: v.pricePerUnit,
          stock: v.stock ?? 0,
        })
      }
      await this.em.flush()
    }

    return product
  }

  async findById(id: string): Promise<Product> {
    const product = await this.em.findOne(Product, { id }, {
      populate: ['supplier', 'category'],
    })
    if (!product) {
      throw new NotFoundException('Product not found')
    }
    return product
  }

  async getProductStats(productId: string): Promise<{
    totalOrders: number
    totalQuantitySold: number
    totalRevenue: number
    averageOrderQuantity: number
  }> {
    const rows = await this.em.getConnection().execute(
      `SELECT
        COUNT(DISTINCT oi.order_id)::int as "totalOrders",
        COALESCE(SUM(oi.quantity), 0)::int as "totalQuantitySold",
        COALESCE(SUM(oi.total_price), 0)::float as "totalRevenue"
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE oi.product_id = ?
         AND o.status NOT IN ('CANCELLED')`,
      [productId],
    )
    const row = rows[0] ?? { totalOrders: 0, totalQuantitySold: 0, totalRevenue: 0 }
    return {
      totalOrders: row.totalOrders,
      totalQuantitySold: row.totalQuantitySold,
      totalRevenue: row.totalRevenue,
      averageOrderQuantity: row.totalOrders > 0 ? Math.round(row.totalQuantitySold / row.totalOrders) : 0,
    }
  }

  async findBySupplierId(
    supplierId: string,
    pagination: { pageSize: number, offset: number },
    filters?: { status?: string, categoryId?: string, includeHidden?: boolean },
  ): Promise<{ products: Product[], total: number, pagination: { pageSize: number, offset: number } }> {
    const where: Record<string, unknown> = { supplier: { id: supplierId } }

    if (filters?.categoryId) {
      where.category = { id: filters.categoryId }
    }

    // HIDDEN marks a product withdrawn from sale as well as one soft-deleted,
    // so it belongs to the owner's view alone. The allowed set is intersected
    // with the requested status rather than overwritten by it: a buyer asking
    // for `status=HIDDEN` then matches nothing instead of reaching around the
    // rule.
    const allowed = Object.values(ProductStatus)
      .filter(status => filters?.includeHidden || status !== ProductStatus.HIDDEN)
    where.status = {
      $in: filters?.status ? allowed.filter(status => status === filters.status) : allowed,
    }

    const [products, total] = await this.em.findAndCount(Product, where, {
      populate: ['category'],
      orderBy: { createdAt: 'DESC' },
      limit: pagination.pageSize,
      offset: pagination.offset,
    })

    return { products, total, pagination }
  }

  async update(productId: string, supplierId: string, data: UpdateProduct): Promise<Product> {
    const product = await this.findByIdAndVerifyOwnership(productId, supplierId)

    if (data.name !== undefined)
      product.name = data.name
    if (data.description !== undefined)
      product.description = data.description
    if (data.pricePerUnit !== undefined)
      product.pricePerUnit = data.pricePerUnit
    // Only a change is checked: a supplier editing the price of a product
    // priced in a unit since retired must not be blocked by that unit.
    if (data.unit !== undefined && data.unit !== product.unit) {
      await this.productUnitsService.assertUsable(data.unit)
      product.unit = data.unit
    }
    if (data.stock !== undefined)
      product.stock = data.stock
    if (data.stockAlertThreshold !== undefined)
      product.stockAlertThreshold = data.stockAlertThreshold
    if (data.status !== undefined)
      product.status = data.status as ProductStatus

    if (data.categoryId !== undefined) {
      const category = await this.em.findOne(Category, { id: data.categoryId })
      if (!category) {
        throw new NotFoundException('Category not found')
      }
      product.category = category
    }

    if (data.mediaIds?.length) {
      const mediaRecords = await this.em.find(Media, {
        id: { $in: data.mediaIds },
        status: MediaStatus.READY,
      })
      product.photos = mediaRecords
        .map(m => m.publicUrl)
        .filter((url): url is string => !!url)

      await this.em.nativeUpdate(Media, { id: { $in: data.mediaIds } }, {
        entityType: 'PRODUCT',
        entityId: product.id,
      })
    }

    await this.em.flush()
    return product
  }

  async updateStock(productId: string, supplierId: string, newStock: number): Promise<Product> {
    const product = await this.findByIdAndVerifyOwnership(productId, supplierId)
    const previousStock = product.stock
    product.stock = newStock

    if (newStock === 0) {
      product.status = ProductStatus.OUT_OF_STOCK
    }
    else if (previousStock === 0 && newStock > 0) {
      product.status = ProductStatus.ACTIVE
    }

    await this.em.flush()

    await this.checkStockThreshold(product)

    return product
  }

  async setPromotion(
    productId: string,
    supplierId: string,
    price: number,
    expiresAt: string,
  ): Promise<Product> {
    const product = await this.findByIdAndVerifyOwnership(productId, supplierId)

    if (price >= product.pricePerUnit) {
      throw new BadRequestException('Promotional price must be lower than regular price')
    }

    product.promotionalPrice = price
    product.promotionExpiresAt = new Date(expiresAt)
    await this.em.flush()
    return product
  }

  async softDelete(productId: string, supplierId: string): Promise<Product> {
    const product = await this.findByIdAndVerifyOwnership(productId, supplierId)
    product.status = ProductStatus.HIDDEN
    await this.em.flush()
    return product
  }

  async getVariantsByProductId(productId: string): Promise<ProductVariant[]> {
    return this.em.find(ProductVariant, { product: { id: productId } })
  }

  private async findByIdAndVerifyOwnership(productId: string, supplierId: string): Promise<Product> {
    const product = await this.em.findOne(Product, { id: productId }, { populate: ['supplier', 'category'] })
    if (!product) {
      throw new NotFoundException('Product not found')
    }
    if (product.supplier.id !== supplierId) {
      throw new ForbiddenException('You do not own this product')
    }
    return product
  }

  private async checkPlanLimit(supplierId: string): Promise<void> {
    const count = await this.em.count(Product, {
      supplier: { id: supplierId },
      status: { $ne: ProductStatus.HIDDEN },
    })

    // Look up the supplier's active subscription plan
    const subscription = await this.em.getConnection().execute(
      `SELECT sp.name, sp.max_products
       FROM subscriptions s
       JOIN subscription_plans sp ON s.plan_id = sp.id
       WHERE s.supplier_id = ? AND s.status = 'ACTIVE'
       ORDER BY s.end_date DESC LIMIT 1`,
      [supplierId],
    )

    const planName = subscription[0]?.name ?? 'FREE'
    const maxProducts = subscription[0]?.max_products

    // null means unlimited (PRO/COOP plans)
    if (maxProducts === null)
      return

    const limit = maxProducts ?? PLAN_PRODUCT_LIMITS[planName] ?? 5

    if (count >= limit) {
      throw new ForbiddenException(
        `Product limit reached for your plan (${limit}). Upgrade to add more products.`,
      )
    }
  }

  private async checkStockThreshold(product: Product): Promise<void> {
    if (product.stock > 0 && product.stock <= product.stockAlertThreshold) {
      const supplier = await this.em.findOne(Supplier, { id: product.supplier.id }, { populate: ['user'] })
      if (supplier?.user) {
        await this.notificationsService.send({
          user: supplier.user,
          type: NotificationType.STOCK_ALERT,
          title: 'Stock bas',
          body: `Le produit "${product.name}" n'a plus que ${product.stock} unites en stock.`,
          data: { productId: product.id, currentStock: product.stock },
          channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
        })
      }
    }
  }
}
