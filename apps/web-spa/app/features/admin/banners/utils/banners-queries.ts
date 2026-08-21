import {
  bannersControllerCreate,
  bannersControllerFindAll,
  bannersControllerFindById,
  bannersControllerRemove,
  bannersControllerUpdate,
} from '@boilerstone/openapi-generator/client/sdk.gen'

export type BannerTargetType = 'SUPPLIER' | 'PRODUCT' | 'URL' | 'NONE'

export interface Banner {
  id: string
  title: string
  subtitle: string | null
  imageUrl: string
  targetType: BannerTargetType
  targetId: string | null
  targetUrl: string | null
  /** Nom de la cible, résolu par l'API — `null` si elle a été supprimée. */
  targetLabel: string | null
  isActive: boolean
  position: number
  createdAt: string
}

export interface BannersPage {
  items: Banner[]
  total: number
}

export interface BannerInput {
  title: string
  subtitle?: string
  imageUrl: string
  targetType: BannerTargetType
  targetId: string | null
  targetUrl: string | null
  isActive: boolean
  position: number
}

export function fetchBannersQueryOptions() {
  return {
    queryKey: ['admin', 'banners'],
    queryFn: async () => {
      const response = await bannersControllerFindAll()
      if (response.error)
        throw new Error('Failed to fetch banners')
      return response.data as BannersPage
    },
  }
}

export function fetchBannerQueryOptions(bannerId: string) {
  return {
    queryKey: ['admin', 'banners', bannerId],
    queryFn: async () => {
      const response = await bannersControllerFindById({ path: { id: bannerId } })
      if (response.error)
        throw new Error('Failed to fetch banner')
      return response.data as Banner
    },
  }
}

export async function createBanner(input: BannerInput): Promise<Banner> {
  const response = await bannersControllerCreate({ body: input })
  if (response.error)
    throw new Error('Failed to create banner')
  return response.data as Banner
}

export async function updateBanner(bannerId: string, input: Partial<BannerInput>): Promise<Banner> {
  const response = await bannersControllerUpdate({ path: { id: bannerId }, body: input })
  if (response.error)
    throw new Error('Failed to update banner')
  return response.data as Banner
}

export async function deleteBanner(bannerId: string): Promise<void> {
  const response = await bannersControllerRemove({ path: { id: bannerId } })
  if (response.error)
    throw new Error('Failed to delete banner')
}
