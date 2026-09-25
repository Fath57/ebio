import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import { TypedBody } from '@lonestone/nzoth/server'
import {
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { z } from 'zod'
import { CanCreate, CanRead, CanUpdate } from '../../common/decorators/check-permissions.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { ActiveSupplierGuard } from '../../common/guards/active-supplier.guard'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { CartService } from '../cart/cart.service'
import { CheckoutAttemptsService } from '../cart/checkout-attempts.service'
import { CheckoutAttemptKind, CheckoutAttemptOutcome } from '../cart/entities/checkout-attempt.entity'
import { SuppliersService } from '../suppliers/suppliers.service'
import { CheckoutService } from './checkout.service'
import { checkoutPreviewSchema, createCheckoutSchema } from './contracts/checkout.contract'
import {
  createDisputeSchema,
  createOrderSchema,
  previewOrderSchema,
  rejectOrderSchema,
  updateOrderStatusSchema,
} from './contracts/order.contract'
import { OrderStatus } from './entities/order.entity'
import { OrderMapper } from './orders.mapper'
import { OrdersService } from './orders.service'

@Controller('orders')
@UseGuards(AuthGuard, ActiveSupplierGuard)
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly checkoutService: CheckoutService,
    private readonly suppliersService: SuppliersService,
    private readonly attempts: CheckoutAttemptsService,
    private readonly cart: CartService,
  ) {}

  /**
   * What the basket weighed, for the diary.
   *
   * Counts and a total, never a product: the refusal is what answers "I can't
   * order", and the contents are read elsewhere under their own permission.
   */
  /**
   * Why no delivery could be priced, said plainly.
   *
   * The enum is written for the code; an agent reading the log needs the
   * sentence the buyer was shown, or the two of them are not talking about
   * the same thing.
   */
  private whyNoDelivery(reason: string): string {
    const reasons: Record<string, string> = {
      NO_POSITION: 'L\'acheteur n\'avait pas posé son repère sur la carte',
      NO_SHOP_POSITION: 'La boutique n\'a pas de position enregistrée',
      OUT_OF_RANGE: 'Adresse hors de la zone livrée',
    }
    return reasons[reason] ?? `Livraison impossible (${reason})`
  }

  private factsOf(
    items: Array<{ quantity: number }>,
    options: { total?: number, shopCount?: number, distanceKm?: number } = {},
  ) {
    return {
      // The request names products, not shops — those are worked out server
      // side — so the count comes from the answer, and is unknown on a refusal
      // that never got that far.
      shopCount: options.shopCount ?? 0,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      total: options.total ?? 0,
      distanceKm: options.distanceKm,
    }
  }

  /**
   * The whole cart as it would be charged — every shop together,
   * a single delivery fee. Nothing is created.
   *
   * Lives next to `preview`, which prices a single shop: the two answer
   * each other until the mobile app has switched over.
   */
  @Post('checkout/preview')
  @UseGuards(CaslGuard)
  @CanCreate('Order')
  async previewCheckout(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(checkoutPreviewSchema) body: z.infer<typeof checkoutPreviewSchema>,
  ) {
    try {
      const quote = await this.checkoutService.preview(session.user.id, body)
      // A quote can succeed and still lead nowhere — out of zone, no drop-off
      // point — and that is exactly what someone calls about.
      const blocked = quote.deliveryFee === null && quote.deliveryReason !== 'PICKUP'
      await this.attempts.record(
        session.user.id,
        CheckoutAttemptKind.QUOTE,
        blocked ? CheckoutAttemptOutcome.REFUSED : CheckoutAttemptOutcome.OK,
        this.factsOf(body.items, {
          total: quote.itemsTotal,
          shopCount: quote.suppliers.length,
          distanceKm: quote.deliveryDistanceKm ?? undefined,
        }),
        blocked ? this.whyNoDelivery(quote.deliveryReason) : undefined,
      )
      return quote
    }
    catch (error) {
      await this.attempts.record(
        session.user.id,
        CheckoutAttemptKind.QUOTE,
        CheckoutAttemptOutcome.REFUSED,
        this.factsOf(body.items),
        error instanceof Error ? error.message : undefined,
      )
      throw error
    }
  }

  /** Places the whole cart: one payment, N orders. */
  @Post('checkout')
  @UseGuards(CaslGuard)
  @CanCreate('Order')
  async createCheckout(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(createCheckoutSchema) body: z.infer<typeof createCheckoutSchema>,
  ) {
    try {
      const checkout = await this.checkoutService.create(session.user.id, body)
      await this.attempts.record(
        session.user.id,
        CheckoutAttemptKind.ORDER,
        CheckoutAttemptOutcome.OK,
        this.factsOf(body.items, {
          total: checkout.orders.reduce((sum, order) => sum + order.total, 0),
          shopCount: checkout.orders.length,
        }),
      )
      // The basket became orders: there is nothing left to be reminded of.
      await this.cart.clear(session.user.id)
      return checkout
    }
    catch (error) {
      await this.attempts.record(
        session.user.id,
        CheckoutAttemptKind.ORDER,
        CheckoutAttemptOutcome.REFUSED,
        this.factsOf(body.items),
        error instanceof Error ? error.message : undefined,
      )
      throw error
    }
  }

  @Post()
  @UseGuards(CaslGuard)
  @CanCreate('Order')
  async create(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(createOrderSchema) body: z.infer<typeof createOrderSchema>,
  ) {
    const order = await this.ordersService.create(session.user.id, body)
    const loaded = await this.ordersService.findById(order.id)
    return OrderMapper.toResponse(loaded)
  }

  /** The basket as it would be charged; nothing is created. */
  @Post('preview')
  @UseGuards(CaslGuard)
  @CanCreate('Order')
  async preview(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(previewOrderSchema) body: z.infer<typeof previewOrderSchema>,
  ) {
    return this.ordersService.preview(session.user.id, body)
  }

  @Get()
  @UseGuards(CaslGuard)
  @CanRead('Order')
  async findAll(
    @Session() session: LoggedInBetterAuthSession,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('view') view?: string,
  ) {
    const filters = {
      status: status as OrderStatus | undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    }

    const userRole = (session.user as Record<string, unknown>).role as string | undefined

    if (userRole === 'SUPPLIER' && view !== 'buyer') {
      const supplier = await this.suppliersService.findByUserId(session.user.id)
      const result = await this.ordersService.findBySupplier(supplier.id, filters)
      const deliveries = await this.ordersService.deliverySummaries(result.orders.map(o => o.id))
      return {
        orders: result.orders.map(order => OrderMapper.toResponse(order, deliveries.get(order.id) ?? null)),
        total: result.total,
      }
    }

    const result = await this.ordersService.findByBuyer(session.user.id, filters)
    const deliveries = await this.ordersService.deliverySummaries(result.orders.map(o => o.id))
    return {
      orders: result.orders.map(order => OrderMapper.toResponse(order, deliveries.get(order.id) ?? null)),
      total: result.total,
    }
  }

  @Get(':id')
  @UseGuards(CaslGuard)
  @CanRead('Order')
  async findById(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
  ) {
    const order = await this.ordersService.findById(id)
    const hasReview = await this.ordersService.hasReview(id)
    const hasUnratedProducts = await this.ordersService.hasUnratedProducts(id)
    const deliveries = await this.ordersService.deliverySummaries([id])
    return { ...OrderMapper.toResponse(order, deliveries.get(id) ?? null), hasReview, hasUnratedProducts }
  }

  /** Rendered invoice of a delivered order, for the buyer or the shop. */
  @Get(':id/invoice')
  @UseGuards(CaslGuard)
  @CanRead('Order')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async invoice(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
  ): Promise<string> {
    return this.ordersService.renderInvoiceHtml(id, session.user.id, session.user.role)
  }

  @Patch(':id/accept')
  @Roles('SUPPLIER')
  @UseGuards(RolesGuard, CaslGuard)
  @CanUpdate('Order')
  async accept(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
  ) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    const order = await this.ordersService.accept(id, supplier.id)
    return OrderMapper.toResponse(order)
  }

  @Patch(':id/reject')
  @Roles('SUPPLIER')
  @UseGuards(RolesGuard, CaslGuard)
  @CanUpdate('Order')
  async reject(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
    @TypedBody(rejectOrderSchema) body: z.infer<typeof rejectOrderSchema>,
  ) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    const order = await this.ordersService.reject(id, supplier.id, body.reason)
    return OrderMapper.toResponse(order)
  }

  @Patch(':id/status')
  @Roles('SUPPLIER')
  @UseGuards(RolesGuard, CaslGuard)
  @CanUpdate('Order')
  async updateStatus(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
    @TypedBody(updateOrderStatusSchema) body: z.infer<typeof updateOrderStatusSchema>,
  ) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    const order = await this.ordersService.updateStatus(id, supplier.id, body.status as OrderStatus, body.prepMinutes)
    return OrderMapper.toResponse(order)
  }

  @Patch(':id/confirm-delivery')
  @UseGuards(CaslGuard)
  @CanUpdate('Order')
  async confirmDelivery(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
  ) {
    const order = await this.ordersService.confirmDelivery(id, session.user.id)
    return OrderMapper.toResponse(order)
  }

  /**
   * Verb alias: the mobile app shipped calling POST while the route was PATCH,
   * so the button never worked. Both verbs answer now, published builds included.
   */
  @Post(':id/confirm-delivery')
  @UseGuards(CaslGuard)
  @CanUpdate('Order')
  async confirmDeliveryPost(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
  ) {
    const order = await this.ordersService.confirmDelivery(id, session.user.id)
    return OrderMapper.toResponse(order)
  }

  @Post(':id/dispute')
  @UseGuards(CaslGuard)
  @CanCreate('Order')
  async createDispute(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
    @TypedBody(createDisputeSchema) body: z.infer<typeof createDisputeSchema>,
  ) {
    const dispute = await this.ordersService.createDispute(id, session.user.id, body)
    return OrderMapper.toDisputeResponse(dispute)
  }
}
