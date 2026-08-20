import type { Route } from './+types/root'
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router'
import './styles/landing.css'

export const links: Route.LinksFunction = () => [
  { rel: 'icon', href: '/favicon.png', type: 'image/png' },
  { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
  { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
]

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export default function App() {
  return <Outlet />
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = 'Erreur'
  let details = 'Une erreur inattendue est survenue.'

  if (isRouteErrorResponse(error)) {
    title = error.status === 404 ? 'Page introuvable' : 'Erreur'
    details = error.status === 404
      ? 'La page demandée n’existe pas. Revenez à l’accueil pour trouver des produits bio près de chez vous.'
      : error.statusText || details
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-24 text-center">
      <h1 className="text-4xl font-extrabold tracking-tight text-green-600">{title}</h1>
      <p className="mt-4 text-ink-soft">{details}</p>
      <a href="/" className="mt-8 inline-block rounded-full bg-green-600 px-6 py-3 font-semibold text-white">
        Retour à l’accueil
      </a>
    </main>
  )
}
