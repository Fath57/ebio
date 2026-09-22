import type { Route } from './+types/produit'
import process from 'node:process'
import { SITE_URL } from '@/components/constants'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { StoreBadges } from '@/components/store-badges'
import { fetchLandingContent } from '@/content/landing-content.server'

interface PublicProduct {
  id: string
  supplierId: string
  name: string
  description: string | null
  categoryName: string
  photos: string[]
  pricePerUnit: number
  promotionalPrice: number | null
  unit: string
  stock: number
  status: string
  labels: string[]
  origin: string | null
}

interface PublicSupplier {
  id: string
  shopName: string
  profilePhoto: string | null
  neighborhood: string | null
  validationStatus: string
}

interface ProductUnit {
  code: string
  shortLabel: string
}

/**
 * French display names for the API's canonical label codes. The API keeps the
 * codes so the filters stay exact; every client carries its own dictionary,
 * and this is the landing's.
 */
const LABEL_NAMES: Record<string, string> = {
  'organic': 'Bio',
  'ecocert': 'Ecocert',
  'local': 'Agriculture locale',
  'fair-trade': 'Commerce équitable',
  'gmo-free': 'Sans OGM',
  'handmade': 'Fait main',
  'artisanal': 'Artisanal',
  'vegan': 'Végan',
  'vegetarian': 'Végétarien',
  'gluten-free': 'Sans gluten',
  'lactose-free': 'Sans lactose',
  'sugar-free': 'Sans sucre ajouté',
}

/** Same grouping as the app: a thousands space, never a comma. */
function formatPrice(value: number): string {
  return value.toLocaleString('fr-FR').replace(/,/g, ' ')
}

/**
 * Public product page, the landing target of every shared product link. Rich
 * OG tags give the share a real preview card in WhatsApp; the page itself
 * shows the product and hands visitors the app, which is where one orders.
 *
 * The API already hides a withdrawn product and a suspended shop's catalogue
 * behind a 404, so an unreachable product simply lands on the empty state.
 */
export async function loader({ params }: Route.LoaderArgs) {
  const base = process.env.API_URL ?? 'http://localhost:3000'
  const [content, productRes, unitsRes] = await Promise.all([
    fetchLandingContent(),
    fetch(`${base}/api/products/${params.id}`, { signal: AbortSignal.timeout(5000) })
      .catch(() => null),
    fetch(`${base}/api/product-units/active`, { signal: AbortSignal.timeout(5000) })
      .catch(() => null),
  ])

  let product: PublicProduct | null = null
  if (productRes?.ok) {
    product = await productRes.json() as PublicProduct
  }

  // The shop name comes from its own endpoint: the product carries only an id.
  let supplier: PublicSupplier | null = null
  if (product) {
    const supplierRes = await fetch(`${base}/api/suppliers/${product.supplierId}`, {
      signal: AbortSignal.timeout(5000),
    }).catch(() => null)
    if (supplierRes?.ok) {
      const raw = await supplierRes.json() as PublicSupplier
      if (raw.validationStatus === 'VALIDATED') {
        supplier = raw
      }
    }
  }

  let unitLabel = ''
  if (unitsRes?.ok && product) {
    const units = await unitsRes.json() as { items: ProductUnit[] }
    unitLabel = units.items.find(u => u.code === product.unit)?.shortLabel ?? ''
  }

  return { content, product, supplier, unitLabel, productId: params.id }
}

export function meta({ data }: Route.MetaArgs) {
  const product = data?.product
  const supplier = data?.supplier
  const title = product ? `${product.name} · eBio` : 'Produit introuvable · eBio'
  const price = product
    ? `${formatPrice(product.promotionalPrice ?? product.pricePerUnit)} FCFA${data?.unitLabel ? `/${data.unitLabel}` : ''}`
    : ''
  const description = product
    ? `${product.name} à ${price}${supplier ? ` chez ${supplier.shopName}` : ''} sur eBio : commande et livraison par l'application.`
    : 'Ce produit n’est pas ou plus disponible sur eBio.'
  const image = product?.photos[0] ?? `${SITE_URL}/og-image.jpg`
  const url = `${SITE_URL}/produit/${data?.productId ?? ''}`
  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:type', content: 'product' },
    { property: 'og:url', content: url },
    { property: 'og:image', content: image },
    { name: 'twitter:card', content: 'summary_large_image' },
    { tagName: 'link', rel: 'canonical', href: url },
    // A page for one product, not a search destination.
    { name: 'robots', content: 'noindex' },
  ]
}

