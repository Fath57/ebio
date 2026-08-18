import type { Area } from 'react-easy-crop'
import { Button } from '@boilerstone/ui/components/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@boilerstone/ui/components/primitives/dialog'
import { Loader2, ZoomIn, ZoomOut } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import Cropper from 'react-easy-crop'
import { useTranslation } from 'react-i18next'

/** Longest side of the exported image — beyond this, banners only cost bandwidth. */
const MAX_OUTPUT_WIDTH = 1600
const JPEG_QUALITY = 0.9

interface ImageCropperProps {
  /** Source file picked by the user. Null closes the dialog. */
  file: File | null
  /** Width over height of the frame, matching where the image will be shown. */
  aspect: number
  onCancel: () => void
  onCropped: (file: File) => void
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', reject)
    image.src = src
  })
}

/**
 * Draws the selected area onto a canvas and returns it as a file.
 *
 * `react-easy-crop` reports the crop in the source image's own pixels, so the
 * export keeps full resolution regardless of how large the preview was drawn.
 */
async function cropToFile(src: string, area: Area, name: string): Promise<File> {
  const image = await loadImage(src)
  const canvas = document.createElement('canvas')

  const scale = Math.min(1, MAX_OUTPUT_WIDTH / area.width)
  canvas.width = Math.round(area.width * scale)
  canvas.height = Math.round(area.height * scale)

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas unavailable')
  }

  context.drawImage(
    image,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    canvas.width,
    canvas.height,
  )

  const blob = await new Promise<Blob | null>(resolve =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
  if (!blob) {
    throw new Error('Export failed')
  }

  return new File([blob], `${name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' })
}

export function ImageCropper({ file, aspect, onCancel, onCropped }: ImageCropperProps) {
  const { t } = useTranslation()
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [area, setArea] = useState<Area | null>(null)
  const [working, setWorking] = useState(false)

  const [src, setSrc] = useState('')

  // Derived from the prop rather than initialised once: the dialog stays mounted
  // with `file` null between uses, and a lazy initialiser would have captured
  // that null forever — leaving the frame blank on every open.
  //
  // Object URL rather than a data URL: no base64 copy of a multi-megabyte photo
  // in memory, and it is released as soon as the file changes or the dialog goes.
  useEffect(() => {
    if (!file) {
      setSrc('')
      return
    }

    const url = URL.createObjectURL(file)
    setSrc(url)
    // Each picture starts framed from scratch.
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setArea(null)

    return () => URL.revokeObjectURL(url)
  }, [file])

  const handleComplete = useCallback((_: Area, pixels: Area) => {
    setArea(pixels)
  }, [])

  async function handleConfirm() {
    if (!file || !area) {
      return
    }
    setWorking(true)
    try {
      onCropped(await cropToFile(src, area, file.name))
    }
    finally {
      setWorking(false)
    }
  }

  function handleCancel() {
    onCancel()
  }

  return (
    <Dialog open={!!file} onOpenChange={open => !open && handleCancel()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('media.cropper.title')}</DialogTitle>
          <DialogDescription>{t('media.cropper.description')}</DialogDescription>
        </DialogHeader>

        <div className="bg-muted relative h-80 w-full overflow-hidden rounded-md">
          {src && (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={handleComplete}
              showGrid
            />
          )}
        </div>

        <div className="flex items-center gap-3">
          <ZoomOut className="text-muted-foreground h-4 w-4 shrink-0" />
          <input
            type="range"
            className="accent-primary w-full"
            min={1}
            max={4}
            step={0.01}
            value={zoom}
            aria-label={t('media.cropper.zoom')}
            onChange={event => setZoom(Number(event.target.value))}
          />
          <ZoomIn className="text-muted-foreground h-4 w-4 shrink-0" />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleCancel}>
            {t('common.cancel')}
          </Button>
          <Button type="button" disabled={!area || working} onClick={handleConfirm}>
            {working && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('media.cropper.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
