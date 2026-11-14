import type { DisplayCurrency } from '../currency/contracts/currency.contract'
import type { TerroirCheckoutInput } from './contracts/terroir.contract'
import type { PackView } from './export-catalog.service'
import type { OfferedDeparture } from './terroir-math'
import { randomBytes } from 'node:crypto'
import { EntityManager } from '@mikro-orm/postgresql'
import { HttpStatus, Injectable, Logger } from '@nestjs/common'
import { User } from '../auth/auth.entity'
import { ExchangeRatesService } from '../currency/exchange-rates.service'
import { assertBuyerVerified } from '../orders/account-verification'
import { Order, PaymentMethod, PickupMode } from '../orders/entities/order.entity'
import { OrderEmailsService } from '../orders/order-emails.service'
import { stockDraw } from '../orders/order-stock'
import { OrdersService } from '../orders/orders.service'
import { Checkout, CheckoutDeliveryMode, CheckoutStatus } from '../payments/entities/checkout.entity'
import { Payment, PaymentProvider, PaymentStatus } from '../payments/payment.entity'
import { ProductVariant } from '../products/entities/product-variant.entity'
import { Product, ProductModeration, ProductStatus } from '../products/entities/product.entity'
import { PlatformSettingsService } from '../settings/platform-settings.service'
import { Supplier, SupplierMode, ValidationStatus } from '../suppliers/supplier.entity'
import { WalletTransactionType } from '../wallet/entities/wallet-transaction.entity'
import { WalletService } from '../wallet/wallet.service'
import { ExportDepartureStatus, ExportProfileStatus, ExportReception, ExportShipmentStatus } from './contracts/terroir.contract'
import { ExportCheckoutDraft } from './entities/export-checkout-draft.entity'
import { ExportDeparture } from './entities/export-departure.entity'
import { ExportPickupPoint } from './entities/export-pickup-point.entity'
import { ExportProfile } from './entities/export-profile.entity'
import { ExportShipmentEvent } from './entities/export-shipment-event.entity'
import { ExportShipment } from './entities/export-shipment.entity'
import { ExportCatalogService, lineWeight, packLinePrice } from './export-catalog.service'
import { ExportCountriesService } from './export-countries.service'
import { ExportLogisticsService } from './export-logistics.service'
import { billedKg, estimateWeight, insurancePrice, marginKg, orderDeadline, packSplit, shippingPrice } from './terroir-math'
import { TerroirSettlementService } from './terroir-settlement.service'
import { terroirError } from './terroir-texts'

/** How long an unpaid card checkout keeps its kilos on a departure. */
export const CARD_HOLD_MINUTES = 30

export type UnavailableReason = 'NOT_FOUND' | 'NOT_EXPORTABLE' | 'OUT_OF_STOCK' | 'PACK_UNAVAILABLE'

/** A cart line as the buyer sees it: a product or a whole pack. */
export interface QuoteLine {
  productId: string | null
  variantId: string | null
  packId: string | null
  name: string
  imageUrl: string | null
  quantity: number
  unitPrice: number
  total: number
  weightG: number
  shopName: string | null
}

/** One shop's share of the parcel: ordinary lines, merged, at shop prices. */
interface ShopBasket {
  supplier: Supplier
  items: Map<string, { productId: string, variantId?: string, quantity: number }>
  /** Shop packs only: pack price minus its lines (negative = the shop's discount). */
  packAdjustment: number
  packIds: string[]
}

interface CartAnalysis {
  lines: QuoteLine[]
  baskets: Map<string, ShopBasket>
  /** eBio packs: margin minus compensation, at today's shop prices. */
  ebioPackDelta: number
  /** Products only, before packaging. */
  itemsWeightG: number
  productIds: string[]
  unavailable: Array<{ productId: string | null, packId: string | null, reason: UnavailableReason }>
}

