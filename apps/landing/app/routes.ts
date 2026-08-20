import type { RouteConfig } from '@react-router/dev/routes'
import { index, route } from '@react-router/dev/routes'

export default [
  index('routes/home.tsx'),
  route('cgu', 'routes/cgu.tsx'),
  route('confidentialite', 'routes/confidentialite.tsx'),
  route('suppression-donnees', 'routes/suppression-donnees.tsx'),
] satisfies RouteConfig
