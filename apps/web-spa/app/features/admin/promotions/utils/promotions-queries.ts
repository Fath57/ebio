import { client } from '@boilerstone/openapi-generator'

export type PromotionType = 'PRICE' | 'BOGO' | 'FREE_DELIVERY'
export type PromotionAuthor = 'SUPPLIER' | 'PLATFORM'

export const PROMOTION_TYPES: readonly PromotionType[] = ['PRICE', 'BOGO', 'FREE_DELIVERY']

export interface ProductPromotion {
  id: string
  type: PromotionType
  promoPrice: number | null
  buyQty: number | null
  getQty: number | null
  startsAt: string
  endsAt: string | null
  /** SUPPLIER pays for its own promotion; PLATFORM = eBio compensates the shop. */
  createdBy: PromotionAuthor
  isActive: boolean
}

export interface CreateProductPromotionInput {
  type: PromotionType
  promoPrice?: number
  buyQty?: number
  getQty?: number
  startsAt?: string
  endsAt?: string | null
}

/**
 * The generated SDK does not expose the admin promotion routes yet, so the
 * calls go through the shared client — same session cookies, same base URL.
 */
export function productPromotionsQueryKey(productId: string) {
  return ['admin', 'products', productId, 'promotions'] as const
}

export function fetchProductPromotionsQueryOptions(productId: string) {
  return {
    queryKey: productPromotionsQueryKey(productId),
    queryFn: async () => {
      const response = await client.get({
        url: '/api/admin/products/{id}/promotions',
        path: { id: productId },
      })
      if (response.error)
        throw new Error(readError(response.error))
      return response.data as ProductPromotion[]
    },
  }
}

export async function createProductPromotion(
  productId: string,
  input: CreateProductPromotionInput,
): Promise<ProductPromotion> {
  const response = await client.post({
    url: '/api/admin/products/{id}/promotions',
    path: { id: productId },
    body: input,
  })
  if (response.error)
    throw new Error(readError(response.error))
  return response.data as ProductPromotion
}

export async function removeProductPromotion(productId: string, promotionId: string): Promise<void> {
  const response = await client.delete({
    url: '/api/admin/products/{id}/promotions/{promotionId}',
    path: { id: productId, promotionId },
  })
  if (response.error)
    throw new Error(readError(response.error))
}

/**
 * The API explains a refusal in French (promo price above the regular price,
 * quantities out of range); that message is what the admin needs to see.
 */
function readError(error: unknown): string {
  const message = (error as { message?: unknown })?.message
  return typeof message === 'string' ? message : 'Une erreur est survenue'
}
