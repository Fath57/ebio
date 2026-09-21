import type { CheckoutPreview, CheckoutPreviewResponse, CreateCheckout, CreateCheckoutResponse } from './contracts/checkout.contract'
import { EntityManager } from '@mikro-orm/postgresql'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { User } from '../auth/auth.entity'
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
 * Le passage en caisse unifié : un panier qui couvre plusieurs boutiques,
 * un paiement, N commandes.
 *
 * Ce service orchestre, il ne re-chiffre rien lui-même. Le prix d'un panier
 * chez une boutique reste l'affaire d'`OrdersService`, avec ses promotions,
 * son stock et ses commissions. Ne remonte ici que ce qui n'a de sens qu'au
 * niveau du panier : les frais de la tournée et le plafond des espèces.
 */
@Injectable()
export class CheckoutService {
  constructor(
    private readonly em: EntityManager,
    private readonly ordersService: OrdersService,
    private readonly deliveryPricing: DeliveryPricingService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly walletService: WalletService,
  ) {}

  /** Regroupe les articles par boutique, en refusant ce qui n'est pas vendable. */
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
   * Un code promo appartient à une boutique, ou à la plateforme quand il n'en
   * a pas. Le passer à chaque boutique d'un panier multi-boutiques
   * appliquerait N fois un code à montant fixe, donc N fois la remise. Tant
   * que la règle de répartition n'est pas arbitrée, le code est refusé au-delà
   * d'une boutique plutôt que de coûter de l'argent en silence.
   */
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

    // Chaque boutique est chiffrée par le chemin existant. Ses champs de
    // livraison sont ignorés : elle est facturée une fois, sur la tournée.
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

    const quote = await this.deliveryPricing.quoteRun({
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
      total,
      cashLimitExceededBy: data.pickupMode === 'DELIVERY' ? await this.cashOverflow(total) : null,
    }
  }

  /**
   * De combien le panier dépasse le plafond des espèces, ou `null`.
   *
   * Le plafond borne ce que le livreur avance de sa poche, et cette avance est
   * celle de la tournée entière, pas d'une commande isolée.
   */
  private async cashOverflow(total: number): Promise<number | null> {
    const limit = await this.platformSettings.getCashOnDeliveryMaxAmount()
    if (limit <= 0 || total <= limit) {
      return null
    }
    return total - limit
  }

  /**
   * Un seul débit, du total du panier, puis un paiement par commande.
   *
   * L'acheteur n'a fait qu'un geste : son relevé doit en montrer un. Les
   * paiements, eux, restent par commande pour que l'escrow libère les fonds
   * de chaque boutique au rythme de la sienne.
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

    // Ou tout existe, ou rien. Un solde insuffisant découvert à la troisième
    // boutique ne doit pas laisser les deux premières commandes derrière lui,
    // ni l'acheteur devant un panier à moitié passé.
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
          { checkout, orderNumber: orderNumbers[index] },
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
    return { checkoutId: checkout.id, orders, deliveryRunId: null }
  }
}
