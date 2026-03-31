import type { Route } from './+types/root'
import { client } from '@boilerstone/openapi-generator'
import { QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router'
import { AbilityProvider } from '@/lib/casl/ability-context'
import { queryClient } from '@/lib/query-client'
import useTheme from './hooks/useTheme'
import '@/lib/i18n/i18n-client'
import '@boilerstone/ui/globals.css'
import '@/styles/ebio-tokens.css'

client.setConfig({
  baseUrl: import.meta.env.VITE_API_URL,
  credentials: 'include',
})

export const links: Route.LinksFunction = () => [
  { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
  {
    rel: 'preconnect',
    href: 'https://fonts.gstatic.com',
    crossOrigin: 'anonymous',
  },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=JetBrains+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap',
  },
]

export function Layout({ children }: { children: React.ReactNode }) {
  const [, resolvedTheme] = useTheme()

  useEffect(() => {
    document.body.classList.toggle('dark', resolvedTheme === 'dark')
  }, [resolvedTheme])

  return (
    <html lang="fr">
      <head>
        <title>eBio</title>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="author" content="eBio" />
        <meta
          name="keywords"
          content="eBio, bio, produits bio, marketplace, Afrique de l'Ouest"
        />
        <meta
          name="description"
          content="eBio — Trouvez des produits bio près de chez vous."
        />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <Meta />
        <Links />
      </head>
      <body className="bg-gradient-bg">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AbilityProvider>
        <Outlet />
      </AbilityProvider>
    </QueryClientProvider>
  )
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = 'Oops!'
  let details = 'Une erreur inattendue est survenue.'
  let stack: string | undefined

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? '404' : 'Erreur'
    details
      = error.status === 404
        ? 'La page demandée est introuvable.'
        : error.statusText || details
  }
  else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message
    stack = error.stack
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  )
}
