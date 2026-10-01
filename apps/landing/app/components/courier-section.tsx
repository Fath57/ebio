import type { LandingCourier } from '@/content/landing-content'

/** A courier's day in three moves, mirroring what the courier app shows. */
const COURIER_FLOW = [
  { title: 'Une course tombe', body: 'Une commande est prête dans votre zone : vous voyez l’adresse et votre gain.' },
  { title: 'Vous acceptez', body: 'Vous récupérez le colis à la boutique, au moment qui vous convient.' },
  { title: 'Vous livrez', body: 'Le code de l’acheteur valide la remise, et votre gain arrive dans votre portefeuille.' },
]

interface CourierSectionProps {
  content: LandingCourier
  onCta: () => void
}

/**
 * The third audience of eBio, after buyers and shops: the couriers of the
 * shared fleet. Kept on the earth palette so it does not read as a second
 * supplier band.
 */
export function CourierSection({ content, onCta }: CourierSectionProps) {
  return (
    <section id="livreurs" className="scroll-mt-20 border-b border-line bg-earth-50">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 md:grid-cols-2">
        <div>
          <p className="eyebrow text-earth-600">{content.eyebrow}</p>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-ink md:text-4xl">{content.title}</h2>
          <p className="mt-5 max-w-lg leading-relaxed text-ink-soft">{content.body}</p>
          <ul className="mt-7 space-y-3">
            {content.points.map(point => (
              <li key={point} className="flex items-start gap-3 text-ink">
                <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-earth-400" />
                {point}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={onCta}
            className="mt-9 inline-flex items-center gap-2 rounded-full bg-green-600 px-7 py-3.5 font-bold text-white transition-colors hover:bg-green-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-400"
          >
            {content.ctaLabel}
            <span aria-hidden="true">→</span>
          </button>
        </div>

        <div className="rounded-2xl border border-line bg-white p-7 shadow-[0_2px_8px_rgba(0,0,0,0.06)] md:p-9">
          <img src="/illustrations/spot-livraison.webp" alt="" className="h-20 w-20 object-contain" />
          <ol className="mt-6 space-y-6">
            {COURIER_FLOW.map((step, index) => (
              <li key={step.title} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-50 font-mono font-bold text-green-600">
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-bold text-ink">{step.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-soft">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
