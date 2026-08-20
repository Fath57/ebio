import type { Config } from '@react-router/dev/config'

export default {
  // The landing exists for search engines and slow connections: full SSR.
  ssr: true,
} satisfies Config
