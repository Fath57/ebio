import type { MediaResponse } from './media.contract'
import type { Media } from './media.entity'
import { s3Config } from '../../config/s3.config'

export class MediaMapper {
  static toResponse(media: Media): MediaResponse {
    return {
      id: media.id,
      type: media.type,
      context: media.context,
      status: media.status,
      originalName: media.originalName,
      mimeType: media.mimeType,
      originalSize: media.originalSize,
      optimizedSize: media.optimizedSize ?? null,
      width: media.width ?? null,
      height: media.height ?? null,
      duration: media.duration ?? null,
      publicUrl: media.publicUrl ?? null,
      thumbnailUrl: media.thumbnailKey
        ? `${s3Config.publicUrl}/${media.thumbnailKey}`
        : null,
      createdAt: media.createdAt.toISOString(),
    }
  }
}
