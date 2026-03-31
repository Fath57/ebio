import {
  adminControllerGetValidations,
  adminControllerValidateSupplier,
} from '@boilerstone/openapi-generator/client/sdk.gen'

export interface SupplierValidationItem {
  id: string
  fullName: string
  email: string | null
  phone: string | null
  shopName: string
  type: string
  address: string | null
  submittedAt: string
  validationStatus: string
  productCount: number
  identityDocumentUrl: string | null
  businessProofUrl: string | null
  profilePhoto: string | null
}

export interface ValidationsData {
  items: SupplierValidationItem[]
  total: number
  page: number
  limit: number
}

export function fetchPendingSuppliersQueryOptions() {
  return {
    queryKey: ['admin', 'validation', 'pending'],
    queryFn: async () => {
      const response = await adminControllerGetValidations({
        query: { status: 'pending', page: '1', limit: '50' },
      })
      if (response.error)
        throw new Error('Failed to fetch pending suppliers')
      return response.data as ValidationsData
    },
  }
}

export function fetchSupplierByIdQueryOptions(supplierId: string) {
  return {
    queryKey: ['admin', 'validation', supplierId],
    queryFn: async () => {
      const response = await adminControllerGetValidations({
        query: { page: '1', limit: '50' },
      })
      if (response.error)
        throw new Error('Failed to fetch suppliers')
      const data = response.data as ValidationsData
      const supplier = data?.items?.find(s => s.id === supplierId)
      if (!supplier)
        throw new Error('Supplier not found')
      return supplier
    },
  }
}

export const validateSupplierMutationOptions = {
  mutationFn: async (supplierId: string) => {
    const response = await adminControllerValidateSupplier({
      path: { supplierId },
      body: { action: 'VALIDATE' },
    })
    if (response.error)
      throw new Error('Failed to validate supplier')
    return response.data
  },
}

export const rejectSupplierMutationOptions = {
  mutationFn: async ({ supplierId, reason }: { supplierId: string, reason: string }) => {
    const response = await adminControllerValidateSupplier({
      path: { supplierId },
      body: { action: 'REJECT', message: reason },
    })
    if (response.error)
      throw new Error('Failed to reject supplier')
    return response.data
  },
}

export const requestComplementMutationOptions = {
  mutationFn: async ({ supplierId, message }: { supplierId: string, message: string }) => {
    const response = await adminControllerValidateSupplier({
      path: { supplierId },
      body: { action: 'REQUEST_COMPLEMENT', message },
    })
    if (response.error)
      throw new Error('Failed to request complement')
    return response.data
  },
}
