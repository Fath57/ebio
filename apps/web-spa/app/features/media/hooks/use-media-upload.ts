import { client } from '@boilerstone/openapi-generator'
import { useCallback, useState } from 'react'

// Doublon manuel de l'énumération de l'API — à garder synchronisé avec
// `MediaContext` dans apps/api/src/modules/media/media.entity.ts.
export type MediaContext
  = | 'PRODUCT_PHOTO'
    | 'CATEGORY_IMAGE'
    | 'BANNER_IMAGE'
    | 'SUPPLIER_COVER'
    | 'SUPPLIER_PROFILE'
    | 'IDENTITY_DOCUMENT'
    | 'BUSINESS_PROOF'
    | 'CHAT_ATTACHMENT'
    | 'COMMUNITY_MEDIA'

interface UploadedMedia {
  mediaId: string
  publicUrl: string | null
  status: string
}

interface UseMediaUploadOptions {
  context: MediaContext
  entityType?: string
  entityId?: string
}

export function useMediaUpload(options: UseMediaUploadOptions) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadedMedia, setUploadedMedia] = useState<UploadedMedia[]>([])

  /**
   * Upload a File object via the Media module.
   * Flow: initiate → presigned URL → PUT to S3 → complete
   */
  const uploadFile = useCallback(async (file: File): Promise<UploadedMedia | null> => {
    setUploading(true)
    setProgress(0)

    try {
      // Step 1: Initiate
      const initiateRes = await client.post({
        url: '/api/media/upload',
        body: {
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size,
          context: options.context,
          entityType: options.entityType,
          entityId: options.entityId,
        },
      })

      if (!initiateRes.data)
        throw new Error('Erreur lors de l\'initiation')

      const { mediaId, parts } = initiateRes.data as {
        mediaId: string
        uploadId?: string
        parts: Array<{ partNumber: number, uploadUrl: string }>
      }

      setProgress(0.1)

      // Step 2: Upload to S3
      if (parts.length === 1) {
        await fetch(parts[0].uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        })
        setProgress(0.8)
      }
      else {
        // Chunked upload
        const chunkSize = Math.ceil(file.size / parts.length)
        for (let i = 0; i < parts.length; i++) {
          const chunk = file.slice(i * chunkSize, (i + 1) * chunkSize)
          await fetch(parts[i].uploadUrl, {
            method: 'PUT',
            body: chunk,
          })
          setProgress(0.1 + (0.7 * (i + 1)) / parts.length)
        }
      }

      // Step 3: Complete
      const completeRes = await client.post({
        url: '/api/media/complete',
        body: { mediaId },
      })

      if (!completeRes.data)
        throw new Error('Erreur lors de la finalisation')

      const media = completeRes.data as { id: string, publicUrl: string | null, status: string }
      setProgress(1)

      const uploaded: UploadedMedia = {
        mediaId: media.id,
        publicUrl: media.publicUrl,
        status: media.status,
      }

      setUploadedMedia(prev => [...prev, uploaded])
      return uploaded
    }
    catch {
      return null
    }
    finally {
      setUploading(false)
    }
  }, [options])

  const removeMedia = useCallback(async (mediaId: string) => {
    await client.delete({ url: `/api/media/${mediaId}` })
    setUploadedMedia(prev => prev.filter(m => m.mediaId !== mediaId))
  }, [])

  return {
    uploading,
    progress,
    uploadedMedia,
    uploadFile,
    removeMedia,
    setUploadedMedia,
  }
}
