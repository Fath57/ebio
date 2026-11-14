import type { Order } from '../orders/entities/order.entity'
import type { ProductVariant } from '../products/entities/product-variant.entity'
import type { AdminExportProduct, AdminExportProductsResponse, ExportAdminShipment, ExportAgencyResponse, ExportCountryAdmin, ExportCriteriaGuide, ExportDepartureDetail, ExportDepartureResponse, ExportPackResponse, ExportPickupPointResponse, ExportProfileResponse, TerroirCatalogResponse, TerroirCheckoutPreview, TerroirCheckoutResult, TerroirCountry, TerroirDepartureOffer, TerroirDeparturesResponse, TerroirExportability, TerroirExportabilityResponse, TerroirPackDetail, TerroirProductDetail, TerroirShipmentDetail, TerroirShipmentSummary, TerroirSupplementResult, TerroirTracking } from './contracts/terroir.contract'
import type { ExportAgency } from './entities/export-agency.entity'
import type { ExportDeparture } from './entities/export-departure.entity'
import type { ExportPickupPoint } from './entities/export-pickup-point.entity'
import type { ExportProfile } from './entities/export-profile.entity'
import type { ExportShipment } from './entities/export-shipment.entity'
import type { AdminExportProductsPage, ClientCatalog, ClientPackView, PackView } from './export-catalog.service'
import type { AdminCountryView, ClientCountryView } from './export-countries.service'
import type { ExportThresholds } from './export-criteria'
import type { DepartureDetailView, DepartureView } from './export-logistics.service'
import type { AdminShipmentView, ShipmentView } from './export-shipments.service'
import type { SupplementOutcome } from './export-supplement.service'
import type { ProductExportability } from './exportability.service'
import type { TerroirCheckoutCreated, TerroirQuote } from './terroir-checkout.service'
import type { OfferedDeparture } from './terroir-math'
import { toDisplayAmount } from '../currency/fx-math'
import { EXPORT_CRITERION_KEYS, ExportPackStatus, ExportSupplementStatus } from './contracts/terroir.contract'
import { ADMIN_EXPORT_PAGE_SIZE, lineWeight, packLinePrice } from './export-catalog.service'
import { packCriteria, profileCriterionTexts } from './export-criteria'
import { toExportProfileResponse } from './export-profile.mapper'
import { SUPPLEMENT_WINDOW_HOURS } from './export-shipments.service'
import { fillRatio, orderDeadline } from './terroir-math'
import { addDays, shortName } from './terroir-texts'

function nullableNumber(value: string | null | undefined): number | null {
  return value == null ? null : Number(value)
}

/** An FCFA amount in the display currency; null without a rate (FCFA shown). */
function display(amount: number, rate: number | null): number | null {
  return rate === null ? null : toDisplayAmount(amount, rate)
}

function arrivalOf(departure: Pick<ExportDeparture, 'departsOn' | 'transitMinDays' | 'transitMaxDays'>) {
  return {
    from: addDays(departure.departsOn, departure.transitMinDays),
    to: addDays(departure.departsOn, departure.transitMaxDays),
  }
}

function shipmentLines(orders: Order[], removedItemIds: string[] = []) {
  const removed = new Set(removedItemIds)
  return orders.flatMap(order => order.items.getItems().filter(item => !removed.has(item.id)).map(item => ({
    id: item.id,
    name: item.variant ? `${item.product.name}, ${(item.variant as ProductVariant).label}` : item.product.name,
    quantity: item.quantity,
    imageUrl: item.product.photos?.[0] ?? null,
    shopName: order.supplier.shopName,
  })))
}

function pickupPointOf(view: ShipmentView) {
  const point = view.shipment.pickupPoint
  return point ? { city: point.city, address: point.address, openingHours: point.openingHours ?? null } : null
}

