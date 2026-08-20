const NAV_LINKS = [
  { href: '/#comment-ca-marche', label: 'Comment ça marche' },
  { href: '/#fournisseurs', label: 'Fournisseurs' },
  { href: '/#faq', label: 'FAQ' },
  { href: '/#contact', label: 'Contact' },
]

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-line/60 bg-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <a href="/" className="flex items-center gap-2" aria-label="eBio, accueil">
          <img src="/logo-ebio.png" alt="eBio" className="h-10 w-auto" />
        </a>
        <nav aria-label="Navigation principale" className="hidden items-center gap-7 md:flex">
          {NAV_LINKS.map(link => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-semibold text-ink-soft transition-colors hover:text-green-600"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <a
          href="/#fournisseurs"
          className="rounded-full bg-green-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-green-800"
        >
          Je veux vendre
        </a>
      </div>
    </header>
  )
}
