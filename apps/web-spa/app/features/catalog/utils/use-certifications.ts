import type { Certification } from '@/features/admin/certifications/utils/certifications-queries'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { fetchActiveCertificationsQueryOptions } from '@/features/admin/certifications/utils/certifications-queries'

/** The active labels of the platform, and their names by code. */
export function useCertifications(): { items: Certification[], names: ReadonlyMap<string, string> } {
  const { data } = useQuery(fetchActiveCertificationsQueryOptions())
  return useMemo(() => {
    const items = data?.items ?? []
    return { items, names: new Map(items.map(item => [item.code, item.name])) }
  }, [data])
}
