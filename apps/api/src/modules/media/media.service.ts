import type { CompleteUpload, InitiateUpload } from './media.contract'
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

// Image optimization targets (used when sharp is enabled)
// eslint-disable-next-line unused-imports/no-unused-vars
const IMAGE_MAX_WIDTH = 1200
// eslint-disable-next-line unused-imports/no-unused-vars
const IMAGE_MAX_SIZE = 200 * 1024 // 200 Ko target for product images

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
    const s3Key = `${input.context.toLowerCase()}/${randomUUID()}.${ext}`

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
      // Simple presigned PUT
      const command = new PutObjectCommand({
        Bucket: s3Config.bucket,
        Key: s3Key,
        ContentType: input.mimeType,
        ContentLength: input.fileSize,
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
      await this.processMedia(media)
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
  private async processMedia(media: Media): Promise<void> {
    try {
      if (media.type === MediaType.IMAGE) {
        await this.optimizeImage(media)
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
  private async optimizeImage(media: Media): Promise<void> {
    // TODO: Implement with sharp library
    // For now, use the original as-is and mark as ready
    //
    // const sharp = require('sharp')
    // const { Body } = await this.s3.send(new GetObjectCommand({ Bucket: media.s3Bucket, Key: media.s3Key }))
    // const buffer = await streamToBuffer(Body)
    //
    // const metadata = await sharp(buffer).metadata()
    // media.width = metadata.width
    // media.height = metadata.height
    //
    // // Resize + WebP
    // const optimized = await sharp(buffer)
    //   .resize(IMAGE_MAX_WIDTH, undefined, { withoutEnlargement: true })
    //   .webp({ quality: 80 })
    //   .toBuffer()
    //
    // const optimizedKey = media.s3Key.replace(/\.[^.]+$/, '.webp')
    // await this.s3.send(new PutObjectCommand({
    //   Bucket: media.s3Bucket, Key: optimizedKey,
    //   Body: optimized, ContentType: 'image/webp',
    // }))
    //
    // media.optimizedKey = optimizedKey
    // media.optimizedSize = optimized.length
    //
    // // Thumbnail
    // const thumb = await sharp(buffer).resize(200, 200, { fit: 'cover' }).webp({ quality: 70 }).toBuffer()
    // const thumbKey = media.s3Key.replace(/\.[^.]+$/, '-thumb.webp')
    // await this.s3.send(new PutObjectCommand({
    //   Bucket: media.s3Bucket, Key: thumbKey, Body: thumb, ContentType: 'image/webp',
    // }))
    // media.thumbnailKey = thumbKey

    media.optimizedKey = media.s3Key
    media.optimizedSize = media.originalSize
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
