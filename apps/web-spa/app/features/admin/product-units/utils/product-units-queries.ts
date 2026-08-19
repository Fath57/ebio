import {
  productUnitsControllerCreate,
  productUnitsControllerFindActive,
  productUnitsControllerFindAll,
  productUnitsControllerFindById,
  productUnitsControllerRemove,
  productUnitsControllerUpdate,
} from '@boilerstone/openapi-generator/client/sdk.gen'

export interface ProductUnit {
  id: string
  code: string
  label: string
  shortLabel: string
  isActive: boolean
  sortOrder: number
  /** Products currently priced in this unit — a unit in use cannot be deleted. */
  productCount: number
}

export interface ProductUnitsPage {
  items: ProductUnit[]
  total: number
}

export interface ProductUnitInput {
  code: string
  label: string
  shortLabel: string
  isActive: boolean
  sortOrder: number
}

export function fetchProductUnitsQueryOptions() {
  return {
    queryKey: ['admin', 'product-units'],
    queryFn: async () => {
      const response = await productUnitsControllerFindAll()
      if (response.error)
        throw new Error('Failed to fetch product units')
      return response.data as ProductUnitsPage
    },
  }
}

/**
 * What the product form offers. Retired units are left out, so nobody prices a
 * new product in a unit the platform has stopped using.
 */
export function fetchActiveProductUnitsQueryOptions() {
  return {
    queryKey: ['product-units', 'active'],
    queryFn: async () => {
      const response = await productUnitsControllerFindActive()
      if (response.error)
        throw new Error('Failed to fetch product units')
      return response.data as ProductUnitsPage
    },
  }
}

export function fetchProductUnitQueryOptions(unitId: string) {
  return {
    queryKey: ['admin', 'product-units', unitId],
    queryFn: async () => {
      const response = await productUnitsControllerFindById({ path: { id: unitId } })
      if (response.error)
        throw new Error('Failed to fetch product unit')
      return response.data as ProductUnit
    },
  }
}

export const createProductUnitMutationOptions = {
  mutationFn: async (data: ProductUnitInput) => {
    const response = await productUnitsControllerCreate({ body: data })
    if (response.error)
      throw new Error(readError(response.error))
    return response.data as ProductUnit
  },
}

export const updateProductUnitMutationOptions = {
  mutationFn: async ({ id, ...data }: Partial<ProductUnitInput> & { id: string }) => {
    const response = await productUnitsControllerUpdate({ path: { id }, body: data })
    if (response.error)
      throw new Error(readError(response.error))
    return response.data as ProductUnit
  },
}

export const deleteProductUnitMutationOptions = {
  mutationFn: async (id: string) => {
    const response = await productUnitsControllerRemove({ path: { id } })
    if (response.error)
      throw new Error(readError(response.error))
    return response.data
  },
}

/**
 * The API explains refusals in French — a duplicate code, a unit still in use.
 * Dropping that message would leave the admin with a silent failure.
 */
function readError(error: unknown): string {
  const message = (error as { message?: unknown })?.message
  return typeof message === 'string' ? message : 'Une erreur est survenue'
}
