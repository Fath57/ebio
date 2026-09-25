import type { MediaContext } from '../hooks/use-media-upload'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { ImagePlus, Loader2, Wand2, X } from 'lucide-react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useMediaUpload } from '../hooks/use-media-upload'

interface ImageUploadProps {
  /** Media context for the upload (e.g. PRODUCT_PHOTO, CATEGORY_IMAGE) */
  context: MediaContext
  /** Max number of images (default 1) */
  max?: number
  /** Size of each preview thumbnail */
  size?: 'sm' | 'md' | 'lg'
  /** Already uploaded URLs (for edit mode) */
  existingUrls?: string[]
  /** Called when the list of uploaded mediaIds changes */
  onMediaIdsChange?: (mediaIds: string[]) => void
  /** Called when a single image URL is ready (for single-image mode) */
  onUrlChange?: (url: string | undefined) => void
  /** Initial single URL (for edit mode, single image) */
  initialUrl?: string
  /**
   * Offers a retouch on a photo that was just uploaded.
   *
   * The parent opens whatever editor it wants and calls `replace` with the
   * result; the swap of both the preview and the media id happens here, where
   * the list actually lives. Without this prop no retouch button is shown, so
   * the uploads that have no editor behind them are unaffected.
   */
  onRetouchRequest?: (
    photo: { mediaId: string, url: string },
    replace: (next: { mediaId: string, url: string }) => void,
  ) => void
}

const sizeClasses = {
  sm: 'h-20 w-20',
  md: 'h-24 w-24',
  lg: 'h-32 w-32',
}

export function ImageUpload({
  context,
  max = 1,
  size = 'md',
  existingUrls,
  onMediaIdsChange,
  onUrlChange,
  initialUrl,
  onRetouchRequest,
}: ImageUploadProps) {
  const { t } = useTranslation()
  const { uploading, uploadedMedia, uploadFile, removeMedia, setUploadedMedia } = useMediaUpload({ context })
  const [singleUrl, setSingleUrl] = React.useState<string | undefined>(initialUrl)

  // A retouch finishes long after the click that started it: the callback must
  // read the list as it is then, not as it was when the dialog opened.
  const mediaRef = React.useRef(uploadedMedia)
  React.useEffect(() => {
    mediaRef.current = uploadedMedia
  }, [uploadedMedia])

  const isSingleMode = max === 1 && !!onUrlChange
  const totalImages = (existingUrls?.length ?? 0) + uploadedMedia.length + (isSingleMode && singleUrl ? 1 : 0)
  const canAddMore = totalImages < max
  const cls = sizeClasses[size]

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files)
      return

    for (const file of Array.from(files)) {
      if (totalImages + 1 > max)
        break
      const result = await uploadFile(file)
      if (result) {
        if (isSingleMode) {
          setSingleUrl(result.publicUrl ?? undefined)
          onUrlChange?.(result.publicUrl ?? undefined)
        }
        else {
          onMediaIdsChange?.(uploadedMedia.map(m => m.mediaId).concat(result.mediaId))
        }
      }
    }
    e.target.value = ''
  }

  function handleRemove(mediaId: string) {
    removeMedia(mediaId)
    const remaining = uploadedMedia.filter(m => m.mediaId !== mediaId)
    onMediaIdsChange?.(remaining.map(m => m.mediaId))
  }

  function handleRemoveSingle() {
    setSingleUrl(undefined)
    onUrlChange?.(undefined)
  }

  function handleRetouch(photo: { mediaId: string, publicUrl: string | null }) {
    if (!photo.publicUrl) {
      return
    }
    onRetouchRequest?.({ mediaId: photo.mediaId, url: photo.publicUrl }, (next) => {
      const updated = mediaRef.current.map(item => (
        item.mediaId === photo.mediaId
          ? { mediaId: next.mediaId, publicUrl: next.url, status: 'READY' }
          : item
      ))
      setUploadedMedia(updated)
      onMediaIdsChange?.(updated.map(item => item.mediaId))
    })
  }

  return (
    <div className="flex flex-wrap gap-3">
      {/* Existing photos (edit mode, multi) */}
      {existingUrls?.map((url, i) => (
        <div key={`existing-${i}`} className={`relative overflow-hidden rounded-xl border ${cls}`}>
          <img src={url} alt="" className="h-full w-full object-cover" />
        </div>
      ))}

      {/* Single mode preview */}
      {isSingleMode && singleUrl && (
        <div className={`relative overflow-hidden rounded-xl border ${cls}`}>
          <img src={singleUrl} alt="" className="h-full w-full object-cover" />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1 h-6 w-6 rounded-full bg-black/50 text-white hover:bg-black/70"
            onClick={handleRemoveSingle}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Multi mode uploaded previews */}
      {!isSingleMode && uploadedMedia.map(m => (
        <div key={m.mediaId} className={`relative overflow-hidden rounded-xl border ${cls}`}>
          {m.publicUrl
            ? <img src={m.publicUrl} alt="" className="h-full w-full object-cover" />
            : <div className="flex h-full items-center justify-center bg-muted text-xs"><Loader2 className="h-4 w-4 animate-spin" /></div>}
          {onRetouchRequest && m.publicUrl && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t('catalog.photoStudio.open')}
              title={t('catalog.photoStudio.open')}
              className="absolute left-1 top-1 h-6 w-6 rounded-full bg-black/50 text-white hover:bg-black/70"
              onClick={() => handleRetouch(m)}
            >
              <Wand2 className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1 h-6 w-6 rounded-full bg-black/50 text-white hover:bg-black/70"
            onClick={() => handleRemove(m.mediaId)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}

      {/* Add button */}
      {canAddMore && !(isSingleMode && singleUrl) && (
        <label className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-muted-foreground/25 transition-colors hover:border-primary/50 hover:bg-muted/50 ${cls}`}>
          {uploading
            ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            : <ImagePlus className="h-6 w-6 text-muted-foreground" />}
          <span className="text-xs text-muted-foreground">
            {uploading ? '...' : t('catalog.form.addPhoto')}
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple={max > 1}
            className="hidden"
            onChange={handleFileChange}
            disabled={uploading}
          />
        </label>
      )}
    </div>
  )
}
