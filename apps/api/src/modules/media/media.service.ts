import type { CompleteUpload, ImageCrop, InitiateUpload } from './media.contract'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import {
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  UploadPartCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import sharp from 'sharp'
import { createS3Client, s3Config } from '../../config/s3.config'
import { User } from '../auth/auth.entity'
import { Media, MediaContext, MediaStatus, MediaType } from './media.entity'
import { MediaMapper } from './media.mapper'

// Max file sizes per type
const MAX_SIZES: Record<string, number> = {
  IMAGE: 10 * 1024 * 1024, // 10 Mo
  AUDIO: 20 * 1024 * 1024, // 20 Mo
  VIDEO: 100 * 1024 * 1024, // 100 Mo
  DOCUMENT: 20 * 1024 * 1024, // 20 Mo
}

// Chunk size for multipart: 5 Mo (S3 minimum)
const CHUNK_SIZE = 5 * 1024 * 1024

// Image optimization targets
const IMAGE_MAX_WIDTH = 1200
const IMAGE_WEBP_QUALITY = 80
const THUMB_SIZE = 320
const THUMB_WEBP_QUALITY = 70

/**
 * Where an object is filed in the bucket.
 *
 * The prefix is not decoration: the bucket grants public read on a named list
 * of them, so an image filed outside that list is stored and then unreadable —
 * which looks like a broken upload and is not one.
 *
 * The context is the prefix by default. An override belongs here when a new
 * context must be visible without waiting for the bucket policy to grow.
 */
const SHARED_PREFIX: Partial<Record<MediaContext, string>> = {
  // A poster is as public as a banner and lives with them, so it is readable
  // the day the feature ships. Give it `announcement_image/` once that prefix
  // is added to the bucket's PublicReadImages statement.
  [MediaContext.ANNOUNCEMENT_IMAGE]: 'banner_image',
}

function storagePrefix(context: MediaContext): string {
  return SHARED_PREFIX[context] ?? context.toLowerCase()
}

@Injectable()
export class MediaService {
  private readonly s3 = createS3Client()
  private readonly logger = new Logger(MediaService.name)

  constructor(private readonly em: EntityManager) {}

  /**
   * Step 1: Client requests upload URL(s).
   * For small files (< 5Mo): single presigned PUT URL.
   * For large files: multipart upload with presigned URLs per part.
   */
  async initiateUpload(userId: string, input: InitiateUpload) {
    const mediaType = this.detectMediaType(input.mimeType)
    const maxSize = MAX_SIZES[mediaType] ?? MAX_SIZES.DOCUMENT

    if (input.fileSize > maxSize) {
      throw new NotFoundException(
        `Fichier trop volumineux. Maximum : ${Math.round(maxSize / 1024 / 1024)} Mo pour ce type.`,
      )
    }

    const ext = input.fileName.split('.').pop()?.toLowerCase() ?? 'bin'
    const s3Key = `${storagePrefix(input.context as MediaContext)}/${randomUUID()}.${ext}`

    // Create media record in DB
    const media = this.em.create(Media, {
      uploadedBy: this.em.getReference(User, userId),
      type: mediaType as MediaType,
      context: input.context as MediaContext,
      status: MediaStatus.PENDING,
      originalName: input.fileName,
      mimeType: input.mimeType,
      originalSize: input.fileSize,
      s3Key,
      s3Bucket: s3Config.bucket,
      entityType: input.entityType,
      entityId: input.entityId,
    })
    await this.em.flush()

    // Determine upload strategy
    const needsMultipart = input.fileSize > CHUNK_SIZE
    const numParts = needsMultipart
      ? Math.ceil(input.fileSize / CHUNK_SIZE)
      : 1

    if (!needsMultipart) {
      // Simple presigned PUT. Content-Type and Content-Length are deliberately
      // left out of the signature: React Native overrides the Content-Type
      // header with the blob's own MIME type (a `.m4a` voice note is sent as
      // `audio/mp4`, not the declared `audio/m4a`), which made every signed
      // header mismatch and S3 answer 403. The declared type is kept on the
      // Media row; the object keeps whatever the client sends.
      const command = new PutObjectCommand({
        Bucket: s3Config.bucket,
        Key: s3Key,
      })
      const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: 3600 })

      return {
        mediaId: media.id,
        parts: [{ partNumber: 1, uploadUrl }],
      }
    }

    // Multipart upload
    const { UploadId } = await this.s3.send(new CreateMultipartUploadCommand({
      Bucket: s3Config.bucket,
      Key: s3Key,
      ContentType: input.mimeType,
    }))

    const parts = await Promise.all(
      Array.from({ length: numParts }, async (_, i) => {
        const partNumber = i + 1
        const command = new UploadPartCommand({
          Bucket: s3Config.bucket,
          Key: s3Key,
          UploadId,
          PartNumber: partNumber,
        })
        const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: 3600 })
        return { partNumber, uploadUrl }
      }),
    )

    return {
      mediaId: media.id,
      uploadId: UploadId,
      parts,
    }
  }

  /**
   * Step 2: Client notifies upload complete.
   * For multipart: completes the multipart upload.
   * Then triggers async optimization for images.
   */
  async completeUpload(userId: string, input: CompleteUpload) {
    const media = await this.em.findOne(Media, { id: input.mediaId })
    if (!media)
      throw new NotFoundException('Média introuvable')

    // Complete multipart if needed
    if (input.uploadId && input.parts?.length) {
      await this.s3.send(new CompleteMultipartUploadCommand({
        Bucket: s3Config.bucket,
        Key: media.s3Key,
        UploadId: input.uploadId,
        MultipartUpload: {
          Parts: input.parts.map(p => ({
            PartNumber: p.partNumber,
            ETag: p.etag,
          })),
        },
      }))
    }

    // Process media (optimize images, generate publicUrl)
    media.status = MediaStatus.PROCESSING
    await this.em.flush()

    try {
      await this.processMedia(media, input.crop)
    }
    catch (err) {
      this.logger.error(`Media processing failed for ${media.id}`, err)
    }

    return MediaMapper.toResponse(media)
  }

  /**
   * Process media after upload:
   * - Images: optimize (resize, compress to WebP, generate thumbnail)
   * - Audio/Video: extract duration
   * - All: generate public URL
   */
  private async processMedia(media: Media, crop?: ImageCrop): Promise<void> {
    try {
      if (media.type === MediaType.IMAGE) {
        await this.optimizeImage(media, crop)
      }

      // Generate public URL
      media.publicUrl = `${s3Config.publicUrl}/${media.optimizedKey ?? media.s3Key}`
      media.status = MediaStatus.READY
      await this.em.flush()

      this.logger.log(`Media ${media.id} processed: ${media.originalSize} → ${media.optimizedSize ?? media.originalSize} bytes`)
    }
    catch (error) {
      media.status = MediaStatus.ERROR
      await this.em.flush()
      throw error
    }
  }

  /**
   * Image optimization:
   * - Download original from S3
   * - Resize if > MAX_WIDTH
   * - Convert to WebP
   * - Compress to target size (200 Ko for product images)
   * - Upload optimized version
   * - Generate thumbnail (200x200)
   */
  async optimizeImage(media: Media, crop?: ImageCrop): Promise<void> {
    const { Body } = await this.s3.send(new GetObjectCommand({
      Bucket: media.s3Bucket,
      Key: media.s3Key,
    }))
    if (!Body) {
      throw new NotFoundException(`Objet S3 introuvable pour le média ${media.id}`)
    }
    const buffer = Buffer.from(await Body.transformToByteArray())

    try {
      // .rotate() bakes in the EXIF orientation so resized output displays upright
      let source = sharp(buffer, { failOn: 'none' }).rotate()
      const metadata = await source.metadata()
      // metadata() describes the file before .rotate(): for the quarter-turn
      // orientations (5 to 8) the stored dimensions are swapped compared to
      // what the phone displayed, and the crop was drawn on what it displayed.
      const isQuarterTurn = (metadata.orientation ?? 1) >= 5
      const displayWidth = (isQuarterTurn ? metadata.height : metadata.width) ?? 0
      const displayHeight = (isQuarterTurn ? metadata.width : metadata.height) ?? 0
      media.width = displayWidth
      media.height = displayHeight

      if (crop && displayWidth > 0 && displayHeight > 0) {
        const left = clampOffset(Math.round(crop.x * displayWidth), displayWidth - 1)
        const top = clampOffset(Math.round(crop.y * displayHeight), displayHeight - 1)
        const width = clampSize(Math.round(crop.width * displayWidth), displayWidth - left)
        const height = clampSize(Math.round(crop.height * displayHeight), displayHeight - top)
        source = source.extract({ left, top, width, height })
        media.width = width
        media.height = height
      }

      const optimized = await source
        .clone()
        .resize(IMAGE_MAX_WIDTH, undefined, { withoutEnlargement: true })
        .webp({ quality: IMAGE_WEBP_QUALITY })
        .toBuffer()

      // A tiny already-compressed original can beat the webp re-encode: keep the
      // smaller of the two so optimization never inflates a file. A cropped
      // image has no such choice: the original still shows what was cut away.
      if (crop || optimized.length < media.originalSize) {
        const optimizedKey = media.s3Key.replace(/\.[^.]+$/, '.opt.webp')
        await this.s3.send(new PutObjectCommand({
          Bucket: media.s3Bucket,
          Key: optimizedKey,
          Body: optimized,
          ContentType: 'image/webp',
          CacheControl: 'public, max-age=31536000, immutable',
        }))
        media.optimizedKey = optimizedKey
        media.optimizedSize = optimized.length
      }
      else {
        media.optimizedKey = media.s3Key
        media.optimizedSize = media.originalSize
      }

      const thumb = await source
        .clone()
        .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover' })
        .webp({ quality: THUMB_WEBP_QUALITY })
        .toBuffer()
      const thumbKey = media.s3Key.replace(/\.[^.]+$/, '.thumb.webp')
      await this.s3.send(new PutObjectCommand({
        Bucket: media.s3Bucket,
        Key: thumbKey,
        Body: thumb,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
      }))
      media.thumbnailKey = thumbKey
    }
    catch (error) {
      // Unsupported format (rare: exotic encodings): serve the original untouched
      this.logger.warn(`Image optimization skipped for ${media.id}: ${(error as Error).message}`)
      media.optimizedKey = media.s3Key
      media.optimizedSize = media.originalSize
    }
  }

  /**
   * Get a signed download URL for private media (documents).
   */
  async getSignedUrl(mediaId: string, expiresIn = 3600): Promise<string> {
    const media = await this.em.findOne(Media, { id: mediaId })
    if (!media)
      throw new NotFoundException('Média introuvable')

    const command = new GetObjectCommand({
      Bucket: media.s3Bucket,
      Key: media.s3Key,
    })
    return getSignedUrl(this.s3, command, { expiresIn })
  }

  /**
   * Delete a media and its S3 objects.
   */
  async deleteMedia(mediaId: string): Promise<void> {
    const media = await this.em.findOne(Media, { id: mediaId })
    if (!media)
      throw new NotFoundException('Média introuvable')

    // Delete S3 objects
    const keysToDelete = [media.s3Key, media.optimizedKey, media.thumbnailKey].filter(Boolean) as string[]
    await Promise.all(
      keysToDelete.map(key =>
        this.s3.send(new DeleteObjectCommand({ Bucket: media.s3Bucket, Key: key })),
      ),
    )

    this.em.remove(media)
    await this.em.flush()
  }

  /**
   * Find media by entity (e.g., all photos for a product).
   */
  async findByEntity(entityType: string, entityId: string): Promise<Media[]> {
    return this.em.find(Media, {
      entityType,
      entityId,
      status: MediaStatus.READY,
    }, { orderBy: { createdAt: 'ASC' } })
  }

  /**
   * The media behind a public URL, or nothing.
   *
   * Server-side image work starts from a URL the client already holds, and a
   * URL is the one thing a client can forge. Resolving it against our own
   * rows means the server only ever fetches objects it put there itself —
   * anything else simply does not resolve, and no request leaves the bucket.
   */
  async findByPublicUrl(url: string): Promise<Media | null> {
    return this.em.findOne(Media, { publicUrl: url })
  }

  /**
   * Read an object's bytes back out of the bucket.
   */
  async readObject(media: Media, key?: string): Promise<Buffer> {
    const { Body } = await this.s3.send(new GetObjectCommand({
      Bucket: media.s3Bucket,
      Key: key ?? media.optimizedKey ?? media.s3Key,
    }))
    if (!Body) {
      throw new NotFoundException(`Objet S3 introuvable pour le média ${media.id}`)
    }
    return Buffer.from(await Body.transformToByteArray())
  }

  /**
   * Store an image the server produced itself.
   *
   * Goes through the same optimisation and thumbnailing as an upload, so a
   * retouched photo is served exactly like any other — and lands as its own
   * row, because the original has to remain reachable when the shop changes
   * its mind.
   */
  async createFromBuffer(
    userId: string,
    input: {
      buffer: Buffer
      context: MediaContext
      originalName: string
      entityType?: string
      entityId?: string
    },
  ): Promise<Media> {
    const s3Key = `${storagePrefix(input.context)}/${randomUUID()}.webp`

    await this.s3.send(new PutObjectCommand({
      Bucket: s3Config.bucket,
      Key: s3Key,
      Body: input.buffer,
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000, immutable',
    }))

    const media = this.em.create(Media, {
      uploadedBy: this.em.getReference(User, userId),
      type: MediaType.IMAGE,
      context: input.context,
      status: MediaStatus.PROCESSING,
      originalName: input.originalName,
      mimeType: 'image/webp',
      originalSize: input.buffer.length,
      s3Key,
      s3Bucket: s3Config.bucket,
      entityType: input.entityType,
      entityId: input.entityId,
    })
    await this.em.flush()

    await this.processMedia(media)
    return media
  }

  /**
   * Find a single media by ID.
   */
  async findById(mediaId: string): Promise<Media> {
    const media = await this.em.findOne(Media, { id: mediaId })
    if (!media)
      throw new NotFoundException('Média introuvable')
    return media
  }

  private detectMediaType(mimeType: string): string {
    if (mimeType.startsWith('image/'))
      return 'IMAGE'
    if (mimeType.startsWith('audio/'))
      return 'AUDIO'
    if (mimeType.startsWith('video/'))
      return 'VIDEO'
    return 'DOCUMENT'
  }
}

/** A crop origin sits inside the image, and starts at 0 when it hugs the edge. */
function clampOffset(value: number, max: number): number {
  return Math.max(0, Math.min(value, max))
}

/** A crop side stays inside the image and never collapses to nothing. */
function clampSize(value: number, max: number): number {
  return Math.max(1, Math.min(value, max))
}