/** What a terroir cart costs towards one country, on one departure. */
export interface TerroirQuote {
  country: string
  lines: QuoteLine[]
  estimatedWeightG: number
  billedKg: number | null
  marginKg: number
  suggestions: ExportProfile[]
  selected: OfferedDeparture | null
  offers: OfferedDeparture[]
  departures: Map<string, ExportDeparture>
  pickupPoints: ExportPickupPoint[]
  collectionDays: number
  itemsTotal: number
  shippingPrice: number
  homeDeliveryFee: number
  insurancePrice: number
  total: number
  homeDeliveryQuote: number | null
  insuranceQuote: number
  unavailable: CartAnalysis['unavailable']
  currency: DisplayCurrency
  rate: number | null
}

export interface TerroirCheckoutCreated {
  checkout: Checkout
  shipment: ExportShipment
  paymentUrl: string | null
  displayTotal: number | null
}

function cents(value: number): number {
  return Math.round(value * 100) / 100
}

function lineKey(productId: string, variantId: string | null | undefined): string {
  return `${productId}:${variantId ?? ''}`
}

function departureUnavailable(message = 'Ce départ n\'est plus disponible. Choisissez-en un autre.') {
  return terroirError(HttpStatus.CONFLICT, 'DEPARTURE_UNAVAILABLE', message)
}

/**
 * The terroir checkout (011, US1): one parcel for one buyer, one departure,
 * one destination, grouping one EXPORT order per shop.
 *
 * Shipping, home delivery and insurance never sit on an order, an order's
 * `deliveryFee` would be paid out to the shop (research §3). They live on the
 * parcel and in the checkout total, and go to eBio's EXPORT account when the
 * payment is confirmed.
 */
@Injectable()
export class TerroirCheckoutService {
  private readonly logger = new Logger(TerroirCheckoutService.name)

  constructor(
    private readonly em: EntityManager,
    private readonly orders: OrdersService,
    private readonly wallets: WalletService,
    private readonly catalog: ExportCatalogService,
    private readonly logistics: ExportLogisticsService,
    private readonly settlement: TerroirSettlementService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly exchangeRates: ExchangeRatesService,
    private readonly orderEmails: OrderEmailsService,
    private readonly countries: ExportCountriesService,
  ) {}

  /**
   * Weight, departures, frozen-to-be prices, options and what cannot leave.
   * Lenient: an unavailable line, a departure no longer offered or a home
   * delivery not proposed are reported, never thrown. Saves the buyer's
   * draft for the 48 h reminder (FR-033).
   */
  async preview(buyerId: string, input: TerroirCheckoutInput): Promise<TerroirQuote> {
    const destination = await this.countries.requireActive(input.country)
    const country = destination.code
    const currency = input.displayCurrency ?? destination.displayCurrency
    const analysis = await this.analyse(input.lines)
    const settings = await this.platformSettings.getTerroirExportSettings()
    const weightG = estimateWeight([{ weightG: analysis.itemsWeightG, quantity: 1 }], settings.packagingWeightG)
    const { offers, departures } = await this.logistics.offerableDepartures(country, weightG)
    const selected = offers.find(offer => offer.departure.id === input.departureId) ?? offers[0] ?? null
    const itemsTotal = await this.priceItems(buyerId, analysis)

    const homeDeliveryQuote = selected?.rate.homeDeliveryFee ?? null
    const insuranceQuote = itemsTotal > 0 ? insurancePrice(itemsTotal, settings.insuranceRateBps, settings.insuranceMin) : 0
    const shipping = selected?.shippingPrice ?? 0
    const home = input.reception === ExportReception.HOME && homeDeliveryQuote != null ? homeDeliveryQuote : 0
    const insurance = input.insured ? insuranceQuote : 0
    const margin = selected ? marginKg(weightG, selected.rate) : 0

    const pickupPoints = await this.logistics.pickupPointsFor(offers, departures, country)

    if (analysis.lines.length > 0) {
      await this.saveDraft(buyerId, country, selected?.departure.id ?? null)
    }

    return {
      country,
      lines: analysis.lines,
      estimatedWeightG: weightG,
      billedKg: selected ? billedKg(weightG, selected.rate) : null,
      marginKg: margin,
      suggestions: await this.catalog.suggestionsWithin(Math.floor(margin * 1000), analysis.productIds),
      selected,
      offers,
      departures,
      pickupPoints,
      collectionDays: settings.collectionDays,
      itemsTotal,
      shippingPrice: shipping,
      homeDeliveryFee: home,
      insurancePrice: insurance,
      total: cents(itemsTotal + shipping + home + insurance),
      homeDeliveryQuote,
      insuranceQuote,
      unavailable: analysis.unavailable,
      currency,
      rate: await this.exchangeRates.effectiveRate(currency),
    }
  }

