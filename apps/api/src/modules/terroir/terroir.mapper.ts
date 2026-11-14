import type { ExportAgencyResponse, ExportDepartureDetail, ExportDepartureResponse, ExportPackResponse, ExportPickupPointResponse, ExportProfileResponse, ExportReviewsResponse } from './contracts/terroir.contract'
import type { ExportAgency } from './entities/export-agency.entity'
import type { ExportPickupPoint } from './entities/export-pickup-point.entity'
import type { ExportProfile } from './entities/export-profile.entity'
import type { PackView, ReviewQueue } from './export-catalog.service'
import type { DepartureDetailView, DepartureView } from './export-logistics.service'
import { packLinePrice } from './export-catalog.service'
import { fillRatio, orderDeadline } from './terroir-math'
import { addDays, shortName } from './terroir-texts'

function nullableNumber(value: string | null | undefined): number | null {
  return value == null ? null : Number(value)
}

/** Entities → contracts, field by field: getters and populated relations are not serialised. */
export const TerroirMapper = {
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
      collection: view.collection,
    }
  },

  toProfile(profile: ExportProfile): ExportProfileResponse {
    return {
      productId: profile.product.id,
      status: profile.status,
      packedWeightG: profile.packedWeightG,
      lengthCm: profile.lengthCm ?? null,
      widthCm: profile.widthCm ?? null,
      heightCm: profile.heightCm ?? null,
      shelfLifeDays: profile.shelfLifeDays,
      origin: {
        producer: profile.originProducer ?? null,
        place: profile.originPlace ?? null,
        year: profile.originYear ?? null,
        method: profile.originMethod ?? null,
        photos: profile.originPhotos ?? [],
      },
      labelPhoto: profile.labelPhoto ?? null,
      checklist: Object.fromEntries(Object.entries(profile.checklist ?? {}).map(([key, ticked]) => [key, ticked === true])),
      rejectionReason: profile.rejectionReason ?? null,
      reviewedAt: profile.reviewedAt?.toISOString() ?? null,
      badge: profile.hasBadge,
      updatedAt: profile.updatedAt.toISOString(),
    }
  },

  toPack(view: PackView): ExportPackResponse {
    const { pack } = view
    const price = Number(pack.price)
    return {
      id: pack.id,
      supplierId: pack.supplier?.id ?? null,
      shopName: pack.supplier?.shopName ?? null,
      name: pack.name,
      description: pack.description ?? null,
      photos: pack.photos ?? [],
      price,
      status: pack.status,
      rejectionReason: pack.rejectionReason ?? null,
      reviewedAt: pack.reviewedAt?.toISOString() ?? null,
      items: pack.items.getItems().map(item => ({
        productId: item.product.id,
        variantId: item.variant?.id ?? null,
        quantity: item.quantity,
        name: item.variant ? `${item.product.name} — ${item.variant.label}` : item.product.name,
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

  toReviews(queue: ReviewQueue): ExportReviewsResponse {
    return {
      products: queue.profiles.map(profile => ({
        ...TerroirMapper.toProfile(profile),
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
      })),
      packs: queue.packs.map(TerroirMapper.toPack),
    }
  },
}
