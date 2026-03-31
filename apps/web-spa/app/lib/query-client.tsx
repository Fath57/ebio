import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes — data considered fresh
      gcTime: 15 * 60 * 1000, // 15 minutes — cache kept in memory
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnMount: false, // Don't refetch when component re-mounts if data is fresh
    },
  },
})
