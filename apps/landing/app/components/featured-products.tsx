import type { FeaturedProduct } from '@/content/featured-products'
import { formatPrice } from './format'

/**
 * "Déjà sur eBio": real products from validated shops. It is the page's proof
 * that the market exists, so it renders nothing rather than placeholders when
 * the API has nothing to show.
 */
export function FeaturedProducts({ products }: { products: FeaturedProduct[] }) {
  if (products.length === 0) {
    return null
  }

  return (
    <section id="produits" className="scroll-mt-20 border-b border-line">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <p className="eyebrow text-earth-600">Déjà sur eBio</p>
        <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
          Les produits du moment
        </h2>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-soft">
          Jus, épices, conserves et produits frais, préparés par des boutiques Validé eBio au Bénin.
        </p>
        <ul className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
          {products.map(product => (
            <li key={product.id}>
              <ProductCard product={product} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function ProductCard({ product }: { product: FeaturedProduct }) {
  return (
    <a
      href={`/produit/${product.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-line bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-shadow hover:shadow-[0_8px_24px_rgba(0,0,0,0.10)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-400"
    >
      <div className="aspect-[4/3] overflow-hidden bg-paper">
        <img
          src={product.photo}
          alt={product.name}
          loading="lazy"
          // A dead link leaves the neutral frame rather than raw alt text.
          onError={(event) => {
            event.currentTarget.style.visibility = 'hidden'
          }}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="truncate text-xs font-semibold text-earth-600">{product.shopName}</p>
        <h3 className="mt-1 line-clamp-2 font-bold leading-snug text-ink">{product.name}</h3>
        <p className="mt-auto pt-3">
          {/* Price and unit each stay whole: on a narrow card the unit wraps as
            * a block instead of leaving a dangling slash. */}
          <span className="font-mono font-bold whitespace-nowrap text-green-600">
            {formatPrice(product.price)}
            {' FCFA'}
          </span>
          {product.unitLabel && ' '}
          {product.unitLabel && (
            <span className="text-sm whitespace-nowrap text-ink-soft">
              {'/ '}
              {product.unitLabel}
            </span>
          )}
        </p>
        {product.originalPrice !== null && (
          <p className="font-mono text-xs text-ink-faint line-through">
            {formatPrice(product.originalPrice)}
            {' FCFA'}
          </p>
        )}
      </div>
    </a>
  )
}
