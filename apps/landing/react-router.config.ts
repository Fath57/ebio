import type { Config } from '@react-router/dev/config'

export default {
  // The landing exists for search engines and slow connections: full SSR.
  ssr: true,
  // React Router rejects any action whose `Origin` differs from the host the
  // server sees. Behind the production proxy that host is not `e-bio.org`, so
  // every contact form submission was refused with a 400. Naming the public
  // domain keeps the CSRF check for everything else.
  allowedActionOrigins: ['e-bio.org', 'www.e-bio.org'],
} satisfies Config