  /**
   * Places the parcel. In one transaction: the departure locked
   * (`FOR UPDATE`), its capacity and deadline checked again, one EXPORT order
   * per shop at zero delivery fee, the checkout, the parcel with its prices
   * frozen, and, paid from the wallet, the debit and the escrowed payments.
   * A card checkout holds its kilos for {@link CARD_HOLD_MINUTES} minutes.
   */
  async create(buyerId: string, input: TerroirCheckoutInput): Promise<TerroirCheckoutCreated> {
    const buyer = await this.em.findOneOrFail(User, { id: buyerId })
    assertBuyerVerified(buyer)
    if (!input.departureId) {
      throw departureUnavailable('Choisissez un départ.')
    }
    if (input.reception === ExportReception.HOME && !input.homeAddress) {
      throw terroirError(HttpStatus.BAD_REQUEST, 'HOME_ADDRESS_REQUIRED', 'Indiquez l\'adresse de livraison.')
    }

    const destination = await this.countries.requireActive(input.country)
    const country = destination.code
    const currency = input.displayCurrency ?? destination.displayCurrency

    const analysis = await this.analyse(input.lines)
    if (analysis.unavailable.length > 0 || analysis.lines.length === 0) {
      throw terroirError(HttpStatus.CONFLICT, 'TERROIR_LINE_UNAVAILABLE', 'Un article de votre panier ne peut plus partir. Actualisez votre panier.')
    }
    const settings = await this.platformSettings.getTerroirExportSettings()
    const weightG = estimateWeight([{ weightG: analysis.itemsWeightG, quantity: 1 }], settings.packagingWeightG)
    const baskets = [...analysis.baskets.values()]
    const orderNumbers = await this.orders.allocateOrderNumbers(baskets.length)
    const departureId = input.departureId
    const paymentMethod = input.paymentMethod === 'WALLET' ? PaymentMethod.WALLET : PaymentMethod.FEDAPAY

    const { checkout, shipment, displayTotal } = await this.em.transactional(async (em) => {
      const [locked] = await em.execute<Array<{ id: string }>>(`SELECT id FROM export_departures WHERE id = ? FOR UPDATE`, [departureId])
      if (!locked) {
        throw departureUnavailable()
      }
      const departure = await em.findOneOrFail(ExportDeparture, { id: departureId }, { populate: ['agency', 'rates'], refresh: true })
      const rateRow = departure.rates.getItems().find(rate => rate.country === country)
      if (departure.status !== ExportDepartureStatus.OPEN || !rateRow
        || orderDeadline(departure.depositDeadline, settings.collectionDays).getTime() <= Date.now()) {
        throw departureUnavailable()
      }
      if (rateRow.maxWeightKg != null && weightG > Number(rateRow.maxWeightKg) * 1000) {
        throw departureUnavailable('Votre colis dépasse le poids maximum de ce départ.')
      }
      if (departure.capacityKg != null) {
        const taken = await this.logistics.reservedG(departure.id, em) + await this.heldG(em, departure.id)
        if (taken + weightG > Number(departure.capacityKg) * 1000) {
          throw departureUnavailable('Ce départ est complet. Choisissez-en un autre.')
        }
      }
      const rate = { pricePerKg: Number(rateRow.pricePerKg), minBilledKg: Number(rateRow.minBilledKg) }

      let pickupPoint: ExportPickupPoint | null = null
      let home = 0
      if (input.reception === ExportReception.HOME) {
        if (rateRow.homeDeliveryFee == null) {
          throw terroirError(HttpStatus.BAD_REQUEST, 'HOME_DELIVERY_UNAVAILABLE', 'Ce départ ne propose pas la livraison à domicile dans ce pays.')
        }
        home = Number(rateRow.homeDeliveryFee)
      }
      else {
        pickupPoint = await this.resolvePickupPoint(em, departure, country, input.pickupPointId ?? null)
      }

      const checkout = em.create(Checkout, {
        buyer,
        totalAmount: 0,
        itemsTotal: 0,
        deliveryFee: 0,
        discount: 0,
        paymentMethod,
        status: CheckoutStatus.PENDING,
        deliveryMode: CheckoutDeliveryMode.EXPORT,
        deliveryAddress: input.reception === ExportReception.HOME ? input.homeAddress ?? undefined : undefined,
      })

      const created: Order[] = []
      for (const [index, basket] of baskets.entries()) {
        const order = await this.orders.create(
          buyerId,
          {
            supplierId: basket.supplier.id,
            items: [...basket.items.values()],
            pickupMode: PickupMode.EXPORT,
            paymentMethod,
          } as Parameters<OrdersService['create']>[1],
          { checkout, orderNumber: orderNumbers[index], deliveryFee: 0 },
        )
        this.applyPackAdjustment(order, basket)
        created.push(order)
      }

      const itemsTotal = cents(created.reduce((total, order) => total + Number(order.totalAmount), 0) + analysis.ebioPackDelta)
      const shipping = shippingPrice(weightG, rate)
      const insurance = input.insured ? insurancePrice(itemsTotal, settings.insuranceRateBps, settings.insuranceMin) : 0
      const total = cents(itemsTotal + shipping + home + insurance)
      const frozen = await this.exchangeRates.freeze(total, currency)

      checkout.totalAmount = total
      checkout.itemsTotal = itemsTotal
      checkout.displayCurrency = frozen ? currency : 'XOF'
      checkout.fxRate = frozen?.fxRate ?? null
      checkout.fxMarginBps = frozen?.fxMarginBps ?? null
      checkout.displayTotal = frozen?.displayTotal ?? null

      const shipment = em.create(ExportShipment, {
        checkout,
        buyer,
        departure,
        country,
        reception: input.reception,
        pickupPoint,
        homeAddress: input.reception === ExportReception.HOME ? input.homeAddress ?? null : null,
        estimatedWeightG: weightG,
        pricePerKg: String(rate.pricePerKg),
        minBilledKg: String(rate.minBilledKg),
        shippingPrice: String(shipping),
        homeDeliveryFee: String(home),
        insured: input.insured,
        insurancePrice: String(insurance),
        declaredValue: String(itemsTotal),
        giftRecipientName: input.gift?.name ?? null,
        giftRecipientEmail: input.gift?.email ?? null,
        giftRecipientPhone: input.gift?.phone ?? null,
        giftMessage: input.gift?.message ?? null,
        status: ExportShipmentStatus.PENDING_PAYMENT,
        trackingToken: randomBytes(16).toString('hex'),
        cartLines: input.lines.map(line => ({
          productId: line.productId ?? null,
          variantId: line.productId ? line.variantId ?? null : null,
          packId: line.packId ?? null,
          quantity: line.quantity,
        })),
      })

      if (paymentMethod === PaymentMethod.WALLET) {
        const wallet = await this.wallets.getOrCreate({ userId: buyer.id })
        await this.wallets.debit(wallet.id, {
          type: WalletTransactionType.ORDER_PAYMENT,
          amount: total,
          description: `Valise du pays, ${created.length > 1 ? `${created.length} boutiques` : `commande ${created[0].orderNumber}`}`,
          orderId: created[0].id,
        })
        // Each shop is escrowed its own order, never a share of the shipping.
        for (const order of created) {
          em.create(Payment, {
            checkout,
            order,
            amount: Number(order.totalAmount),
            provider: PaymentProvider.FEDAPAY,
            paymentMethod: 'WALLET',
            status: PaymentStatus.ESCROW,
            paidAt: new Date(),
          })
        }
        checkout.status = CheckoutStatus.PAID
        shipment.status = ExportShipmentStatus.PAID
        em.create(ExportShipmentEvent, { shipment, step: ExportShipmentStatus.PAID, message: null, author: null })
      }

      await em.flush()
      return { checkout, shipment, displayTotal: frozen?.displayTotal ?? null }
    })

    await this.em.nativeDelete(ExportCheckoutDraft, { user: buyerId })

    // A card checkout is paid through the existing cart flow, the app calls
    // /payments/cart/initiate then /verify, so it is not opened here: one
    // provider transaction per attempt, never two.
    if (paymentMethod === PaymentMethod.WALLET) {
      const orderIds = (await this.em.find(Order, { checkout: checkout.id })).map(order => order.id)
      for (const orderId of orderIds) {
        await this.orders.notifyOrderPlaced(orderId)
      }
      await this.settlement.postPaid(shipment.id)
    }
    return { checkout, shipment, paymentUrl: null, displayTotal }
  }

