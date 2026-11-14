import type { ExportProfileResponse } from './contracts/terroir.contract'
import type { ExportProfile } from './entities/export-profile.entity'
import type { ExportThresholds } from './export-criteria'
import { ExportProfileStatus } from './contracts/terroir.contract'
import { profileCriteria } from './export-criteria'

/**
 * A product's export profile as its shop (or eBio) reads it: the status, every
 * criterion met or not, eBio's withdrawal reason. Kept apart from
 * TerroirMapper so the products module can use it without pulling the
 * terroir services in.
 */
export function toExportProfileResponse(profile: ExportProfile, thresholds: ExportThresholds): ExportProfileResponse {
  const missing = profile.missingCriteria ?? []
  const withdrawn = profile.status === ExportProfileStatus.WITHDRAWN
  return {
    productId: profile.product.id,
    status: profile.status,
    criteria: profileCriteria(missing, thresholds),
    missingCount: missing.length,
    withdrawnReason: withdrawn ? profile.withdrawnReason ?? null : null,
    packedWeightG: profile.packedWeightG ?? null,
    lengthCm: profile.lengthCm ?? null,
    widthCm: profile.widthCm ?? null,
    heightCm: profile.heightCm ?? null,
    shelfLifeDays: profile.shelfLifeDays ?? null,
    storage: profile.storage ?? null,
    allergens: profile.allergens ?? null,
    noAllergens: profile.noAllergens,
    origin: {
      producer: profile.originProducer ?? null,
      place: profile.originPlace ?? null,
      year: profile.originYear ?? null,
      method: profile.originMethod ?? null,
      photos: profile.originPhotos ?? [],
    },
    labelPhoto: profile.labelPhoto ?? null,
    declaresFrenchLabel: profile.declaresFrenchLabel,
    declaresDatesPrinted: profile.declaresDatesPrinted,
    declaresSealedPackaging: profile.declaresSealedPackaging,
    withdrawnAt: withdrawn ? profile.withdrawnAt?.toISOString() ?? null : null,
    badge: profile.hasBadge,
    updatedAt: profile.updatedAt.toISOString(),
  }
}
