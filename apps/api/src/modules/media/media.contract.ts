import { z } from 'zod'

// Enums exposed for frontend
export const mediaTypeEnum = z.enum(['IMAGE', 'AUDIO', 'VIDEO', 'DOCUMENT']).meta({
  title: 'MediaType',
  description: 'Type de fichier média',
})

export const mediaContextEnum = z.enum([
  'PRODUCT_PHOTO',
  'SUPPLIER_COVER',
  'SUPPLIER_PROFILE',
  'IDENTITY_DOCUMENT',
  'BUSINESS_PROOF',
  'CHAT_ATTACHMENT',
  'VOICE_NOTE',
  'VOICE_DESCRIPTION',
  'TRAINING_CONTENT',
  'TRAINING_THUMBNAIL',
  'COMMUNITY_MEDIA',
  'CATEGORY_IMAGE',
]).meta({
  title: 'MediaContext',
  description: 'Contexte d\'utilisation du média',
})

// Initiate upload — client asks for presigned URL(s)
export const initiateUploadSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().regex(/^(image|audio|video|application)\//),
  fileSize: z.number().int().positive(),
  context: mediaContextEnum,
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  // Chunked upload: number of parts for multipart
  parts: z.number().int().min(1).max(100).default(1),
}).meta({
  title: 'InitiateUpload',
  description: 'Demande d\'URL signée(s) pour upload direct vers S3',
  examples: [{
    fileName: 'huile-palme.jpg',
    mimeType: 'image/jpeg',
    fileSize: 524288,
    context: 'PRODUCT_PHOTO',
    parts: 1,
  }],
})

export const initiateUploadResponseSchema = z.object({
  mediaId: z.string().uuid(),
  uploadId: z.string().optional(),
  parts: z.array(z.object({
    partNumber: z.number(),
    uploadUrl: z.string().url(),
  })),
}).meta({
  title: 'InitiateUploadResponse',
  description: 'URL(s) signée(s) pour upload. Pour les gros fichiers, plusieurs parts sont retournées.',
})

// Complete multipart upload
export const completeUploadSchema = z.object({
  mediaId: z.string().uuid(),
  uploadId: z.string().optional(),
  parts: z.array(z.object({
    partNumber: z.number(),
    etag: z.string(),
  })).optional(),
}).meta({
  title: 'CompleteUpload',
  description: 'Finalise un upload multipart et déclenche l\'optimisation',
})

// Media response
export const mediaResponseSchema = z.object({
  id: z.string().uuid(),
  type: mediaTypeEnum,
  context: mediaContextEnum,
  status: z.enum(['PENDING', 'PROCESSING', 'READY', 'ERROR']),
  originalName: z.string(),
  mimeType: z.string(),
  originalSize: z.number(),
  optimizedSize: z.number().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  duration: z.number().nullable(),
  publicUrl: z.string().url().nullable(),
  thumbnailUrl: z.string().url().nullable(),
  createdAt: z.string().datetime(),
}).meta({
  title: 'MediaResponse',
  description: 'Fichier média avec ses métadonnées',
})

export type InitiateUpload = z.infer<typeof initiateUploadSchema>
export type CompleteUpload = z.infer<typeof completeUploadSchema>
export type MediaResponse = z.infer<typeof mediaResponseSchema>
