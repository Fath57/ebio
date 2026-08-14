import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes — data considered fresh
      gcTime: 15 * 60 * 1000, // 15 minutes — cache kept in memory
      retry: 1,
      refetchOnWindowFocus: false,
      // `true` (défaut React Query) recharge au montage uniquement si la donnée
      // est périmée. `false` l'empêchait même après invalidation : une liste
      // rouverte après une mutation affichait l'état d'avant.
      refetchOnMount: true,
    },
  },
})
