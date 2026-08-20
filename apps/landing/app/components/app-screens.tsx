const SCREENS = [
  {
    file: 'accueil.webp',
    caption: 'L’accueil, avec les boutiques autour de vous',
    alt: 'Écran d’accueil de l’app eBio : position Cotonou, catégories de produits et promotions du moment',
  },
  {
    file: 'carte.webp',
    caption: 'La carte, et les boutiques Validé eBio',
    alt: 'La carte eBio autour de Cotonou avec la fiche d’une boutique validée et sa distance',
  },
  {
    file: 'boutique.webp',
    caption: 'La fiche boutique, du contact à la commande',
    alt: 'La fiche de la boutique Granges d’Afrique : contact, horaires, itinéraire et jus en promotion en FCFA',
  },
]

/**
 * Real screenshots of the app running against live data, framed in CSS-drawn
 * phones. Nothing staged: what the section shows is what the store delivers.
 */
export function AppScreens() {
  return (
    <section aria-label="Captures d’écran de l’application" className="border-y border-line bg-white">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <p className="eyebrow text-earth-600">L’application</p>
        <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
          Le marché bio, dans votre poche
        </h2>
        <p className="mt-4 max-w-lg text-lg leading-relaxed text-ink-soft">
          Les boutiques autour de vous, leurs produits du moment et vos
          commandes, réunis dans une seule application.
        </p>
        <div className="mt-12 grid gap-10 sm:grid-cols-3">
          {SCREENS.map(screen => (
            <figure key={screen.file} className="mx-auto max-w-[16rem]">
              <div className="overflow-hidden rounded-[2.2rem] border-[6px] border-ink bg-ink shadow-[0_12px_32px_rgba(42,41,36,0.18)]">
                <img
                  src={`/captures/${screen.file}`}
                  alt={screen.alt}
                  loading="lazy"
                  className="block w-full rounded-[1.9rem]"
                />
              </div>
              <figcaption className="mt-4 text-center text-sm font-semibold text-ink-soft">
                {screen.caption}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}