  // ===== INTERNALS =====

  /** Kilos held by card checkouts still waiting for their payment. */
  private async heldG(em: EntityManager, departureId: string): Promise<number> {
    const [row] = await em.execute<Array<{ held: number }>>(
      `SELECT COALESCE(SUM(estimated_weight_g), 0)::int AS held
       FROM export_shipments
       WHERE departure_id = ? AND status = ? AND created_at > NOW() - (? * INTERVAL '1 minute')`,
      [departureId, ExportShipmentStatus.PENDING_PAYMENT, CARD_HOLD_MINUTES],
    )
    return Number(row?.held ?? 0)
  }

  private async resolvePickupPoint(em: EntityManager, departure: ExportDeparture, country: string, pickupPointId: string | null): Promise<ExportPickupPoint> {
    const point = pickupPointId
      ? await em.findOne(ExportPickupPoint, { id: pickupPointId, agency: departure.agency.id, country, active: true })
      : await em.findOne(ExportPickupPoint, { agency: departure.agency.id, country, active: true }, { orderBy: { city: 'ASC', createdAt: 'ASC' } })
    if (!point) {
      throw terroirError(HttpStatus.BAD_REQUEST, 'PICKUP_POINT_REQUIRED', 'Choisissez un point de retrait de l\'agence de ce départ.')
    }
    return point
  }

