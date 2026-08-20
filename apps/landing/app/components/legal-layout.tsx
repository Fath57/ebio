import type { LandingContent } from '@/content/landing-content'
import { useState } from 'react'
import { ComingSoonModal } from './coming-soon-modal'
import { SiteFooter } from './site-footer'
import { SiteHeader } from './site-header'

interface LegalLayoutProps {
  title: string
  lastUpdated: string
  content: LandingContent
  children: React.ReactNode
}

/** Shared frame of the legal pages: header, dated title, prose, footer. */
export function LegalLayout({ title, lastUpdated, content, children }: LegalLayoutProps) {
  const [isComingSoonOpen, setIsComingSoonOpen] = useState(false)

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-16">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink md:text-4xl">{title}</h1>
        <p className="mt-3 font-mono text-xs text-ink-soft">
          Dernière mise à jour :
          {' '}
          {lastUpdated}
        </p>
        <div className="legal-prose mt-8">
          {children}
        </div>
      </main>
      <SiteFooter footer={content.footer} onDownloadClick={() => setIsComingSoonOpen(true)} />
      <ComingSoonModal
        open={isComingSoonOpen}
        onClose={() => setIsComingSoonOpen(false)}
        title={content.stores.comingSoonTitle}
        body={content.stores.comingSoonBody}
      />
    </>
  )
}
