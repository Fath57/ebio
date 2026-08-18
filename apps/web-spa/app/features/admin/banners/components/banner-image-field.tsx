import { Button } from '@boilerstone/ui/components/primitives/button'
import { toast } from '@boilerstone/ui/components/primitives/sonner'
import { Crop, ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImageCropper } from '@/features/media/components/image-cropper'
import { useMediaUpload } from '@/features/media/hooks/use-media-upload'

/** Banners are drawn 2:1 by the mobile carousel — the frame matches exactly. */
const BANNER_ASPECT = 2

interface BannerImageFieldProps {
  value: string
  onChange: (url: string) => void
}

export function BannerImageField({ value, onChange }: BannerImageFieldProps) {
  const { t } = useTranslation()
  const { uploading, uploadFile } = useMediaUpload({ context: 'BANNER_IMAGE' })
  const inputRef = useRef<HTMLInputElement>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)

  function handlePick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) {
      setPendingFile(file)
    }
    // Reset so picking the same file twice still fires a change.
    event.target.value = ''
  }

  async function handleCropped(file: File) {
    setPendingFile(null)
    const result = await uploadFile(file)
    if (result?.publicUrl) {
      onChange(result.publicUrl)
    }
    else {
      // Without this the dialog just closed and nothing appeared, which reads
      // as the crop having failed rather than the upload.
      toast.error(t('admin.banners.form.uploadError'))
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePick}
      />

      {value
        ? (
            <div className="space-y-2">
              <div className="bg-muted relative aspect-2/1 w-full overflow-hidden rounded-lg border">
                <img src={value} alt="" className="h-full w-full object-cover" />
                {uploading && (
                  <div className="bg-background/70 absolute inset-0 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                  <Crop className="mr-2 h-4 w-4" />
                  {t('admin.banners.form.replaceImage')}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => onChange('')}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('common.delete')}
                </Button>
              </div>
            </div>
          )
        : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="border-muted-foreground/30 hover:border-primary hover:bg-accent/40 flex aspect-2/1 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed transition-colors"
            >
              {uploading
                ? <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
                : <ImagePlus className="text-muted-foreground h-6 w-6" />}
              <span className="text-muted-foreground text-sm">
                {t('admin.banners.form.pickImage')}
              </span>
            </button>
          )}

      <ImageCropper
        file={pendingFile}
        aspect={BANNER_ASPECT}
        onCancel={() => setPendingFile(null)}
        onCropped={handleCropped}
      />
    </div>
  )
}