export default function Produit({ loaderData }: Route.ComponentProps) {
  const { content, product, supplier, unitLabel, productId } = loaderData
  const hasPromo = product !== null
    && product.promotionalPrice !== null
    && product.promotionalPrice < product.pricePerUnit
  const labels = product?.labels.map(code => LABEL_NAMES[code]).filter(Boolean) ?? []

  return (
    <>
      <SiteHeader />
      <main className="paper-grain">
        <div className="mx-auto max-w-2xl px-5 py-16">
          {product
            ? (
                <article className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
                  {product.photos[0] && (
                    <img
                      src={product.photos[0]}
                      alt={product.name}
                      className="h-64 w-full object-cover"
                    />
                  )}
                  <div className="p-7">
                    {product.categoryName && (
                      <p className="text-xs font-semibold tracking-widest text-ink-faint uppercase">
                        {product.categoryName}
                      </p>
                    )}
                    <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-ink">
                      {product.name}
                    </h1>

                    <div className="mt-4 flex flex-wrap items-baseline gap-3">
                      <span className="font-mono text-3xl font-bold text-green-600">
                        {formatPrice(product.promotionalPrice ?? product.pricePerUnit)}
                        {' '}
                        <span className="text-base">FCFA</span>
                      </span>
                      {unitLabel && (
                        <span className="text-sm text-ink-soft">
                          /
                          {unitLabel}
                        </span>
                      )}
                      {hasPromo && (
                        <span className="font-mono text-sm text-ink-faint line-through">
                          {formatPrice(product.pricePerUnit)}
                          {' '}
                          FCFA
                        </span>
                      )}
                    </div>

                    {labels.length > 0 && (
                      <ul className="mt-4 flex flex-wrap gap-2">
                        {labels.map(label => (
                          <li
                            key={label}
                            className="rounded-full bg-green-50 px-3 py-1 text-sm font-semibold text-green-800"
                          >
                            {label}
                          </li>
                        ))}
                      </ul>
                    )}

                    {product.description && (
                      <p className="mt-6 leading-relaxed whitespace-pre-line text-ink-soft">
                        {product.description}
                      </p>
                    )}

                    {product.origin && (
                      <p className="mt-4 text-sm text-ink-soft">
                        <span className="font-semibold text-ink">Origine : </span>
                        {product.origin}
                      </p>
                    )}

                    {supplier && (
                      <a
                        href={`/boutique/${supplier.id}`}
                        className="mt-6 flex items-center gap-3 rounded-xl border border-line p-3 transition-colors hover:bg-paper"
                      >
                        {supplier.profilePhoto && (
                          <img
                            src={supplier.profilePhoto}
                            alt=""
                            className="h-11 w-11 rounded-full border border-line object-cover"
                          />
                        )}
                        <span>
                          <span className="block font-semibold text-ink">{supplier.shopName}</span>
                          {supplier.neighborhood && (
                            <span className="block text-sm text-ink-soft">{supplier.neighborhood}</span>
                          )}
                        </span>
                      </a>
                    )}

                    <a
                      href={`ebio-mobile://produit/${productId}`}
                      className="mt-6 inline-flex items-center gap-2 rounded-full bg-green-600 px-7 py-3.5 font-bold text-white transition-colors hover:bg-green-800"
                    >
                      Commander dans l’application
                      <span aria-hidden="true">→</span>
                    </a>

                    <div className="mt-8 border-t border-line pt-6">
                      <p className="mb-3 text-sm text-ink-faint">Pas encore l’application ?</p>
                      <StoreBadges stores={content.stores} onComingSoon={() => {}} />
                    </div>
                  </div>
                </article>
              )
            : (
                <div className="rounded-2xl border border-line bg-white p-10 text-center shadow-sm">
                  <h1 className="text-2xl font-extrabold tracking-tight text-ink">
                    Produit introuvable
                  </h1>
                  <p className="mt-3 text-ink-soft">
                    Ce produit n’est pas ou plus disponible sur eBio.
                  </p>
                  <div className="mt-8">
                    <StoreBadges stores={content.stores} onComingSoon={() => {}} />
                  </div>
                </div>
              )}
        </div>
      </main>
      <SiteFooter footer={content.footer} onDownloadClick={() => {}} />
    </>
  )
}