/** The supplement as the buyer reads it, its 48 h deadline while it is asked. */
function supplementOf(shipment: ExportShipment) {
  const requestedAt = shipment.supplementRequestedAt ?? null
  return {
    status: shipment.supplementStatus,
    amount: shipment.supplementAmount == null ? null : Number(shipment.supplementAmount),
    requestedAt: requestedAt?.toISOString() ?? null,
    deadline: requestedAt && shipment.supplementStatus === ExportSupplementStatus.REQUESTED
      ? new Date(requestedAt.getTime() + SUPPLEMENT_WINDOW_HOURS * 60 * 60 * 1000).toISOString()
      : null,
  }
}

function eventsOf(view: ShipmentView) {
  return view.events.map(event => ({
    step: event.step ?? null,
    message: event.message ?? null,
    pickupPoint: event.pickupPointSnapshot ?? null,
    at: event.createdAt.toISOString(),
  }))
}

/** Entities → contracts, field by field: getters and populated relations are not serialised. */
export const TerroirMapper = {
  toAdminCountry(view: AdminCountryView): ExportCountryAdmin {
    const { country } = view
    return {
      code: country.code,
      name: country.name,
      toPhrase: country.toPhrase,
      inPhrase: country.inPhrase,
      displayCurrency: country.displayCurrency,
      flagEmoji: country.flagEmoji ?? null,
      sortOrder: country.sortOrder,
      isActive: country.isActive,
      counts: view.counts,
      createdAt: country.createdAt.toISOString(),
      updatedAt: country.updatedAt.toISOString(),
    }
  },

  toClientCountry(view: ClientCountryView): TerroirCountry {
    const { country } = view
    return {
      code: country.code,
      name: country.name,
      toPhrase: country.toPhrase,
      inPhrase: country.inPhrase,
      displayCurrency: country.displayCurrency,
      flagEmoji: country.flagEmoji ?? null,
      hasOpenDeparture: view.hasOpenDeparture,
    }
  },

  toPickupPoint(point: ExportPickupPoint): ExportPickupPointResponse {
    return {
      id: point.id,
      agencyId: point.agency.id,
      country: point.country,
      city: point.city,
      address: point.address,
      openingHours: point.openingHours ?? null,
      active: point.active,
    }
  },

  toAgency(agency: ExportAgency): ExportAgencyResponse {
    return {
      id: agency.id,
      name: agency.name,
      contactName: agency.contactName ?? null,
      contactPhone: agency.contactPhone ?? null,
      contactEmail: agency.contactEmail ?? null,
      notes: agency.notes ?? null,
      active: agency.active,
      pickupPoints: agency.pickupPoints.isInitialized() ? agency.pickupPoints.getItems().map(TerroirMapper.toPickupPoint) : [],
      createdAt: agency.createdAt.toISOString(),
    }
  },

  toDeparture(view: DepartureView): ExportDepartureResponse {
    const { departure } = view
    const capacityKg = nullableNumber(departure.capacityKg)
    return {
      id: departure.id,
      agency: { id: departure.agency.id, name: departure.agency.name },
      departsOn: departure.departsOn,
      depositDeadline: departure.depositDeadline.toISOString(),
      orderBefore: orderDeadline(departure.depositDeadline, view.collectionDays).toISOString(),
      transitMinDays: departure.transitMinDays,
      transitMaxDays: departure.transitMaxDays,
      arrival: {
        from: addDays(departure.departsOn, departure.transitMinDays),
        to: addDays(departure.departsOn, departure.transitMaxDays),
      },
      status: departure.status,
      rates: departure.rates.getItems()
        .map(rate => ({
          country: rate.country,
          pricePerKg: Number(rate.pricePerKg),
          minBilledKg: Number(rate.minBilledKg),
          maxWeightKg: nullableNumber(rate.maxWeightKg),
          homeDeliveryFee: nullableNumber(rate.homeDeliveryFee),
        }))
        .sort((a, b) => a.country.localeCompare(b.country)),
      fill: {
        reservedKg: Math.round(view.reservedG) / 1000,
        capacityKg,
        ratio: fillRatio(view.reservedG, capacityKg),
      },
      shipmentCount: view.shipmentCount,
      createdAt: departure.createdAt.toISOString(),
    }
  },

  toDepartureDetail(view: DepartureDetailView): ExportDepartureDetail {
    return {
      ...TerroirMapper.toDeparture(view),
      shipments: view.shipments.map(shipment => ({
        id: shipment.id,
        buyer: shortName(shipment.buyer.name),
        country: shipment.country,
        status: shipment.status,
        estimatedWeightG: shipment.estimatedWeightG,
        actualWeightG: shipment.actualWeightG ?? null,
        insured: shipment.insured,
      })),
      collection: view.collection.map(group => ({
        ...group,
        collection: group.collection
          ? {
              ...group.collection,
              pickedUpAt: group.collection.pickedUpAt?.toISOString() ?? null,
              receivedAt: group.collection.receivedAt?.toISOString() ?? null,
            }
          : null,
      })),
    }
  },

  /** `thresholds`: today's criteria settings, for the wording of the criteria. */
  toProfile(profile: ExportProfile, thresholds: ExportThresholds): ExportProfileResponse {
    return toExportProfileResponse(profile, thresholds)
  },

  /** The supplier guide: today's thresholds, banned categories and every criterion. */
  toCriteriaGuide(settings: ExportThresholds, bannedCategories: Array<{ slug: string, name: string }>): ExportCriteriaGuide {
    const texts = profileCriterionTexts(settings)
    return {
      minShelfLifeDays: settings.minShelfLifeDays,
      maxUnitWeightG: settings.maxUnitWeightG,
      bannedCategories,
      criteria: EXPORT_CRITERION_KEYS.map(key => ({ key, ...texts[key] })),
    }
  },

  toPack(view: PackView): ExportPackResponse {
    const { pack } = view
    const price = Number(pack.price)
    const missing = pack.missingCriteria ?? []
    const withdrawn = pack.status === ExportPackStatus.WITHDRAWN
    return {
      id: pack.id,
      supplierId: pack.supplier?.id ?? null,
      shopName: pack.supplier?.shopName ?? null,
      name: pack.name,
      description: pack.description ?? null,
      photos: pack.photos ?? [],
      price,
      status: pack.status,
      criteria: packCriteria(missing),
      missingCount: missing.length,
      withdrawnReason: withdrawn ? pack.withdrawnReason ?? null : null,
      withdrawnAt: withdrawn ? pack.withdrawnAt?.toISOString() ?? null : null,
      items: pack.items.getItems().map(item => ({
        productId: item.product.id,
        variantId: item.variant?.id ?? null,
        quantity: item.quantity,
        name: item.variant ? `${item.product.name}, ${item.variant.label}` : item.product.name,
        imageUrl: item.product.photos?.[0] ?? null,
        supplierId: item.product.supplier.id,
        shopName: item.product.supplier.shopName,
        unitPrice: packLinePrice(item),
        exportStatus: view.profiles.get(item.product.id) ?? null,
      })),
      linesTotal: view.linesTotal,
      difference: Math.round((price - view.linesTotal) * 100) / 100,
      orderable: view.orderable,
      createdAt: pack.createdAt.toISOString(),
    }
  },

  toAdminExportProduct(profile: ExportProfile, thresholds: ExportThresholds): AdminExportProduct {
    return {
      ...TerroirMapper.toProfile(profile, thresholds),
      productName: profile.product.name,
      imageUrl: profile.product.photos?.[0] ?? null,
      supplierId: profile.product.supplier.id,
      shopName: profile.product.supplier.shopName,
      categoryName: profile.product.category.name,
      composition: {
        ingredients: profile.product.ingredients ?? null,
        allergens: profile.product.allergens ?? [],
        conservation: profile.product.conservation ?? null,
      },
    }
  },

  toAdminExportProducts(page: AdminExportProductsPage, thresholds: ExportThresholds): AdminExportProductsResponse {
    return {
      data: page.profiles.map(profile => TerroirMapper.toAdminExportProduct(profile, thresholds)),
      total: page.total,
      page: page.page,
      pageSize: ADMIN_EXPORT_PAGE_SIZE,
      counts: page.counts,
    }
  },

  // ===== BUYERS ABROAD =====

  toCatalog(catalog: ClientCatalog, country: string, page: number, currency: string, rate: number | null): TerroirCatalogResponse {
    return {
      country,
      currency: rate === null ? 'XOF' : currency,
      products: catalog.profiles.map((profile) => {
        const product = profile.product
        const price = Number(product.pricePerUnit)
        return {
          id: product.id,
          name: product.name,
          imageUrl: product.photos?.[0] ?? null,
          price,
          displayPrice: display(price, rate),
          // Exportable profiles only: the weight is a criterion, always set.
          weightG: profile.packedWeightG ?? 0,
          supplierId: product.supplier.id,
          shopName: product.supplier.shopName,
          categoryName: product.category.name,
          badge: profile.hasBadge,
          origin: { producer: profile.originProducer ?? null, place: profile.originPlace ?? null },
        }
      }),
      packs: catalog.packs.map(({ pack }) => ({
        id: pack.id,
        name: pack.name,
        imageUrl: pack.photos?.[0] ?? pack.items.getItems()[0]?.product.photos?.[0] ?? null,
        price: Number(pack.price),
        displayPrice: display(Number(pack.price), rate),
        weightG: catalog.packWeights.get(pack.id) ?? 0,
        shopName: pack.supplier?.shopName ?? null,
        itemCount: pack.items.getItems().reduce((total, item) => total + item.quantity, 0),
      })),
      page,
      hasMore: catalog.hasMore,
    }
  },

  toClientProduct(view: { profile: ExportProfile, variants: ProductVariant[] }, currency: string, rate: number | null): TerroirProductDetail {
    const { profile, variants } = view
    const product = profile.product
    const price = Number(product.pricePerUnit)
    return {
      id: product.id,
      name: product.name,
      description: product.description ?? null,
      photos: product.photos ?? [],
      price,
      displayPrice: display(price, rate),
      currency: rate === null ? 'XOF' : currency,
      weightG: profile.packedWeightG ?? 0,
      dimensionsCm: { length: profile.lengthCm ?? null, width: profile.widthCm ?? null, height: profile.heightCm ?? null },
      shelfLifeDays: profile.shelfLifeDays ?? 0,
      composition: {
        ingredients: product.ingredients ?? null,
        allergens: product.allergens ?? [],
        conservation: product.conservation ?? null,
      },
      origin: {
        producer: profile.originProducer ?? null,
        place: profile.originPlace ?? null,
        year: profile.originYear ?? null,
        method: profile.originMethod ?? null,
        photos: profile.originPhotos ?? [],
      },
      badge: profile.hasBadge,
      supplierId: product.supplier.id,
      shopName: product.supplier.shopName,
      inStock: product.stock > 0,
      variants: variants.map(variant => ({
        id: variant.id,
        label: variant.label,
        price: Number(variant.pricePerUnit),
        displayPrice: display(Number(variant.pricePerUnit), rate),
        weightG: lineWeight(profile, variant, 1),
        inStock: variant.packSize && variant.packSize > 1 ? product.stock >= variant.packSize : variant.stock > 0,
      })),
    }
  },

  toClientPack(view: ClientPackView, currency: string, rate: number | null): TerroirPackDetail {
    const { pack } = view
    return {
      id: pack.id,
      name: pack.name,
      description: pack.description ?? null,
      photos: pack.photos ?? [],
      price: Number(pack.price),
      displayPrice: display(Number(pack.price), rate),
      currency: rate === null ? 'XOF' : currency,
      weightG: view.weightG,
      shopName: pack.supplier?.shopName ?? null,
      orderable: view.orderable,
      items: pack.items.getItems().map((item) => {
        const profile = view.details.get(item.product.id)
        return {
          productId: item.product.id,
          variantId: item.variant?.id ?? null,
          name: item.variant ? `${item.product.name}, ${item.variant.label}` : item.product.name,
          quantity: item.quantity,
          imageUrl: item.product.photos?.[0] ?? null,
          shopName: item.product.supplier.shopName,
          badge: profile?.hasBadge ?? false,
          origin: { producer: profile?.originProducer ?? null, place: profile?.originPlace ?? null },
        }
      }),
    }
  },

  toDepartureOffer(offer: OfferedDeparture, departure: ExportDeparture, points: ExportPickupPoint[], rate: number | null, currency: string): TerroirDepartureOffer {
    const homeFee = offer.rate.homeDeliveryFee ?? null
    return {
      departureId: departure.id,
      agency: departure.agency.name,
      departsOn: departure.departsOn,
      arrival: arrivalOf(departure),
      pricePerKg: offer.rate.pricePerKg,
      minBilledKg: offer.rate.minBilledKg,
      maxWeightKg: offer.rate.maxWeightKg ?? null,
      homeDeliveryFee: homeFee,
      shippingPrice: offer.shippingPrice,
      display: rate === null
        ? null
        : { currency, shippingPrice: toDisplayAmount(offer.shippingPrice, rate), homeDeliveryFee: homeFee === null ? null : toDisplayAmount(homeFee, rate) },
      orderBefore: offer.orderBefore.toISOString(),
      collectBefore: departure.depositDeadline.toISOString(),
      dutiesIncluded: true,
      pickupPoints: points
        .filter(point => point.agency.id === departure.agency.id && point.country === offer.rate.country)
        .map(point => ({ id: point.id, city: point.city, address: point.address, openingHours: point.openingHours ?? null })),
    }
  },

  toDepartures(offers: OfferedDeparture[], departures: Map<string, ExportDeparture>, points: ExportPickupPoint[], rate: number | null, currency: string, alertSubscribed: boolean): TerroirDeparturesResponse {
    const items = offers.map(offer => TerroirMapper.toDepartureOffer(offer, departures.get(offer.departure.id)!, points, rate, currency))
    const first = items[0]
    return {
      next: first
        ? { departureId: first.departureId, agency: first.agency, city: first.pickupPoints[0]?.city ?? null, departsOn: first.departsOn, orderBefore: first.orderBefore }
        : null,
      items,
      alertSubscribed,
    }
  },

  toExportability(item: ProductExportability): TerroirExportability {
    return { status: item.status, label: item.label, reason: item.reason, packedWeightG: item.packedWeightG }
  },

  toExportabilityResponse(country: string, items: ProductExportability[]): TerroirExportabilityResponse {
    return {
      country,
      items: items.map(item => ({ productId: item.productId, ...TerroirMapper.toExportability(item) })),
    }
  },

  toPreview(quote: TerroirQuote): TerroirCheckoutPreview {
    const { rate } = quote
    return {
      country: quote.country,
      lines: quote.lines,
      estimatedWeightG: quote.estimatedWeightG,
      billedKg: quote.billedKg,
      marginKg: quote.marginKg,
      suggestions: quote.suggestions.map(profile => ({
        productId: profile.product.id,
        name: profile.product.name,
        weightG: profile.packedWeightG ?? 0,
        price: Number(profile.product.pricePerUnit),
        imageUrl: profile.product.photos?.[0] ?? null,
        shopName: profile.product.supplier.shopName,
      })),
      departureId: quote.selected?.departure.id ?? null,
      itemsTotal: quote.itemsTotal,
      shippingPrice: quote.shippingPrice,
      homeDeliveryFee: quote.homeDeliveryFee,
      insurancePrice: quote.insurancePrice,
      total: quote.total,
      options: { homeDeliveryFee: quote.homeDeliveryQuote, insurancePrice: quote.insuranceQuote },
      display: rate === null
        ? null
        : {
            currency: quote.currency,
            total: toDisplayAmount(quote.total, rate),
            itemsTotal: toDisplayAmount(quote.itemsTotal, rate),
            shippingPrice: toDisplayAmount(quote.shippingPrice, rate),
            homeDeliveryFee: toDisplayAmount(quote.homeDeliveryFee, rate),
            insurancePrice: toDisplayAmount(quote.insurancePrice, rate),
          },
      departures: quote.offers.map(offer => TerroirMapper.toDepartureOffer(offer, quote.departures.get(offer.departure.id)!, quote.pickupPoints, rate, quote.currency)),
      unavailable: quote.unavailable,
    }
  },

  toCheckoutResult(created: TerroirCheckoutCreated): TerroirCheckoutResult {
    const { checkout, shipment } = created
    return {
      checkoutId: checkout.id,
      shipmentId: shipment.id,
      total: Number(checkout.totalAmount),
      status: shipment.status,
      paymentUrl: created.paymentUrl,
      display: created.displayTotal === null ? null : { currency: checkout.displayCurrency, total: created.displayTotal },
    }
  },

  toShipmentSummary(view: ShipmentView): TerroirShipmentSummary {
    const { shipment } = view
    const lines = shipmentLines(view.orders, view.shipment.removedItemIds)
    return {
      id: shipment.id,
      status: shipment.status,
      country: shipment.country,
      departure: { agency: shipment.departure.agency.name, departsOn: shipment.departure.departsOn, arrival: arrivalOf(shipment.departure) },
      reception: shipment.reception,
      itemCount: lines.reduce((total, line) => total + line.quantity, 0),
      imageUrl: lines[0]?.imageUrl ?? null,
      total: Number(shipment.checkout.totalAmount),
      gift: shipment.giftRecipientName ? { name: shipment.giftRecipientName } : null,
      createdAt: shipment.createdAt.toISOString(),
    }
  },

  toShipmentDetail(view: ShipmentView): TerroirShipmentDetail {
    const { shipment } = view
    const checkout = shipment.checkout
    const displayTotal = checkout.displayTotal == null ? null : Number(checkout.displayTotal)
    return {
      id: shipment.id,
      status: shipment.status,
      country: shipment.country,
      departure: {
        agency: shipment.departure.agency.name,
        departsOn: shipment.departure.departsOn,
        arrival: arrivalOf(shipment.departure),
        collectBefore: shipment.departure.depositDeadline.toISOString(),
      },
      reception: shipment.reception,
      pickupPoint: pickupPointOf(view),
      homeAddress: shipment.homeAddress ?? null,
      lines: shipmentLines(view.orders, shipment.removedItemIds),
      reorderLines: (view.reorderLines ?? []).map(line => ({ ...line })),
      events: eventsOf(view),
      supplement: shipment.supplementAmount == null
        ? null
        : { ...supplementOf(shipment), amount: Number(shipment.supplementAmount) },
      estimatedWeightG: shipment.estimatedWeightG,
      actualWeightG: shipment.actualWeightG ?? null,
      itemsTotal: Number(checkout.itemsTotal),
      shippingPrice: Number(shipment.shippingPrice),
      homeDeliveryFee: Number(shipment.homeDeliveryFee),
      insurancePrice: Number(shipment.insurancePrice),
      total: Number(checkout.totalAmount),
      display: displayTotal === null ? null : { currency: checkout.displayCurrency, total: displayTotal },
      insured: shipment.insured,
      gift: shipment.giftRecipientName
        ? { name: shipment.giftRecipientName, email: shipment.giftRecipientEmail ?? null, phone: shipment.giftRecipientPhone ?? null, message: shipment.giftMessage ?? null }
        : null,
      trackingToken: shipment.trackingToken,
      checkoutId: checkout.id,
      createdAt: shipment.createdAt.toISOString(),
    }
  },

  /** Public, for a gift's recipient: built field by field so no price can slip in. */
  toTracking(view: ShipmentView): TerroirTracking {
    const { shipment } = view
    return {
      status: shipment.status,
      country: shipment.country,
      recipientName: shipment.giftRecipientName ?? null,
      senderName: shortName(shipment.buyer.name),
      giftMessage: shipment.giftMessage ?? null,
      departure: { agency: shipment.departure.agency.name, departsOn: shipment.departure.departsOn, arrival: arrivalOf(shipment.departure) },
      reception: shipment.reception,
      pickupPoint: pickupPointOf(view),
      lines: shipmentLines(view.orders, shipment.removedItemIds).map(line => ({ name: line.name, quantity: line.quantity, imageUrl: line.imageUrl })),
      events: eventsOf(view),
      updatedAt: shipment.updatedAt.toISOString(),
    }
  },

  toSupplementResult(outcome: SupplementOutcome): TerroirSupplementResult {
    const { shipment } = outcome
    return {
      supplementStatus: shipment.supplementStatus,
      amount: shipment.supplementAmount == null ? null : Number(shipment.supplementAmount),
      topupId: outcome.topupId,
      paymentUrl: outcome.paymentUrl,
      providerTransactionId: outcome.providerTransactionId,
    }
  },

  toAdminShipment(view: AdminShipmentView): ExportAdminShipment {
    const { shipment } = view
    const removed = new Set(shipment.removedItemIds)
    const point = shipment.pickupPoint
    return {
      id: shipment.id,
      status: shipment.status,
      country: shipment.country,
      buyer: { id: shipment.buyer.id, name: shipment.buyer.name, email: shipment.buyer.email ?? null, phone: shipment.buyer.phone ?? null },
      gift: shipment.giftRecipientName
        ? { name: shipment.giftRecipientName, email: shipment.giftRecipientEmail ?? null, phone: shipment.giftRecipientPhone ?? null, message: shipment.giftMessage ?? null }
        : null,
      departure: {
        id: shipment.departure.id,
        agency: shipment.departure.agency.name,
        departsOn: shipment.departure.departsOn,
        status: shipment.departure.status,
        depositDeadline: shipment.departure.depositDeadline.toISOString(),
      },
      reception: shipment.reception,
      pickupPoint: point ? { id: point.id, city: point.city, address: point.address, openingHours: point.openingHours ?? null } : null,
      homeAddress: shipment.homeAddress ?? null,
      estimatedWeightG: shipment.estimatedWeightG,
      actualWeightG: shipment.actualWeightG ?? null,
      shippingPrice: Number(shipment.shippingPrice),
      homeDeliveryFee: Number(shipment.homeDeliveryFee),
      insured: shipment.insured,
      insurancePrice: Number(shipment.insurancePrice),
      declaredValue: Number(shipment.declaredValue),
      supplement: supplementOf(shipment),
      orders: view.orders.map(order => ({
        id: order.id,
        orderNumber: order.orderNumber,
        supplierId: order.supplier.id,
        shopName: order.supplier.shopName,
        status: order.status,
        collected: order.status === 'DELIVERED',
        totalAmount: Number(order.totalAmount),
        lines: order.items.getItems().map(item => ({
          id: item.id,
          name: item.variant ? `${item.product.name}, ${(item.variant as ProductVariant).label}` : item.product.name,
          quantity: item.quantity,
          totalPrice: Number(item.totalPrice),
          imageUrl: item.product.photos?.[0] ?? null,
          removed: removed.has(item.id),
        })),
      })),
      events: view.events.map(event => ({
        id: event.id,
        step: event.step ?? null,
        message: event.message ?? null,
        pickupPoint: event.pickupPointSnapshot ?? null,
        author: event.author?.name ?? null,
        at: event.createdAt.toISOString(),
      })),
      trackingToken: shipment.trackingToken,
      createdAt: shipment.createdAt.toISOString(),
    }
  },
}
