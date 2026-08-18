import { ImageOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface BannerPreviewProps {
  imageUrl: string
  title: string
  subtitle?: string
}

/**
 * Shows the banner as the mobile carousel draws it: 2:1 card, rounded corners,
 * and a gradient scrim under the caption. Without it the editor is writing text
 * blind onto an image, and only finds out on a phone that it sits unreadable
 * over a bright area.
 */
export function BannerPreview({ imageUrl, title, subtitle }: BannerPreviewProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {t('admin.banners.form.preview')}
      </p>
      <div className="bg-muted relative aspect-2/1 w-full max-w-sm overflow-hidden rounded-xl shadow-sm">
        {imageUrl
          ? <img src={imageUrl} alt="" className="h-full w-full object-cover" />
          : (
              <div className="text-muted-foreground flex h-full w-full items-center justify-center">
                <ImageOff className="h-8 w-8" />
              </div>
            )}

        {/* Same three stops as the mobile scrim, so the contrast an editor sees
            here is the contrast a buyer gets. */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.45) 55%, rgba(0,0,0,0.88) 100%)',
          }}
        />

        <div className="absolute inset-x-4 bottom-4">
          <p className="truncate text-lg font-bold text-white">
            {title || t('admin.banners.form.titlePlaceholder')}
          </p>
          {subtitle
            ? <p className="truncate text-xs text-white/80">{subtitle}</p>
            : null}
        </div>
      </div>
    </div>
  )
}
