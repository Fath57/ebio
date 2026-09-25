import { Button } from '@boilerstone/ui/components/primitives/button'
import { ChevronLeft, ChevronRight, Wand2, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImageUpload } from '@/features/media/components/image-upload'
import { PhotoStudioDialog } from './photo-studio-dialog'

interface ProductPhotoManagerProps {
  /** Existing photo URLs kept on the product (edit mode) */
  keptUrls: string[]
  onKeptUrlsChange: (urls: string[]) => void
  /** Called when newly uploaded mediaIds change */
  onMediaIdsChange: (mediaIds: string[]) => void
  /** Max total photos (kept + new) */
  max?: number
  /** Passed to the retouching review so it can spot an off-subject photo. */
  productName?: string
}

/**
 * What the studio is currently working on.
 *
 * A photo already on the product and one that was just uploaded are kept the
 * same way on screen but not underneath — one is a URL in the product, the
 * other a media id not attached to anything yet. Rather than branch inside the
 * dialog, each opener says here how to put the result back.
 */
interface StudioTarget {
  url: string
  apply: (next: { mediaId: string, url: string }) => void
}

/**
 * Photo management for the product form: kept existing photos with
 * remove/reorder controls, plus upload slots for new photos. Both kinds can be
 * retouched, including the one that has just finished uploading — improving a
 * photo should not mean saving first and coming back for it.
 */
export function ProductPhotoManager({ keptUrls, onKeptUrlsChange, onMediaIdsChange, max = 3, productName }: ProductPhotoManagerProps) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState<StudioTarget | null>(null)

  function editKept(url: string) {
    setEditing({
      url,
      apply: next => onKeptUrlsChange(keptUrls.map(kept => (kept === url ? next.url : kept))),
    })
  }

  function removeAt(index: number) {
    onKeptUrlsChange(keptUrls.filter((_, i) => i !== index))
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= keptUrls.length)
      return
    const next = [...keptUrls]
    const tmp = next[index]
    next[index] = next[target]
    next[target] = tmp
    onKeptUrlsChange(next)
  }

  return (
    <div className="space-y-3">
      {keptUrls.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {keptUrls.map((url, i) => (
            <div key={url} className="relative h-24 w-24 overflow-hidden rounded-xl border">
              <img src={url} alt="" className="h-full w-full object-cover" />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('catalog.form.photoRemove')}
                className="absolute right-1 top-1 h-6 w-6 rounded-full bg-black/50 text-white hover:bg-black/70"
                onClick={() => removeAt(i)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('catalog.photoStudio.open')}
                title={t('catalog.photoStudio.open')}
                className="absolute left-1 top-1 h-6 w-6 rounded-full bg-black/50 text-white hover:bg-black/70"
                onClick={() => editKept(url)}
              >
                <Wand2 className="h-3.5 w-3.5" />
              </Button>
              <div className="absolute bottom-1 left-1 right-1 flex justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t('catalog.form.photoMoveLeft')}
                  className="h-6 w-6 rounded-full bg-black/50 text-white hover:bg-black/70 disabled:opacity-30"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t('catalog.form.photoMoveRight')}
                  className="h-6 w-6 rounded-full bg-black/50 text-white hover:bg-black/70 disabled:opacity-30"
                  disabled={i === keptUrls.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ImageUpload
        context="PRODUCT_PHOTO"
        max={Math.max(0, max - keptUrls.length)}
        onMediaIdsChange={onMediaIdsChange}
        onRetouchRequest={(photo, replace) => setEditing({ url: photo.url, apply: replace })}
      />

      <PhotoStudioDialog
        url={editing?.url ?? null}
        productName={productName}
        onClose={() => setEditing(null)}
        onReplace={next => editing?.apply(next)}
      />
    </div>
  )
}
