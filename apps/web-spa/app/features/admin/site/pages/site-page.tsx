import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { FaqManager } from '../components/faq-manager'
import {
  ContactCard,
  FooterCard,
  HeroCard,
  StepsCard,
  StoresCard,
  SupplierCard,
  TrustCard,
} from '../components/section-cards'
import { fetchLandingContentQueryOptions, fetchLandingFaqsQueryOptions } from '../utils/site-queries'

export default function SitePage() {
  const { t } = useTranslation()
  const { data: content, isLoading: isContentLoading } = useQuery(fetchLandingContentQueryOptions())
  const { data: faqs, isLoading: isFaqsLoading } = useQuery(fetchLandingFaqsQueryOptions())

  if (isContentLoading || isFaqsLoading || !content) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{t('admin.site.title')}</h2>
        <p className="text-muted-foreground">{t('admin.site.description')}</p>
      </div>
      <StoresCard initial={content.stores} />
      <HeroCard initial={content.hero} />
      <TrustCard initial={content.trust} />
      <StepsCard initial={content.steps} />
      <SupplierCard initial={content.supplier} />
      <FooterCard initial={content.footer} />
      <ContactCard initial={content.contact} />
      <FaqManager faqs={faqs ?? []} />
    </div>
  )
}
