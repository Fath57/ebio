import type { LandingFooter } from '@/content/landing-content'

interface SiteFooterProps {
  footer: LandingFooter
  onDownloadClick: () => void
}

export function SiteFooter({ footer, onDownloadClick }: SiteFooterProps) {
  return (
    <footer className="bg-green-900 text-paper">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-5 py-14 md:flex-row md:items-start md:justify-between">
        <div className="max-w-xs">
          <img src="/logo-ebio-blanc.png" alt="eBio" className="h-10 w-auto" />
          <p className="mt-4 text-sm leading-relaxed text-green-100">{footer.tagline}</p>
        </div>
        <nav aria-label="Liens du pied de page" className="grid grid-cols-2 gap-x-16 gap-y-3 text-sm">
          <button type="button" onClick={onDownloadClick} className="text-left text-green-100 transition-colors hover:text-white">Télécharger l’app</button>
          <a href="/#fournisseurs" className="text-green-100 transition-colors hover:text-white">Vendre sur eBio</a>
          <a href="/#comment-ca-marche" className="text-green-100 transition-colors hover:text-white">Comment ça marche</a>
          <a href="/#faq" className="text-green-100 transition-colors hover:text-white">FAQ</a>
          <a href="/#contact" className="text-green-100 transition-colors hover:text-white">Contact</a>
        </nav>
      </div>
      <div className="border-t border-green-800">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-4 text-xs md:flex-row md:items-center md:justify-between">
          <p className="font-mono text-green-200">
            ©
            {' '}
            {new Date().getFullYear()}
            {' '}
            {footer.bottomLine}
          </p>
          <nav aria-label="Liens légaux" className="flex flex-wrap gap-x-5 gap-y-1">
            <a href="/cgu" className="text-green-200 transition-colors hover:text-white">CGU</a>
            <a href="/confidentialite" className="text-green-200 transition-colors hover:text-white">Confidentialité</a>
            <a href="/suppression-donnees" className="text-green-200 transition-colors hover:text-white">Suppression des données</a>
          </nav>
        </div>
      </div>
    </footer>
  )
}
