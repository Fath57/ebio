import type { OpeningHours } from '../../common/opening-hours'
import type { DisplayCurrency } from '../currency/contracts/currency.contract'
import type { OrderDeliveryHooks } from '../deliveries/deliveries.tokens'
import type { FamilyCartLine } from '../family-wallet/family-payment.service'
import type { CheckoutDisplay, CheckoutPreview, CheckoutPreviewResponse, CheckoutRecipient, CreateCheckout, CreateCheckoutResponse } from './contracts/checkout.contract'
import { randomBytes } from 'node:crypto'
import { EntityManager } from '@mikro-orm/postgresql'
import { BadRequestException, forwardRef, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { isOpenNow, nextOpening } from '../../common/opening-hours'
import { User } from '../auth/auth.entity'
import { ExchangeRatesService } from '../currency/exchange-rates.service'
import { toDisplayAmount } from '../currency/fx-math'
import { ORDER_DELIVERY_HOOKS } from '../deliveries/deliveries.tokens'
import { FamilyWalletMember } from '../family-wallet/entities/family-wallet-member.entity'
import { FamilyNotifierService } from '../family-wallet/family-notifier.service'
import { FamilyPaymentService } from '../family-wallet/family-payment.service'
import { GiftNotifierService } from '../gift/gift-notifier.service'
import { giftBadRequest } from '../gift/gift-texts'
import { Checkout, CheckoutDeliveryMode, CheckoutStatus } from '../payments/entities/checkout.entity'
import { Payment, PaymentProvider, PaymentStatus } from '../payments/payment.entity'
import { splitCheckoutAmount } from '../payments/payments.service'
import { Product } from '../products/entities/product.entity'
import { SavedRelative } from '../relatives/entities/saved-relative.entity'
import { DeliveryPricingService } from '../settings/delivery-pricing.service'
import { PlatformSettingsService } from '../settings/platform-settings.service'
import { Supplier, SupplierMode } from '../suppliers/supplier.entity'
import { WalletTransactionType } from '../wallet/entities/wallet-transaction.entity'
import { cashBlockedMessage, SupplierCashBlockService } from '../wallet/supplier-cash-block.service'
import { WalletService } from '../wallet/wallet.service'
import { assertBuyerVerified } from './account-verification'
import { GIFT_MINIMUM_TOTAL } from './contracts/checkout.contract'
import { Order } from './entities/order.entity'
import { OrderEmailsService } from './order-emails.service'
import { OrdersService } from './orders.service'

interface SupplierBasket {
  supplier: Supplier
  items: CheckoutPreview['items']
  /** Each product of this shop with its category, for the family wallet's category limit. */
  lines: FamilyCartLine[]
}

/** Amounts of a cart that get converted for display. */
interface DisplayableAmounts {
  total: number
  itemsTotal: number
  deliveryFee: number | null
  discount: number
}

/** Compares phone numbers whatever spaces the payer typed. */
function samePhone(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) {
    return false
  }
  return left.replace(/\s+/g, '') === right.replace(/\s+/g, '')
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
    private readonly supplierCashBlock: SupplierCashBlockService,
    @Inject(ORDER_DELIVERY_HOOKS)
    private readonly deliveriesService: OrderDeliveryHooks,
    private readonly exchangeRates: ExchangeRatesService,
    @Inject(forwardRef(() => GiftNotifierService))
    private readonly giftNotifier: GiftNotifierService,
    private readonly orderEmails: OrderEmailsService,
    private readonly familyPayment: FamilyPaymentService,
    private readonly familyNotifier: FamilyNotifierService,
  ) {}

  /**
   * The relative the cart goes to, or null. A recipient with the payer's own
   * number is the payer: the cart is an ordinary one, not an error.
   */
  private effectiveRecipient(buyer: Pick<User, 'phone'>, recipient: CheckoutRecipient | undefined): CheckoutRecipient | null {
    if (!recipient) {
      return null
    }
    return samePhone(recipient.phone, buyer.phone) ? null : recipient
  }

  /** Each displayed figure converted at one rate, rounded up to the cent like the total. */
  private displayBlock(currency: DisplayCurrency, rate: number, amounts: DisplayableAmounts): CheckoutDisplay {
    return {
      currency,
      rate,
      total: toDisplayAmount(amounts.total, rate),
      itemsTotal: toDisplayAmount(amounts.itemsTotal, rate),
      deliveryFee: toDisplayAmount(amounts.deliveryFee ?? 0, rate),
      discount: toDisplayAmount(amounts.discount, rate),
    }
  }

  /** Groups items by shop, refusing whatever cannot be sold. */
  private async groupBySupplier(items: CheckoutPreview['items']): Promise<SupplierBasket[]> {
    const products = await this.em.find(
      Product,
      { id: { $in: items.map(item => item.productId) } },
      { populate: ['supplier', 'category'] },
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
      const line = { productId: product.id, categoryId: product.category?.id ?? null }
      const existing = bySupplier.get(supplier.id)
      if (existing) {
        existing.items.push(item)
        existing.lines.push(line)
      }
      else {
        bySupplier.set(supplier.id, { supplier, items: [item], lines: [line] })
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
   * One shop per order, and the refusal says how to proceed.
   *
   * A cart that mixed shops charged one delivery for several journeys,
   * refused every promo code (a code belongs to a shop), and let a slow shop
   * hold up another's delivery. The app now orders shop by shop; anything
   * still sending a mixed basket is an older build, and a plain refusal it
   * can show beats an order priced on a rule that no longer exists.
   */
  private assertSingleShop(baskets: SupplierBasket[]): void {
    if (baskets.length > 1) {
      this.logger.warn(`Panier mêlant ${baskets.length} boutiques, version d'application antérieure`)
      throw new BadRequestException(
        'Commandez une boutique à la fois. Mettez à jour l\'application pour retrouver vos paniers par boutique.',
      )
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
    const buyer = await this.em.findOneOrFail(User, { id: buyerId })
    const recipient = this.effectiveRecipient(buyer, data.recipient)
    const baskets = await this.groupBySupplier(data.items)
    this.assertSingleShop(baskets)
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

    // The cart may split into several runs, two shops per run, and no more
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
    const currency = data.displayCurrency ?? 'XOF'
    const rate = await this.exchangeRates.effectiveRate(currency)

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
      cashBlockedShop: await this.cashBlockedShop(baskets),
      // Said before the checkout, never after: a closed shop will handle the
      // order when it opens, and that is something one accepts knowingly,
      // not something one discovers while waiting.
      closedShop: this.closedShop(baskets),
      display: rate === null
        ? null
        : this.displayBlock(currency, rate, { total, itemsTotal, deliveryFee: quote.fee, discount }),
      // Said before paying: the card gateway would refuse the payment anyway.
      cardMinimumNotMet: recipient !== null && total < GIFT_MINIMUM_TOTAL,
      // What each family wallet the buyer belongs to could pay of this cart,
      // and why not when it cannot: said before the tap, re-checked at payment.
      familyWallets: await this.familyPayment.optionsFor(buyerId, total, baskets.flatMap(basket => basket.lines)),
    }
  }

  /**
   * Is the shop closed right now, and when does it open again?
   *
   * The app showed "Fermé" on the shop page and still let the order through
   * without a word: it slept until morning while the buyer waited for it. It
   * is still accepted, an evening order is a real order, but it is now
   * announced for what it is.
   */
  private closedShop(baskets: SupplierBasket[]): { shopName: string, opensAt: string | null } | null {
    const supplier = baskets[0]?.supplier
    if (!supplier) {
      return null
    }
    const hours = supplier.openingHours as OpeningHours
    if (isOpenNow(hours, new Date(), supplier.timezone)) {
      return null
    }
    return {
      shopName: supplier.shopName,
      opensAt: nextOpening(hours, new Date(), supplier.timezone),
    }
  }

  /** The first shop of the cart whose eBio debt bars cash payment, or `null`. */
  private async cashBlockedShop(baskets: SupplierBasket[]): Promise<string | null> {
    for (const basket of baskets) {
      if (await this.supplierCashBlock.getSupplierCashBlock(basket.supplier.id)) {
        return basket.supplier.shopName
      }
    }
    return null
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
    this.escrowPayments(checkout, orders, 'WALLET')
  }

  /** Paid already: one escrowed payment per order, released at each shop's pace. */
  private escrowPayments(checkout: Checkout, orders: Order[], paymentMethod: 'WALLET' | 'FAMILY_WALLET'): void {
    for (const { order, amount } of splitCheckoutAmount(checkout.totalAmount, orders)) {
      this.em.create(Payment, {
        checkout,
        order,
        amount,
        provider: PaymentProvider.FEDAPAY,
        paymentMethod,
        status: PaymentStatus.ESCROW,
        paidAt: new Date(),
      })
    }
    checkout.status = CheckoutStatus.PAID
  }

  async create(buyerId: string, data: CreateCheckout): Promise<CreateCheckoutResponse> {
    const buyer = await this.em.findOneOrFail(User, { id: buyerId })
    assertBuyerVerified(buyer)
    const recipient = this.effectiveRecipient(buyer, data.recipient)
    if (recipient) {
      this.assertGiftAllowed(data)
    }
    // The member pays, not the family wallet's payer. Checked before the
    // checkout row exists: its CHECK ties the method to a member.
    const familyMemberId = data.paymentMethod === 'FAMILY_WALLET'
      ? await this.familyPayment.assertMemberOf(buyer.id, data.familyMemberId)
      : null
    const savedRelative = recipient?.savedRelativeId
      ? await this.ownedRelative(buyer.id, recipient.savedRelativeId)
      : null
    const baskets = await this.groupBySupplier(data.items)
    this.assertSingleShop(baskets)
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
    if (data.paymentMethod === 'CASH_ON_DELIVERY' && quote.cashBlockedShop !== null) {
      throw new BadRequestException(cashBlockedMessage(quote.cashBlockedShop))
    }
    if (data.paymentMethod === 'CASH_ON_DELIVERY' && quote.cashLimitExceededBy !== null) {
      throw new BadRequestException(
        `Le paiement en espèces dépasse le plafond de ${quote.cashLimitExceededBy.toLocaleString('fr-FR')} FCFA. Payez en ligne ou retirez des articles.`,
      )
    }

    if (recipient && quote.total < GIFT_MINIMUM_TOTAL) {
      throw giftBadRequest(
        'GIFT_AMOUNT_TOO_LOW',
        `Une commande pour un proche se paie par carte ou Mobile Money, à partir de ${GIFT_MINIMUM_TOTAL.toLocaleString('fr-FR')} FCFA. Ajoutez des articles.`,
      )
    }

    // Frozen now, right before the payment starts: the order keeps showing
    // what the payer agreed to, whatever the rates do next (FR-022).
    const currency = data.displayCurrency ?? 'XOF'
    const frozen = await this.exchangeRates.freeze(quote.total, currency)

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
      recipientName: recipient?.name ?? null,
      recipientPhone: recipient?.phone ?? null,
      savedRelative,
      trackingToken: recipient ? randomBytes(18).toString('base64url') : null,
      payerTimeZone: data.payerTimeZone ?? null,
      displayCurrency: frozen ? currency : 'XOF',
      fxRate: frozen?.fxRate ?? null,
      fxMarginBps: frozen?.fxMarginBps ?? null,
      displayTotal: frozen?.displayTotal ?? null,
      familyMember: familyMemberId ? this.em.getReference(FamilyWalletMember, familyMemberId) : null,
    })

    // Either everything exists or nothing does. An insufficient balance found
    // at the third shop must leave behind neither the first two orders nor a
    // buyer facing a half-placed cart.
    const orderNumbers = await this.ordersService.allocateOrderNumbers(baskets.length)

    const { orders, createdOrders } = await this.em.transactional(async (em) => {
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
            deliveryWindowStart: data.deliveryWindowStart,
            deliveryWindowEnd: data.deliveryWindowEnd,
            promoCode: data.promoCode,
          } as Parameters<OrdersService['create']>[1],
          {
            checkout,
            orderNumber: orderNumbers[index],
            // The fee belongs on the order: the courier is paid per order
            // again, and the cash to collect is read where it has always
            // been read.
            deliveryFee: quote.deliveryFee ?? 0,
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
      if (familyMemberId) {
        await this.familyPayment.pay(em, buyer, checkout, entities, familyMemberId, baskets.flatMap(basket => basket.lines))
        this.escrowPayments(checkout, entities, 'FAMILY_WALLET')
      }

      await this.em.flush()
      return { orders: summaries, createdOrders: entities }
    })

    // Cash and wallet carts have no payment step to wait for: confirm by
    // e-mail now that the orders are committed and readable.
    if (data.paymentMethod !== 'FEDAPAY') {
      for (const order of createdOrders)
        await this.ordersService.notifyOrderPlaced(order.id)
    }

    // The payer hears what their relative bought, and of a balance running low.
    if (familyMemberId) {
      await this.familyNotifier.onFamilyPurchase(checkout.id)
    }

    // Paid from the wallet, the cart is paid already: the relative hears of
    // it now, as they would at an online payment's confirmation.
    if (recipient && checkout.status === CheckoutStatus.PAID) {
      await this.giftNotifier.announceToRecipient(checkout.id)
    }

    // No rounds any more: a cart holds one shop, so a checkout is one order
    // and one delivery, taken the way isolated deliveries have always been.
    return {
      checkoutId: checkout.id,
      orders,
      deliveryRunIds: [],
      isGift: recipient !== null,
      display: frozen
        ? {
            ...this.displayBlock(currency, frozen.fxRate, quote),
            total: frozen.displayTotal,
          }
        : null,
    }
  }

  /**
   * What a cart for a relative cannot be. Checked before pricing: the payer
   * learns it without waiting for a quote that would be refused anyway.
   */
  private assertGiftAllowed(data: CreateCheckout): void {
    // A family wallet is spent by its members on their own orders; buying
    // for someone else is the payer's business, from their own means.
    if (data.paymentMethod === 'FAMILY_WALLET') {
      throw giftBadRequest(
        'FAMILY_WALLET_WITH_RECIPIENT',
        'Une commande pour un proche ne peut pas être payée avec un portefeuille famille.',
      )
    }
    // The relative would hand over money the payer meant to give (FR-006).
    if (data.paymentMethod === 'CASH_ON_DELIVERY') {
      throw giftBadRequest(
        'GIFT_CASH_NOT_ALLOWED',
        'Une commande pour un proche se paie en ligne : carte bancaire, Mobile Money ou portefeuille eBio.',
      )
    }
    if (data.pickupMode !== 'DELIVERY') {
      throw giftBadRequest('GIFT_REQUIRES_DELIVERY', 'Une commande pour un proche est livrée chez lui : le retrait sur place n\'est pas possible.')
    }
    if (!data.deliveryAddress) {
      throw giftBadRequest('GIFT_REQUIRES_DELIVERY', 'Indiquez l\'adresse de votre proche, avec un repère.')
    }
  }

  /** An address-book entry of the payer, never someone else's. */
  private async ownedRelative(ownerId: string, relativeId: string): Promise<SavedRelative> {
    const relative = await this.em.findOne(SavedRelative, { id: relativeId, owner: { id: ownerId } })
    if (!relative) {
      throw new NotFoundException('Proche introuvable dans votre carnet')
    }
    return relative
  }
}
