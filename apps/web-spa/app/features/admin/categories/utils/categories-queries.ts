import { client } from '@boilerstone/openapi-generator'
import {
  searchControllerGetCategories,
} from '@boilerstone/openapi-generator/client/sdk.gen'

export interface Category {
  id: string
  name: string
  slug: string
  imageUrl?: string | null
  sortOrder?: number
  productCount: number
}

interface CategoriesResponse {
  categories: Category[]
}

export function fetchCategoriesQueryOptions() {
  return {
    queryKey: ['admin', 'categories'],
    queryFn: async () => {
      const response = await searchControllerGetCategories()
      if (response.error)
        throw new Error('Failed to fetch categories')
      return response.data as CategoriesResponse
    },
  }
}

export function fetchCategoryByIdQueryOptions(categoryId: string) {
  return {
    queryKey: ['admin', 'categories', categoryId],
    queryFn: async () => {
      const response = await client.get({
        url: '/api/categories/{id}',
        path: { id: categoryId },
      })
      if (response.error)
        throw new Error('Failed to fetch category')
      return response.data as Category
    },
  }
}

export const createCategoryMutationOptions = {
  mutationFn: async (data: { name: string, slug: string, sortOrder: number, imageUrl?: string }) => {
    const response = await client.post({
      url: '/api/categories',
      body: data,
    })
    if (response.error)
      throw new Error('Failed to create category')
    return response.data
  },
}

export const updateCategoryMutationOptions = {
  mutationFn: async ({ id, ...data }: { id: string, name?: string, slug?: string, sortOrder?: number, imageUrl?: string }) => {
    const response = await client.patch({
      url: '/api/categories/{id}',
      path: { id },
      body: data,
    })
    if (response.error)
      throw new Error('Failed to update category')
    return response.data
  },
}

export const deleteCategoryMutationOptions = {
  mutationFn: async (id: string) => {
    const response = await client.delete({
      url: '/api/categories/{id}',
      path: { id },
    })
    if (response.error)
      throw new Error('Failed to delete category')
    return response.data
  },
}
