import type { Rel } from '@mikro-orm/core'
import { Entity, Enum, ManyToOne, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'
import { User } from '../auth/auth.entity'

export enum MediaType {
  IMAGE = 'IMAGE',
  AUDIO = 'AUDIO',
  VIDEO = 'VIDEO',
  DOCUMENT = 'DOCUMENT',
}

export enum MediaStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  READY = 'READY',
  ERROR = 'ERROR',
}

export enum MediaContext {
  PRODUCT_PHOTO = 'PRODUCT_PHOTO',
  SUPPLIER_COVER = 'SUPPLIER_COVER',
  SUPPLIER_PROFILE = 'SUPPLIER_PROFILE',
  IDENTITY_DOCUMENT = 'IDENTITY_DOCUMENT',
  BUSINESS_PROOF = 'BUSINESS_PROOF',
  CHAT_ATTACHMENT = 'CHAT_ATTACHMENT',
  VOICE_NOTE = 'VOICE_NOTE',
  VOICE_DESCRIPTION = 'VOICE_DESCRIPTION',
  TRAINING_CONTENT = 'TRAINING_CONTENT',
  TRAINING_THUMBNAIL = 'TRAINING_THUMBNAIL',
  COMMUNITY_MEDIA = 'COMMUNITY_MEDIA',
  CATEGORY_IMAGE = 'CATEGORY_IMAGE',
}

@Entity({ tableName: 'media' })
export class Media {
  [OptionalProps]?: 'id' | 'status' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => User, { fieldName: 'uploaded_by', nullable: true })
  uploadedBy?: Rel<User>

  @Enum({ items: () => MediaType })
  type!: MediaType

  @Enum({ items: () => MediaContext })
  context!: MediaContext

  @Enum({ items: () => MediaStatus, default: MediaStatus.PENDING })
  status: MediaStatus = MediaStatus.PENDING

  // Original file info
  @Property({ fieldName: 'original_name' })
  originalName!: string

  @Property({ fieldName: 'mime_type' })
  mimeType!: string

  @Property({ fieldName: 'original_size' })
  originalSize!: number

  // S3 storage
  @Property({ fieldName: 's3_key' })
  s3Key!: string

  @Property({ fieldName: 's3_bucket' })
  s3Bucket!: string

  // Optimized version (for images)
  @Property({ fieldName: 'optimized_key', nullable: true })
  optimizedKey?: string

  @Property({ fieldName: 'optimized_size', nullable: true })
  optimizedSize?: number

  // Thumbnail (for images/videos)
  @Property({ fieldName: 'thumbnail_key', nullable: true })
  thumbnailKey?: string

  // Dimensions (for images/videos)
  @Property({ nullable: true })
  width?: number

  @Property({ nullable: true })
  height?: number

  // Duration (for audio/video, in seconds)
  @Property({ type: 'float', nullable: true })
  duration?: number

  // Linked entity (polymorphic: productId, supplierId, conversationId, etc.)
  @Property({ fieldName: 'entity_type', nullable: true })
  entityType?: string

  @Property({ fieldName: 'entity_id', nullable: true })
  entityId?: string

  // Public URL (after processing)
  @Property({ fieldName: 'public_url', nullable: true })
  publicUrl?: string

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
