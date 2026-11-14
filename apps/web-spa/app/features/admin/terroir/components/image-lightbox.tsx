import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@boilerstone/ui/components/primitives/dialog'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

interface ZoomableImageProps {
  url: string
  /** What the picture shows, for the dialog title and the alt text. */
  label: string
  size?: number
}

/** A thumbnail that opens full size: the label photo must be read, not guessed. */
export function ZoomableImage({ url, label, size = 72 }: ZoomableImageProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className="focus-visible:ring-ebio-green-400 shrink-0 overflow-hidden rounded focus-visible:ring-2 focus-visible:outline-none"
        style={{ width: size, height: size }}
        aria-label={t('admin.terroir.enlarge', { label })}
        onClick={() => setOpen(true)}
      >
        <img src={url} alt={label} className="bg-muted h-full w-full object-cover" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription className="sr-only">{t('admin.terroir.enlargedDescription')}</DialogDescription>
          </DialogHeader>
          <img src={url} alt={label} className="max-h-[75vh] w-full rounded object-contain" />
        </DialogContent>
      </Dialog>
    </>
  )
}
