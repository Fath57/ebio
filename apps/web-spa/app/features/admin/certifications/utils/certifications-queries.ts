import {
  certificationsControllerCreate,
  certificationsControllerFindActive,
  certificationsControllerFindAll,
  certificationsControllerFindById,
  certificationsControllerRemove,
  certificationsControllerUpdate,
} from '@boilerstone/openapi-generator/client/sdk.gen'

export interface Certification {
  id: string
  code: string
  name: string
  description: string | null
  logoUrl: string | null
  isActive: boolean
  sortOrder: number
  /** Products carrying it, a label in use cannot be deleted, only retired. */
  productCount: number
}

export interface CertificationsPage {
  items: Certification[]
  total: number
}

export interface CertificationInput {
  code: string
  name: string
  description: string | null
  logoUrl: string | null
  isActive: boolean
  sortOrder: number
}

export function fetchCertificationsQueryOptions() {
  return {
    queryKey: ['admin', 'certifications'],
    queryFn: async () => {
      const response = await certificationsControllerFindAll()
      if (response.error)
        throw new Error('Failed to fetch certifications')
      return response.data as CertificationsPage
    },
  }
}

/** What the product form offers and the product pages name: active labels only. */
export function fetchActiveCertificationsQueryOptions() {
  return {
    queryKey: ['certifications', 'active'],
    queryFn: async () => {
      const response = await certificationsControllerFindActive()
      if (response.error)
        throw new Error('Failed to fetch certifications')
      return response.data as CertificationsPage
    },
    staleTime: 5 * 60_000,
  }
}

export function fetchCertificationQueryOptions(id: string) {
  return {
    queryKey: ['admin', 'certifications', id],
    queryFn: async () => {
      const response = await certificationsControllerFindById({ path: { id } })
      if (response.error)
        throw new Error('Failed to fetch certification')
      return response.data as Certification
    },
  }
}

export const createCertificationMutationOptions = {
  mutationFn: async (data: CertificationInput) => {
    const response = await certificationsControllerCreate({ body: data })
    if (response.error)
      throw new Error(readError(response.error))
    return response.data as Certification
  },
}

export const updateCertificationMutationOptions = {
  mutationFn: async ({ id, code: _code, ...data }: Partial<CertificationInput> & { id: string }) => {
    const response = await certificationsControllerUpdate({ path: { id }, body: data })
    if (response.error)
      throw new Error(readError(response.error))
    return response.data as Certification
  },
}

export const deleteCertificationMutationOptions = {
  mutationFn: async (id: string) => {
    const response = await certificationsControllerRemove({ path: { id } })
    if (response.error)
      throw new Error(readError(response.error))
    return response.data
  },
}

/** The API explains refusals in French, a duplicate code, a label still worn. */
function readError(error: unknown): string {
  const message = (error as { message?: unknown })?.message
  return typeof message === 'string' ? message : 'Une erreur est survenue'
}
