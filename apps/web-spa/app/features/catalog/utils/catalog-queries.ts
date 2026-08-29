import type { CreateProduct, UpdateProduct } from '@boilerstone/openapi-generator/client/types.gen'
import { client } from '@boilerstone/openapi-generator'
import {
  productsControllerClearPromotion,
  productsControllerCreate,
  productsControllerFindBySupplier,
  productsControllerSetPromotion,
  productsControllerSoftDelete,
  productsControllerUpdate,
} from '@boilerstone/openapi-generator/client/sdk.gen'

export interface ProductItem {
  id: string
  name: string
  photo: string | null
  categoryName: string | null
  pricePerUnit: number
  promotionalPrice: number | null
  unit: string
  stock: number
  status: string
  createdAt: string
}

export interface PaginatedMeta {
  itemCount: number
  pageSize: number
  offset: number
  hasMore: boolean
}

export interface ProductsResponse {
  data: ProductItem[]
  meta: PaginatedMeta
}

export function fetchProductsQueryOptions(supplierId?: string) {
  return {
    queryKey: ['products', supplierId],
    queryFn: async () => {
      const response = await productsControllerFindBySupplier({
        path: { supplierId: supplierId ?? 'me' },
        query: {
          status: '',
          categoryId: '',
          offset: 0,
          pageSize: 50,
        },
      })
      if (response.error)
        throw new Error('Failed to fetch products')
      return response.data as ProductsResponse
    },
  }
}

export function fetchProductByIdQueryOptions(productId: string) {
  return {
    queryKey: ['products', productId],
    queryFn: async () => {
      const response = await client.get({
        url: '/api/products/{id}',
        path: { id: productId },
      })
      if (response.error)
        throw new Error('Failed to fetch product')
      return response.data
    },
  }
}

export const createProductMutationOptions = {
  mutationFn: async (data: CreateProduct) => {
    const response = await productsControllerCreate({
      body: data,
    })
    if (response.error)
      throw new Error('Failed to create product')
    return response.data
  },
}

export const updateProductMutationOptions = {
  mutationFn: async ({ id, ...data }: UpdateProduct & { id: string }) => {
    const response = await productsControllerUpdate({
      path: { id },
      body: data,
    })
    if (response.error)
      throw new Error('Failed to update product')
    return response.data
  },
}

export async function setProductPromotion(id: string, promotionalPrice: number, expiresAt: string) {
  const response = await productsControllerSetPromotion({
    path: { id },
    body: { promotionalPrice, expiresAt: new Date(expiresAt) },
  })
  if (response.error)
    throw new Error('Failed to set promotion')
  return response.data
}

export async function clearProductPromotion(id: string) {
  const response = await productsControllerClearPromotion({
    path: { id },
  })
  if (response.error)
    throw new Error('Failed to clear promotion')
  return response.data
}

export const deleteProductMutationOptions = {
  mutationFn: async (id: string) => {
    const response = await productsControllerSoftDelete({
      path: { id },
    })
    if (response.error)
      throw new Error('Failed to delete product')
    return response.data
  },
}
