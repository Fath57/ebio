import type { LandingStores } from '@/content/landing-content'

interface StoreBadgesProps {
  stores: LandingStores
  /** Opens the waiting modal for a store whose URL is not published yet. */
  onComingSoon: () => void
  className?: string
}

/**
 * The official store badges, used as required by both brands. A badge links to
 * its store as soon as the backoffice holds the URL; until then it opens the
 * "coming soon" modal. No deploy involved on publication day.
 */
export function StoreBadges({ stores, onComingSoon, className = '' }: StoreBadgesProps) {
  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      <BadgeLink url={stores.playStoreUrl} onComingSoon={onComingSoon}>
        <img
          src="/badge-google-play.png"
          alt="Disponible sur Google Play"
          className="h-[3.6rem] w-auto"
        />
      </BadgeLink>
      <BadgeLink url={stores.appStoreUrl} onComingSoon={onComingSoon}>
        <img
          src="/badge-app-store.svg"
          alt="Télécharger dans l’App Store"
          className="h-12 w-auto"
        />
      </BadgeLink>
    </div>
  )
}

interface BadgeLinkProps {
  url: string | null
  onComingSoon: () => void
  children: React.ReactNode
}

function BadgeLink({ url, onComingSoon, children }: BadgeLinkProps) {
  if (url) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="transition-opacity hover:opacity-80">
        {children}
      </a>
    )
  }
  return (
    <button type="button" onClick={onComingSoon} className="transition-opacity hover:opacity-80">
      {children}
    </button>
  )
}
