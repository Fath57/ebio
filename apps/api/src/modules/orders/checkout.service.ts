import type { OrderDeliveryHooks } from '../deliveries/deliveries.tokens'
import type { CheckoutPreview, CheckoutPreviewResponse, CreateCheckout, CreateCheckoutResponse } from './contracts/checkout.contract'
import { EntityManager } from '@mikro-orm/postgresql'
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { User } from '../auth/auth.entity'
import { ORDER_DELIVERY_HOOKS } from '../deliveries/deliveries.tokens'
import { Checkout, CheckoutDeliveryMode, CheckoutStatus } from '../payments/entities/checkout.entity'
import { Payment, PaymentProvider, PaymentStatus } from '../payments/payment.entity'
import { splitCheckoutAmount } from '../payments/payments.service'
import { Product } from '../products/entities/product.entity'
import { DeliveryPricingService } from '../settings/delivery-pricing.service'
import { PlatformSettingsService } from '../settings/platform-settings.service'
import { Supplier, SupplierMode } from '../suppliers/supplier.entity'
import { WalletTransactionType } from '../wallet/entities/wallet-transaction.entity'
import { WalletService } from '../wallet/wallet.service'
import { Order } from './entities/order.entity'
import { OrdersService } from './orders.service'

interface SupplierBasket {
  supplier: Supplier
  items: CheckoutPreview['items']
}

/**
 * The unified checkout: one cart spanning several shops, one payment, N
 * orders.
 *
 * This service orchestrates, it prices nothing itself. What a cart costs at
 * one shop stays `OrdersService`'s business, with its promotions, its stock
 * and its commissions. Only what makes sense at cart level rises here: the
 * run's fee and the cash cap.
 */
