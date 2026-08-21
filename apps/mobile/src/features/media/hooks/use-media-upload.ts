import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import * as ImagePicker from 'expo-image-picker'
import { useCallback, useState } from 'react'
import { apiFetch } from '../../../utils/api-client'
import { appAlert } from '../../common/components/app-alert'

export type MediaContext
  = | 'PRODUCT_PHOTO'
    | 'SUPPLIER_COVER'
    | 'SUPPLIER_PROFILE'
    | 'IDENTITY_DOCUMENT'
    | 'BUSINESS_PROOF'
    | 'CHAT_ATTACHMENT'
    | 'VOICE_NOTE'
    | 'VOICE_DESCRIPTION'
    | 'TRAINING_CONTENT'
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
  maxFiles?: number
  mediaTypes?: ImagePicker.MediaTypeOptions
}

export function useMediaUpload(options: UseMediaUploadOptions) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadedMedia, setUploadedMedia] = useState<UploadedMedia[]>([])

  /**
   * Pick image(s) from library and upload via Media module.
   */
  const pickAndUpload = useCallback(async (): Promise<UploadedMedia | null> => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      appAlert('Permission requise', 'Autorisez l\'accès à la galerie pour ajouter des photos.')
      return null
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: options.mediaTypes ?? ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    })

    if (result.canceled || !result.assets?.[0])
      return null

    const asset = result.assets[0]
    return uploadFile(asset.uri, asset.fileName ?? 'photo.jpg', asset.mimeType ?? 'image/jpeg', asset.fileSize ?? 0)
  }, [options])

  /**
   * Pick a real file — PDF or image — through the system file picker, for
   * supporting documents that are rarely photos (scanned ID cards, RCCM…).
   */
  const pickDocumentAndUpload = useCallback(async (): Promise<UploadedMedia | null> => {
    let result: DocumentPicker.DocumentPickerResult
    try {
      result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
        multiple: false,
      })
    }
    catch {
      // Native module absent from this build (older dev APK): the photo
      // picker keeps working, only the file option needs a rebuilt app.
      appAlert('Indisponible', 'La sélection de fichiers nécessite une mise à jour de l\'application. Vous pouvez ajouter une photo en attendant.')
      return null
    }

    if (result.canceled || !result.assets?.[0])
      return null

    const asset = result.assets[0]
    return uploadFile(
      asset.uri,
      asset.name ?? 'document.pdf',
      asset.mimeType ?? 'application/pdf',
      asset.size ?? 0,
    )
  }, [options])

  /**
   * Take a photo with camera and upload.
   */
  const takePhotoAndUpload = useCallback(async (): Promise<UploadedMedia | null> => {
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) {
      appAlert('Permission requise', 'Autorisez l\'accès à la caméra.')
      return null
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.8,
    })

    if (result.canceled || !result.assets?.[0])
      return null

    const asset = result.assets[0]
    return uploadFile(asset.uri, asset.fileName ?? 'photo.jpg', asset.mimeType ?? 'image/jpeg', asset.fileSize ?? 0)
  }, [options])

  /**
   * Upload any file URI via the Media module.
   * Flow: initiate → presigned URL → upload to S3 → complete
   */
  const uploadFile = useCallback(async (
    fileUri: string,
    fileName: string,
    mimeType: string,
    fileSize: number,
  ): Promise<UploadedMedia | null> => {
    setUploading(true)
    setProgress(0)

    try {
      // Get file size if not provided
      let size = fileSize
      if (!size) {
        const info = await FileSystem.getInfoAsync(fileUri)
        size = (info as { size?: number }).size ?? 0
      }

      // Step 1: Initiate upload → get presigned URL(s)
      const initiateRes = await apiFetch('/api/media/upload', {
        method: 'POST',
        body: JSON.stringify({
          fileName,
          mimeType,
          fileSize: size,
          context: options.context,
          entityType: options.entityType,
          entityId: options.entityId,
        }),
      })

      if (!initiateRes.ok) {
        const err = await initiateRes.json()
        throw new Error(err.message ?? 'Erreur lors de l\'initiation de l\'upload')
      }

      const { mediaId, uploadId, parts } = await initiateRes.json()
      setProgress(0.1)

      // Step 2: Upload file to S3 via presigned URL
      const fileResponse = await fetch(fileUri)
      const blob = await fileResponse.blob()

      if (parts.length === 1) {
        const s3Res = await fetch(parts[0].uploadUrl, {
          method: 'PUT',
          body: blob,
          headers: { 'Content-Type': mimeType },
        })
        if (!s3Res.ok) {
          throw new Error('Erreur lors de l\'upload vers le stockage')
        }
        setProgress(0.8)
      }
      else {
        // Chunked upload
        const chunkSize = Math.ceil(blob.size / parts.length)
        for (let i = 0; i < parts.length; i++) {
          const chunk = blob.slice(i * chunkSize, (i + 1) * chunkSize)
          await fetch(parts[i].uploadUrl, {
            method: 'PUT',
            body: chunk,
            headers: { 'Content-Type': 'application/octet-stream' },
          })
          setProgress(0.1 + (0.7 * (i + 1)) / parts.length)
        }
      }

      // Step 3: Complete upload → trigger optimization
      const completeRes = await apiFetch('/api/media/complete', {
        method: 'POST',
        body: JSON.stringify({
          mediaId,
          uploadId,
        }),
      })

      if (!completeRes.ok) {
        throw new Error('Erreur lors de la finalisation')
      }

      const media = await completeRes.json()
      setProgress(1)

      const uploaded: UploadedMedia = {
        mediaId: media.id,
        publicUrl: media.publicUrl,
        status: media.status,
      }

      setUploadedMedia(prev => [...prev, uploaded])
      return uploaded
    }
    catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur d\'upload'
      appAlert('Erreur', message)
      return null
    }
    finally {
      setUploading(false)
    }
  }, [options])

  /**
   * Remove uploaded media.
   */
  const removeMedia = useCallback(async (mediaId: string) => {
    await apiFetch(`/api/media/${mediaId}`, { method: 'DELETE' })
    setUploadedMedia(prev => prev.filter(m => m.mediaId !== mediaId))
  }, [])

  return {
    uploading,
    progress,
    uploadedMedia,
    pickAndUpload,
    pickDocumentAndUpload,
    takePhotoAndUpload,
    uploadFile,
    removeMedia,
    setUploadedMedia,
  }
}