  /**
   * A shop pack sold under its lines is the shop's own discount (research
   * §7); above them, the shop's own price. Commission follows the amount.
   */
  private applyPackAdjustment(order: Order, basket: ShopBasket): void {
    order.exportPackId = basket.packIds[0] ?? null
    const adjustment = cents(basket.packAdjustment)
    if (adjustment === 0) {
      return
    }
    const before = Number(order.totalAmount)
    const after = Math.max(0, cents(before + adjustment))
    if (adjustment < 0) {
      order.discountAmount = cents(Number(order.discountAmount) - adjustment)
      order.discountFundedBy = 'SUPPLIER'
    }
    order.commissionAmount = before > 0 ? cents(Number(order.commissionAmount) * after / before) : 0
    order.totalAmount = after
  }

  /** What the buyer pays for the products: shop prices, pack adjustments, eBio pack delta. */
  private async priceItems(buyerId: string, analysis: CartAnalysis): Promise<number> {
    let total = analysis.ebioPackDelta
    for (const basket of analysis.baskets.values()) {
      const preview = await this.orders.preview(buyerId, {
        supplierId: basket.supplier.id,
        items: [...basket.items.values()],
        pickupMode: PickupMode.EXPORT,
      } as Parameters<OrdersService['preview']>[1])
      total += Math.max(0, preview.itemsTotal - preview.discount + basket.packAdjustment)
    }
    return cents(total)
  }

