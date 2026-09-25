import { ProductThumb } from '../../common/components/product-thumb'

/**
 * The message as a phone will show it.
 *
 * Written next to the fields rather than after sending: a notification is
 * read in two seconds, in a tray, next to twenty others — and a title that
 * looked fine in a form is often three words too long there.
 */
export function CampaignPreview({ title, body, imageUrl }: {
  title: string
  body: string
  imageUrl: string | null
}) {
  return (
    <div className="bg-muted/40 rounded-2xl border p-4">
      <p className="text-muted-foreground mb-2 text-xs">Aperçu sur le téléphone</p>
      <div className="bg-background space-y-2 rounded-xl border p-3 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="bg-primary/10 text-primary flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold">
            e
          </span>
          <span className="text-muted-foreground text-xs">eBio · maintenant</span>
        </div>
        <p className="text-sm leading-tight font-semibold">
          {title || <span className="text-muted-foreground">Titre de la notification</span>}
        </p>
        <p className="text-muted-foreground text-sm leading-snug">
          {body || 'Le message que verra la personne.'}
        </p>
        {imageUrl && (
          <img src={imageUrl} alt="" className="bg-muted max-h-44 w-full rounded-lg object-cover" />
        )}
      </div>
      {!imageUrl && (
        <p className="text-muted-foreground mt-2 flex items-center gap-2 text-xs">
          <ProductThumb url={null} size={20} />
          Sans image, la notification reste sur une ligne.
        </p>
      )}
    </div>
  )
}