@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name)

  constructor(
    private readonly em: EntityManager,
    private readonly ordersService: OrdersService,
    private readonly deliveryPricing: DeliveryPricingService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly walletService: WalletService,
    @Inject(ORDER_DELIVERY_HOOKS)
    private readonly deliveriesService: OrderDeliveryHooks,
  ) {}

  /** Groups items by shop, refusing whatever cannot be sold. */
  private async groupBySupplier(items: CheckoutPreview['items']): Promise<SupplierBasket[]> {
    const products = await this.em.find(
      Product,
      { id: { $in: items.map(item => item.productId) } },
      { populate: ['supplier'] },
    )
    const bySupplier = new Map<string, SupplierBasket>()
    for (const item of items) {
      const product = products.find(candidate => candidate.id === item.productId)
      if (!product) {
        throw new NotFoundException(`Produit introuvable : ${item.productId}`)
      }
      const supplier = product.supplier as unknown as Supplier
      if (supplier.mode !== SupplierMode.ORDER) {
        throw new BadRequestException(`${supplier.shopName} ne prend pas de commande en ligne`)
      }
      const existing = bySupplier.get(supplier.id)
      if (existing) {
        existing.items.push(item)
      }
      else {
        bySupplier.set(supplier.id, { supplier, items: [item] })
      }
    }
    return [...bySupplier.values()]
  }

  /**
   * A promo code belongs to a shop, or to the platform when it has none.
   * Passing it to every shop of a multi-shop cart would apply a fixed-amount
   * code N times, hence N times the discount. Until the splitting rule is
   * settled, the code is refused beyond one shop rather than costing money in
   * silence.
   */
  /**
   * Says out loud when a cart still mixes shops.
   *
   * The app orders shop by shop now, so this can only come from a version
   * installed before that — and those are exactly the ones that still open
   * grouped rounds. The day this line stops appearing is the day the grouping
   * can be taken out; without it we would be guessing.
   */
  private noteMixedBasket(baskets: SupplierBasket[]): void {
    if (baskets.length > 1) {
      this.logger.warn(`Panier mêlant ${baskets.length} boutiques — version d'application antérieure au panier par boutique`)
    }
  }

  private assertPromoUsable(baskets: SupplierBasket[], promoCode: string | undefined): void {
    if (promoCode && baskets.length > 1) {
      throw new BadRequestException(
        'Un code promo ne s\'applique qu\'à une seule boutique. Retirez le code, ou commandez cette boutique séparément.',
      )
    }
  }

  async preview(buyerId: string, data: CheckoutPreview): Promise<CheckoutPreviewResponse> {
    const baskets = await this.groupBySupplier(data.items)
    this.assertPromoUsable(baskets, data.promoCode)
    const isDelivery = data.pickupMode === 'DELIVERY'

    // Each shop is priced through the existing path. Its delivery fields are
    // ignored: it is charged once, on the run.
    const suppliers = []
    let itemsTotal = 0
    let discount = 0
    for (const basket of baskets) {
      const perSupplier = await this.ordersService.preview(buyerId, {
        supplierId: basket.supplier.id,
        items: basket.items,
        pickupMode: data.pickupMode,
        deliveryLatitude: data.deliveryLatitude,
        deliveryLongitude: data.deliveryLongitude,
        promoCode: data.promoCode,
      } as Parameters<OrdersService['preview']>[1])
      itemsTotal += perSupplier.itemsTotal - perSupplier.discount
      discount += perSupplier.discount
      suppliers.push({
        supplierId: basket.supplier.id,
        shopName: basket.supplier.shopName,
        lines: perSupplier.lines.map(line => ({
          productId: line.productId,
          variantId: line.variantId,
          name: line.name,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          regularPrice: line.regularPrice,
          isGift: line.isGift,
        })),
        itemsTotal: perSupplier.itemsTotal - perSupplier.discount,
        blocked: null,
      })
    }

    // The cart may split into several runs — two shops per run, and no more
    // than the admitted gap between their pickup points. The buyer only sees a
    // total: the split is the platform's business.
    const quote = await this.deliveryPricing.quoteCart({
      supplierIds: baskets.map(basket => basket.supplier.id),
      itemsTotal,
      isDelivery,
      latitude: data.deliveryLatitude,
      longitude: data.deliveryLongitude,
    })
    const total = itemsTotal + (quote.fee ?? 0)

    return {
      suppliers,
      itemsTotal,
      discount,
      deliveryFee: quote.fee,
      deliveryReason: quote.reason,
      deliveryDistanceKm: quote.distanceKm,
      runs: isDelivery
        ? quote.runs.map(run => ({
            supplierIds: run.supplierIds,
            fee: run.fee,
            reason: run.reason,
            distanceKm: run.distanceKm,
            pickupSpreadKm: run.pickupSpreadKm,
          }))
        : [],
      total,
      cashLimitExceededBy: data.pickupMode === 'DELIVERY' ? await this.cashOverflow(total) : null,
    }
  }

  /**
   * By how much the cart exceeds the cash cap, or `null`.
   *
   * The cap bounds what the courier fronts out of pocket, and that advance
   * covers the whole run, not a single order.
   */
  private async cashOverflow(total: number): Promise<number | null> {
    const limit = await this.platformSettings.getCashOnDeliveryMaxAmount()
    if (limit <= 0 || total <= limit) {
      return null
    }
    return total - limit
  }

  /**
   * One debit, of the cart total, then one payment per order.
   *
   * The buyer made a single gesture: their statement must show one. The
   * payments, on the other hand, stay per order so that escrow releases each
   * shop's funds at its own pace.
   */
  private async payFromWallet(buyer: User, checkout: Checkout, orders: Order[]): Promise<void> {
    const wallet = await this.walletService.getOrCreate({ userId: buyer.id })
    await this.walletService.debit(wallet.id, {
      type: WalletTransactionType.ORDER_PAYMENT,
      amount: checkout.totalAmount,
      description: orders.length > 1
        ? `Panier de ${orders.length} boutiques`
        : `Commande ${orders[0].orderNumber}`,
      orderId: orders[0].id,
    })
    for (const { order, amount } of splitCheckoutAmount(checkout.totalAmount, orders)) {
      this.em.create(Payment, {
        checkout,
        order,
        amount,
        provider: PaymentProvider.FEDAPAY,
        paymentMethod: 'WALLET',
        status: PaymentStatus.ESCROW,
        paidAt: new Date(),
      })
    }
    checkout.status = CheckoutStatus.PAID
  }

  async create(buyerId: string, data: CreateCheckout): Promise<CreateCheckoutResponse> {
    const baskets = await this.groupBySupplier(data.items)
    this.assertPromoUsable(baskets, data.promoCode)
    this.noteMixedBasket(baskets)
    const isDelivery = data.pickupMode === 'DELIVERY'
    const quote = await this.preview(buyerId, data)

    if (isDelivery && quote.deliveryFee === null) {
      throw new BadRequestException(
        quote.deliveryReason === 'OUT_OF_RANGE'
          ? 'Adresse hors zone de livraison. Choisissez le retrait sur place ou une autre adresse.'
          : 'Placez votre position sur la carte pour calculer les frais de livraison',
      )
    }
    if (data.paymentMethod === 'CASH_ON_DELIVERY' && quote.cashLimitExceededBy !== null) {
      throw new BadRequestException(
        `Le paiement en espèces dépasse le plafond de ${quote.cashLimitExceededBy.toLocaleString('fr-FR')} FCFA. Payez en ligne ou retirez des articles.`,
      )
    }

    const buyer = await this.em.findOneOrFail(User, { id: buyerId })
    const checkout = this.em.create(Checkout, {
      buyer,
      totalAmount: quote.total,
      itemsTotal: quote.itemsTotal,
      deliveryFee: quote.deliveryFee ?? 0,
      discount: quote.discount,
      paymentMethod: data.paymentMethod,
      status: CheckoutStatus.PENDING,
      deliveryMode: isDelivery ? CheckoutDeliveryMode.DELIVERY : CheckoutDeliveryMode.ON_SITE,
      deliveryAddress: data.deliveryAddress,
      deliveryLatitude: data.deliveryLatitude,
      deliveryLongitude: data.deliveryLongitude,
    })

    // Either everything exists or nothing does. An insufficient balance found
    // at the third shop must leave behind neither the first two orders nor a
    // buyer facing a half-placed cart.
    const orderNumbers = await this.ordersService.allocateOrderNumbers(baskets.length)

    const { orders, createdOrders } = await this.em.transactional(async () => {
      const summaries = []
      const entities = []
      for (const [index, basket] of baskets.entries()) {
        const order = await this.ordersService.create(
          buyerId,
          {
            supplierId: basket.supplier.id,
            items: basket.items,
            pickupMode: data.pickupMode,
            paymentMethod: data.paymentMethod,
            deliveryAddress: data.deliveryAddress,
            deliveryLatitude: data.deliveryLatitude,
            deliveryLongitude: data.deliveryLongitude,
            deliverySlot: data.deliverySlot,
            promoCode: data.promoCode,
          } as Parameters<OrdersService['create']>[1],
          {
            checkout,
            orderNumber: orderNumbers[index],
            // One shop, so the fee belongs on the order rather than on the
            // wrapper: the courier is paid per order again, and the cash to
            // collect is read where it has always been read.
            deliveryFee: baskets.length === 1 ? quote.deliveryFee ?? 0 : 0,
          },
        )
        entities.push(order)
        summaries.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          supplierId: basket.supplier.id,
          shopName: basket.supplier.shopName,
          total: order.totalAmount,
        })
      }

      if (data.paymentMethod === 'WALLET') {
        await this.payFromWallet(buyer, checkout, entities)
      }

      await this.em.flush()
      return { orders: summaries, createdOrders: entities }
    })

    void createdOrders

    // Runs only make sense for delivery, and only for more than one shop.
    //
    // A round of a single shop was still a round: it refused individual
    // acceptance, settled the courier at round level, and waited for « all »
    // its shops to have prepared. One shop makes all of that ceremony around
    // an ordinary delivery, which then travels the path isolated deliveries
    // have always taken.
    const runIds: string[] = []
    if (isDelivery && baskets.length > 1) {
      for (const run of quote.runs) {
        const created = await this.deliveriesService.createRunForCheckout({
          checkoutId: checkout.id,
          supplierIds: run.supplierIds,
          deliveryFee: run.fee ?? 0,
          distanceKm: run.distanceKm,
          pickupSpreadKm: run.pickupSpreadKm,
        })
        if (created) {
          runIds.push(created.id)
        }
      }
    }

    return { checkoutId: checkout.id, orders, deliveryRunIds: runIds }
  }
}
