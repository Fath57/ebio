import type { Route } from './+types/home'
import { useState } from 'react'
import { AppScreens } from '@/components/app-screens'
import { ComingSoonModal } from '@/components/coming-soon-modal'
import { SITE_URL } from '@/components/constants'
import { ContactSection } from '@/components/contact-section'
import { IllustrationSlot } from '@/components/illustration-slot'
import { ILLUSTRATIONS } from '@/components/illustrations'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { StoreBadges } from '@/components/store-badges'
import { fetchLandingContent, sendContactMessage } from '@/content/landing-content.server'

export async function loader() {
  return { content: await fetchLandingContent() }
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData()
  return sendContactMessage({
    name: String(form.get('name') ?? ''),
    email: String(form.get('email') ?? ''),
    phone: String(form.get('phone') ?? ''),
    reason: String(form.get('reason') ?? 'AUTRE'),
    message: String(form.get('message') ?? ''),
    company: String(form.get('company') ?? ''),
    startedAt: String(form.get('startedAt') ?? ''),
  })
}

export function meta(_args: Route.MetaArgs) {
  const title = 'eBio — Des produits locaux et bio, près de chez vous'
  const description
    = 'eBio met sur la carte les producteurs, transformateurs et boutiques bio autour de vous, au Bénin. '
      + 'Commandez, payez par Mobile Money, faites-vous livrer ou passez retirer à la boutique.'
  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:type', content: 'website' },
    { property: 'og:locale', content: 'fr_FR' },
    { property: 'og:url', content: SITE_URL },
    { property: 'og:site_name', content: 'eBio' },
    { property: 'og:image', content: `${SITE_URL}/og-image.jpg` },
    { property: 'og:image:width', content: '1200' },
    { property: 'og:image:height', content: '630' },
    { property: 'og:image:alt', content: 'eBio — des produits locaux et bio, près de chez vous' },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:image', content: `${SITE_URL}/og-image.jpg` },
    { tagName: 'link', rel: 'canonical', href: SITE_URL },
  ]
}

const TRUST_ICONS = [
  '/illustrations/spot-valide.webp',
  '/illustrations/spot-mobile-money.webp',
  '/illustrations/spot-livraison.webp',
]

const STEP_ILLUSTRATIONS = [ILLUSTRATIONS.step1, ILLUSTRATIONS.step2, ILLUSTRATIONS.step3]

export default function Home({ loaderData }: Route.ComponentProps) {
  const { content } = loaderData
  const [isComingSoonOpen, setIsComingSoonOpen] = useState(false)

  function openComingSoon(): void {
    setIsComingSoonOpen(true)
  }

  // The highlighted words are painted only when they are really in the title.
  const highlightIndex = content.hero.highlight
    ? content.hero.title.indexOf(content.hero.highlight)
    : -1

  return (
    <>
      <SiteHeader />
      <main>
        {/* Hero: the concept in one sentence, the product scene beside it */}
        <section className="paper-grain">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 md:grid-cols-[1.05fr_1fr] md:py-24">
            <div>
              <p className="eyebrow text-earth-600">{content.hero.eyebrow}</p>
              <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight text-ink md:text-[3.4rem]">
                {highlightIndex >= 0
                  ? (
                      <>
                        {content.hero.title.slice(0, highlightIndex)}
                        <span className="text-green-600">{content.hero.highlight}</span>
                        {content.hero.title.slice(highlightIndex + content.hero.highlight.length)}
                      </>
                    )
                  : content.hero.title}
              </h1>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-ink-soft">{content.hero.subtitle}</p>
              <StoreBadges stores={content.stores} onComingSoon={openComingSoon} className="mt-9" />
              <p className="mt-6 font-mono text-xs text-ink-faint">{content.hero.footnote}</p>
            </div>
            <IllustrationSlot spec={ILLUSTRATIONS.hero} />
          </div>
        </section>

        {/* Why trust it */}
        <section aria-label="Ce qui fait confiance" className="border-y border-line bg-white">
          <div className="mx-auto grid max-w-6xl gap-8 px-5 py-14 md:grid-cols-3">
            {content.trust.points.map((point, index) => (
              <article key={point.title} className="flex items-start gap-4">
                <img src={TRUST_ICONS[index] ?? TRUST_ICONS[0]} alt="" className="h-20 w-20 shrink-0 object-contain" />
                <div>
                  <h2 className="font-bold text-ink">{point.title}</h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{point.body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* How it works: a real sequence, so the numbers mean something */}
        <section id="comment-ca-marche" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <p className="eyebrow text-earth-600">{content.steps.eyebrow}</p>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
              {content.steps.title}
            </h2>
            <div className="mt-14 space-y-20">
              {content.steps.steps.map((step, index) => (
                <article
                  key={step.title}
                  className="grid items-center gap-10 md:grid-cols-2"
                >
                  <div className={index % 2 === 1 ? 'md:order-2' : undefined}>
                    <p className="text-6xl font-extrabold tracking-tight text-green-400">
                      {String(index + 1).padStart(2, '0')}
                    </p>
                    <h3 className="mt-3 text-2xl font-extrabold tracking-tight text-ink">{step.title}</h3>
                    <p className="mt-4 max-w-md leading-relaxed text-ink-soft">{step.body}</p>
                  </div>
                  <IllustrationSlot
                    spec={STEP_ILLUSTRATIONS[index] ?? ILLUSTRATIONS.step1}
                    className={index % 2 === 1 ? 'md:order-1' : undefined}
                  />
                </article>
              ))}
            </div>
          </div>
        </section>

        <AppScreens />

        {/* Producers and processors: reach beyond the neighborhood */}
        <section id="fournisseurs" className="scroll-mt-20 bg-green-900 text-paper">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 md:grid-cols-2">
            <div>
              <p className="eyebrow text-green-200">{content.supplier.eyebrow}</p>
              <h2 className="mt-4 text-3xl font-extrabold tracking-tight md:text-4xl">
                {content.supplier.title}
              </h2>
              <p className="mt-5 max-w-lg leading-relaxed text-green-100">{content.supplier.body}</p>
              <ul className="mt-7 space-y-3">
                {content.supplier.points.map(point => (
                  <li key={point} className="flex items-start gap-3 text-green-50">
                    <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-green-200" />
                    {point}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={openComingSoon}
                className="mt-9 inline-flex items-center gap-2 rounded-full bg-green-600 px-7 py-3.5 font-bold text-white transition-colors hover:bg-green-200 hover:text-green-900"
              >
                {content.supplier.ctaLabel}
                <span aria-hidden="true">→</span>
              </button>
            </div>
            <IllustrationSlot spec={ILLUSTRATIONS.supplier} />
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20">
          <div className="mx-auto max-w-3xl px-5 py-20">
            <h2 className="text-3xl font-extrabold tracking-tight text-ink md:text-4xl">Questions fréquentes</h2>
            <div className="mt-8 divide-y divide-line border-y border-line">
              {content.faq.map(item => (
                <details key={item.question} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-ink">
                    {item.question}
                    <span aria-hidden="true" className="text-green-400 transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 leading-relaxed text-ink-soft">{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <ContactSection />
      </main>
      <SiteFooter footer={content.footer} onDownloadClick={openComingSoon} />
      <ComingSoonModal
        open={isComingSoonOpen}
        onClose={() => setIsComingSoonOpen(false)}
        title={content.stores.comingSoonTitle}
        body={content.stores.comingSoonBody}
      />
    </>
  )
}
