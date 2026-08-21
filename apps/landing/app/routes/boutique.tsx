import type { Route } from './+types/boutique'
import { SITE_URL } from '@/components/constants'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { StoreBadges } from '@/components/store-badges'
import { fetchLandingContent } from '@/content/landing-content.server'

interface PublicSupplier {
  id: string
  shopName: string
  profilePhoto: string | null
  coverPhoto: string | null
  address: string | null
  neighborhood: string | null
  globalRating: number | null
  totalReviews: number
  validationStatus: string
  isOpen: boolean
}

/**
 * Public shop page, the landing target of every shared profile link. Rich OG
 * tags give the share a real preview card in WhatsApp; the page itself sells
 * the shop and hands visitors the app.
 */
export async function loader({ params }: Route.LoaderArgs) {
  const base = process.env.API_URL ?? 'http://localhost:3000'
  const [content, supplierRes] = await Promise.all([
    fetchLandingContent(),
    fetch(`${base}/api/suppliers/${params.id}`, { signal: AbortSignal.timeout(5000) })
      .catch(() => null),
  ])

  let supplier: PublicSupplier | null = null
  if (supplierRes?.ok) {
    const raw = await supplierRes.json() as PublicSupplier
    if (raw.validationStatus === 'VALIDATED') {
      supplier = raw
    }
  }

  return { content, supplier, supplierId: params.id }
}

export function meta({ data }: Route.MetaArgs) {
  const supplier = data?.supplier
  const title = supplier ? `${supplier.shopName} · eBio` : 'Boutique introuvable · eBio'
  const description = supplier
    ? `Découvrez ${supplier.shopName}${supplier.neighborhood ? ` à ${supplier.neighborhood}` : ''} sur eBio : produits locaux et bio, commande et livraison par l'application.`
    : 'Cette boutique n’est pas ou plus disponible sur eBio.'
  const image = supplier?.coverPhoto ?? supplier?.profilePhoto ?? `${SITE_URL}/og-image.jpg`
  const url = `${SITE_URL}/boutique/${data?.supplierId ?? ''}`
  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:type', content: 'profile' },
    { property: 'og:url', content: url },
    { property: 'og:image', content: image },
    { name: 'twitter:card', content: 'summary_large_image' },
    { tagName: 'link', rel: 'canonical', href: url },
    // A page for one shop, not a search destination.
    { name: 'robots', content: 'noindex' },
  ]
}

export default function Boutique({ loaderData }: Route.ComponentProps) {
  const { content, supplier, supplierId } = loaderData

  return (
    <>
      <SiteHeader />
      <main className="paper-grain">
        <div className="mx-auto max-w-2xl px-5 py-16">
          {supplier
            ? (
                <article className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
                  {supplier.coverPhoto && (
                    <img
                      src={supplier.coverPhoto}
                      alt=""
                      className="h-44 w-full object-cover"
                    />
                  )}
                  <div className="p-7">
                    <div className="flex items-center gap-4">
                      {supplier.profilePhoto && (
                        <img
                          src={supplier.profilePhoto}
                          alt=""
                          className="h-16 w-16 rounded-full border border-line object-cover"
                        />
                      )}
                      <div>
                        <h1 className="text-2xl font-extrabold tracking-tight text-ink">
                          {supplier.shopName}
                        </h1>
                        <p className="mt-1 text-sm text-ink-soft">
                          {[supplier.neighborhood, supplier.address].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                      <span className="rounded-full bg-green-50 px-3 py-1 font-semibold text-green-800">
                        Boutique vérifiée
                      </span>
                      {supplier.globalRating !== null && (
                        <span className="text-ink-soft">
                          ★
                          {' '}
                          {supplier.globalRating.toFixed(1)}
                          {' '}
                          (
                          {supplier.totalReviews}
                          {' '}
                          avis)
                        </span>
                      )}
                      <span className={supplier.isOpen ? 'text-green-700' : 'text-ink-faint'}>
                        {supplier.isOpen ? 'Ouvert actuellement' : 'Fermé actuellement'}
                      </span>
                    </div>

                    <p className="mt-6 leading-relaxed text-ink-soft">
                      Retrouvez le catalogue complet, les prix et la commande dans l’application eBio.
                    </p>

                    <a
                      href={`ebio-mobile://boutique/${supplierId}`}
                      className="mt-6 inline-flex items-center gap-2 rounded-full bg-green-600 px-7 py-3.5 font-bold text-white transition-colors hover:bg-green-800"
                    >
                      Ouvrir dans l’application
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
                    Boutique introuvable
                  </h1>
                  <p className="mt-3 text-ink-soft">
                    Cette boutique n’est pas ou plus disponible sur eBio.
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
