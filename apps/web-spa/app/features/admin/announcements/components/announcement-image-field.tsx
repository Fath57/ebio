import { Button } from '@boilerstone/ui/components/primitives/button'
import { toast } from '@boilerstone/ui/components/primitives/sonner'
import { ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { useRef } from 'react'
import { useMediaUpload } from '@/features/media/hooks/use-media-upload'

interface AnnouncementImageFieldProps {
  value: string
  onChange: (url: string) => void
}

/**
 * The poster, uploaded as it is.
 *
 * No cropper here, deliberately: the modal measures the real ratio and fits
 * itself to the artwork. Imposing a frame would cut a paid visual — and often
 * the very words it was drawn around.
 */
export function AnnouncementImageField({ value, onChange }: AnnouncementImageFieldProps) {
  const { uploading, uploadFile } = useMediaUpload({ context: 'ANNOUNCEMENT_IMAGE' })
  const inputRef = useRef<HTMLInputElement>(null)

  async function handlePick(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    // Reset first, so picking the same file twice still fires a change.
    event.target.value = ''
    if (!file) {
      return
    }
    const result = await uploadFile(file)
    if (result?.publicUrl) {
      onChange(result.publicUrl)
      return
    }
    toast.error('Le visuel n\'a pas pu être envoyé.')
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
              <div className="bg-muted relative overflow-hidden rounded-lg border">
                {/* Height capped rather than a ratio set: whatever its shape, the whole poster shows. */}
                <img src={value} alt="" className="max-h-80 w-full object-contain" />
                {uploading && (
                  <div className="bg-background/70 absolute inset-0 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                  <ImagePlus className="mr-2 h-4 w-4" />
                  Remplacer
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => onChange('')}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Retirer
                </Button>
              </div>
            </div>
          )
        : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="border-muted-foreground/30 hover:border-primary hover:bg-accent/40 flex h-40 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed transition-colors"
            >
              {uploading
                ? <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
                : <ImagePlus className="text-muted-foreground h-6 w-6" />}
              <span className="text-muted-foreground text-sm">
                Choisir un visuel
              </span>
              <span className="text-muted-foreground text-xs">
                Affiché tel quel, dans sa forme d'origine
              </span>
            </button>
          )}
    </div>
  )
}
