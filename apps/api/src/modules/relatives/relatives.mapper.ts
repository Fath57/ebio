import type { RelativeResponse } from './contracts/relative.contract'
import type { SavedRelative } from './entities/saved-relative.entity'

export class RelativesMapper {
  static toResponse(relative: SavedRelative): RelativeResponse {
    return {
      id: relative.id,
      nickname: relative.nickname,
      name: relative.name,
      phone: relative.phone,
      address: relative.address,
      latitude: relative.latitude,
      longitude: relative.longitude,
      createdAt: relative.createdAt.toISOString(),
    }
  }
}