  private async saveDraft(buyerId: string, country: string, departureId: string | null): Promise<void> {
    try {
      await this.em.getConnection().execute(
        `INSERT INTO export_checkout_drafts (user_id, departure_id, country, updated_at, reminded_at)
         VALUES (?, ?, ?, NOW(), NULL)
         ON CONFLICT (user_id) DO UPDATE SET departure_id = EXCLUDED.departure_id, country = EXCLUDED.country, updated_at = NOW(), reminded_at = NULL`,
        [buyerId, departureId, country],
      )
    }
    catch (error) {
      this.logger.warn(`Brouillon terroir de ${buyerId} non enregistré : ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Unfolds packs into ordinary lines per shop (packSplit), checks every
   * product is approved for export, on sale and in stock, stock added up
   * across lines sharing a shelf, and weighs what can leave.
   */
  private async analyse(input: TerroirCheckoutInput['lines']): Promise<CartAnalysis> {
    const productIds = [...new Set(input.map(line => line.productId).filter((id): id is string => Boolean(id)))]
    const packIds = [...new Set(input.map(line => line.packId).filter((id): id is string => Boolean(id)))]
    const products = productIds.length === 0 ? [] : await this.em.find(Product, { id: { $in: productIds } }, { populate: ['supplier'] })
    const productById = new Map(products.map(product => [product.id, product]))
    const variantIds = input.map(line => line.variantId).filter((id): id is string => Boolean(id))
    const variants = variantIds.length === 0 ? [] : await this.em.find(ProductVariant, { id: { $in: variantIds } })
    const variantById = new Map(variants.map(variant => [variant.id, variant]))
    const packViews = await this.catalog.packsForCheckout(packIds)
    const packById = new Map(packViews.map(view => [view.pack.id, view]))

    const allProductIds = [...new Set([...productIds, ...packViews.flatMap(view => view.pack.items.getItems().map(item => item.product.id))])]
    const profiles = allProductIds.length === 0 ? [] : await this.em.find(ExportProfile, { product: { $in: allProductIds } })
    const profileById = new Map(profiles.map(profile => [profile.product.id, profile]))

    const unavailable: CartAnalysis['unavailable'] = []
    // Units each stock holder must give, across every line.
    const needed = new Map<{ stock: number }, number>()
    const holdersOf = new Map<number, Array<{ stock: number }>>()
    const draw = (index: number, product: Product, variant: ProductVariant | null, quantity: number) => {
      const taken = stockDraw({ quantity, product, variant })
      needed.set(taken.holder, (needed.get(taken.holder) ?? 0) + taken.units)
      holdersOf.set(index, [...(holdersOf.get(index) ?? []), taken.holder])
    }

    const accepted: Array<{ index: number, product?: { product: Product, variant: ProductVariant | null }, pack?: PackView }> = []
    for (const [index, line] of input.entries()) {
      if (line.packId) {
        const view = packById.get(line.packId)
        if (!view || !view.orderable) {
          unavailable.push({ productId: null, packId: line.packId, reason: view ? 'PACK_UNAVAILABLE' : 'NOT_FOUND' })
          continue
        }
        for (const item of view.pack.items.getItems()) {
          draw(index, item.product, item.variant ?? null, item.quantity * line.quantity)
        }
        accepted.push({ index, pack: view })
        continue
      }
      const product = productById.get(line.productId!)
      const variant = line.variantId ? variantById.get(line.variantId) ?? null : null
      if (!product || (line.variantId && variant?.product.id !== product.id)) {
        unavailable.push({ productId: line.productId ?? null, packId: null, reason: 'NOT_FOUND' })
        continue
      }
      if (!this.exportable(product, profileById.get(product.id))) {
        unavailable.push({ productId: product.id, packId: null, reason: 'NOT_EXPORTABLE' })
        continue
      }
      draw(index, product, variant, line.quantity)
      accepted.push({ index, product: { product, variant } })
    }

    const short = new Set([...needed.entries()].filter(([holder, units]) => holder.stock < units).map(([holder]) => holder))
    const baskets = new Map<string, ShopBasket>()
    const lines: QuoteLine[] = []
    let ebioPackDelta = 0
    let itemsWeightG = 0
    const basketOf = (supplier: Supplier): ShopBasket => {
      const existing = baskets.get(supplier.id)
      if (existing) {
        return existing
      }
      const basket: ShopBasket = { supplier, items: new Map(), packAdjustment: 0, packIds: [] }
      baskets.set(supplier.id, basket)
      return basket
    }
    const addItem = (basket: ShopBasket, productId: string, variantId: string | null, quantity: number) => {
      const key = lineKey(productId, variantId)
      const item = basket.items.get(key) ?? { productId, ...(variantId ? { variantId } : {}), quantity: 0 }
      item.quantity += quantity
      basket.items.set(key, item)
    }

    for (const entry of accepted) {
      const line = input[entry.index]
      if ((holdersOf.get(entry.index) ?? []).some(holder => short.has(holder))) {
        unavailable.push({ productId: line.productId ?? null, packId: line.packId ?? null, reason: 'OUT_OF_STOCK' })
        continue
      }
      if (entry.product) {
        const { product, variant } = entry.product
        const weightG = lineWeight(profileById.get(product.id)!, variant, line.quantity)
        const unitPrice = Number(variant?.pricePerUnit ?? product.pricePerUnit)
        addItem(basketOf(product.supplier as Supplier), product.id, variant?.id ?? null, line.quantity)
        itemsWeightG += weightG
        lines.push({
          productId: product.id,
          variantId: variant?.id ?? null,
          packId: null,
          name: variant ? `${product.name}, ${variant.label}` : product.name,
          imageUrl: product.photos?.[0] ?? null,
          quantity: line.quantity,
          unitPrice,
          total: cents(unitPrice * line.quantity),
          weightG,
          shopName: (product.supplier as Supplier).shopName,
        })
        continue
      }
      const { pack } = entry.pack!
      const items = pack.items.getItems()
      const split = packSplit(
        { price: Number(pack.price), supplierId: pack.supplier?.id ?? null },
        items.map(item => ({
          productId: item.product.id,
          variantId: item.variant?.id ?? null,
          supplierId: item.product.supplier.id,
          unitPrice: packLinePrice(item),
          quantity: item.quantity,
        })),
        line.quantity,
      )
      const supplierById = new Map(items.map(item => [item.product.supplier.id, item.product.supplier as Supplier]))
      for (const group of split.bySupplier) {
        const basket = basketOf(supplierById.get(group.supplierId)!)
        for (const packLine of group.lines) {
          addItem(basket, packLine.productId, packLine.variantId, packLine.quantity)
        }
        if (!basket.packIds.includes(pack.id)) {
          basket.packIds.push(pack.id)
        }
      }
      if (pack.supplier) {
        basketOf(supplierById.get(pack.supplier.id) ?? pack.supplier as Supplier).packAdjustment += split.supplierAdjustment
      }
      else {
        ebioPackDelta += split.margin - split.compensation
      }
      const weightG = items.reduce((total, item) => {
        const profile = profileById.get(item.product.id)
        return total + (profile ? lineWeight(profile, item.variant, item.quantity * line.quantity) : 0)
      }, 0)
      itemsWeightG += weightG
      lines.push({
        productId: null,
        variantId: null,
        packId: pack.id,
        name: pack.name,
        imageUrl: pack.photos?.[0] ?? items[0]?.product.photos?.[0] ?? null,
        quantity: line.quantity,
        unitPrice: Number(pack.price),
        total: split.packTotal,
        weightG,
        shopName: pack.supplier?.shopName ?? null,
      })
    }

    return {
      lines,
      baskets,
      ebioPackDelta: cents(ebioPackDelta),
      itemsWeightG,
      productIds: allProductIds,
      unavailable,
    }
  }

  private exportable(product: Product, profile: ExportProfile | undefined): boolean {
    const supplier = product.supplier as Supplier
    return profile?.status === ExportProfileStatus.EXPORTABLE
      && product.status === ProductStatus.ACTIVE
      && product.moderationStatus === ProductModeration.APPROVED
      && supplier.validationStatus === ValidationStatus.VALIDATED
      && supplier.mode === SupplierMode.ORDER
  }
}
