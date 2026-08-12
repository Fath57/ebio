import type { SupplierResponse, SupplierSummary } from './contracts/supplier.contract'
import type { Supplier } from './supplier.entity'

export class SupplierMapper {
  static toResponse(supplier: Supplier): SupplierResponse {
    return {
      id: supplier.id,
      userId: supplier.user?.id ?? '',
      shopName: supplier.shopName,
      type: supplier.type,
      coverPhoto: supplier.coverPhoto ?? null,
      profilePhoto: supplier.profilePhoto ?? null,
      latitude: null,
      longitude: null,
      address: supplier.address ?? null,
      neighborhood: supplier.neighborhood ?? null,
      mobileMoneyNumber: supplier.mobileMoneyNumber ?? null,
      validationStatus: supplier.validationStatus,
      mode: supplier.mode,
      openingHours: (supplier.openingHours as SupplierResponse['openingHours']) ?? null,
      timezone: supplier.timezone,
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
