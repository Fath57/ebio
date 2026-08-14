import type { OpeningHours } from '../../common/opening-hours'
import type { SupplierResponse, SupplierSummary } from './contracts/supplier.contract'
import type { Supplier } from './supplier.entity'
import { isOpenNow } from '../../common/opening-hours'

export interface SupplierCoordinates {
  latitude: number
  longitude: number
}

export class SupplierMapper {
  /**
   * Coordinates are read separately, through `SuppliersService.findCoordinates`:
   * the entity only holds the raw PostGIS geography, which cannot be decoded
   * here. Omitting them yields `null`, read by clients as "no known position".
   */
  static toResponse(supplier: Supplier, coordinates: SupplierCoordinates | null = null): SupplierResponse {
    return {
      id: supplier.id,
      userId: supplier.user?.id ?? '',
      shopName: supplier.shopName,
      type: supplier.type,
      coverPhoto: supplier.coverPhoto ?? null,
      profilePhoto: supplier.profilePhoto ?? null,
      latitude: coordinates?.latitude ?? null,
      longitude: coordinates?.longitude ?? null,
      address: supplier.address ?? null,
      neighborhood: supplier.neighborhood ?? null,
      mobileMoneyNumber: supplier.mobileMoneyNumber ?? null,
      validationStatus: supplier.validationStatus,
      mode: supplier.mode,
      openingHours: (supplier.openingHours as SupplierResponse['openingHours']) ?? null,
      timezone: supplier.timezone,
      deliveryFee: supplier.deliveryFee ?? 0,
      freeDeliveryFrom: supplier.freeDeliveryFrom ?? null,
      isOpen: isOpenNow(supplier.openingHours as OpeningHours, undefined, supplier.timezone),
      globalRating: supplier.globalRating ?? null,
      totalReviews: supplier.totalReviews,
      createdAt: supplier.createdAt.toISOString(),
      updatedAt: supplier.updatedAt.toISOString(),
    }
  }

  static toSummary(supplier: Supplier): SupplierSummary {
    return {
      id: supplier.id,
      shopName: supplier.shopName,
      type: supplier.type,
      profilePhoto: supplier.profilePhoto ?? null,
      neighborhood: supplier.neighborhood ?? null,
      mode: supplier.mode,
      globalRating: supplier.globalRating ?? null,
      totalReviews: supplier.totalReviews,
      validationStatus: supplier.validationStatus,
    }
  }
}
