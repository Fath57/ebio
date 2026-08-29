import {
  adminCouriersControllerApprove,
  adminCouriersControllerGetById,
  adminCouriersControllerList,
  adminCouriersControllerReactivate,
  adminCouriersControllerReject,
  adminCouriersControllerSuspend,
} from '@boilerstone/openapi-generator/client/sdk.gen'

export interface AdminCourierItem {
  id: string
  userId: string
  fullName: string
  phone: string
  vehicleType: 'MOTO' | 'BICYCLE' | 'CAR' | 'ON_FOOT'
  zone: string
  identityDocument: string | null
  validationStatus: string
  rejectionReason: string | null
  isAvailable: boolean
  validatedAt: string | null
  createdAt: string
}

export interface AdminCourierDetail extends AdminCourierItem {
  /** Short-lived signed URL of the identity document (null when missing). */
  identityDocumentUrl: string | null
  identityDocumentMimeType: string | null
  identityDocumentName: string | null
  stats: {
    delivered: number
    failed: number
    active: number
  }
  /**
   * Courier wallet, in FCFA. Negative = the courier owes eBio its commission
   * on cash deliveries; positive = eBio owes the courier. Null until the first
   * delivery creates it.
   */
  wallet: {
    id: string
    balance: number
  } | null
}

export interface AdminCouriersData {
  couriers: AdminCourierItem[]
  total: number
}

export function fetchAdminCouriersQueryOptions(params: { status?: string, page?: number }) {
  return {
    queryKey: ['admin', 'couriers', params.status ?? 'ALL', params.page ?? 1],
    queryFn: async () => {
      // The generated types mark every query param as required; an empty
      // status is simply ignored server-side (invalid enum value).
      const response = await adminCouriersControllerList({
        query: {
          status: params.status ?? '',
          page: String(params.page ?? 1),
          limit: '20',
        },
      })
      if (response.error)
        throw new Error('Failed to fetch couriers')
      return response.data as unknown as AdminCouriersData
    },
  }
}

export function fetchAdminCourierQueryOptions(courierId: string) {
  return {
    queryKey: ['admin', 'couriers', 'detail', courierId],
    queryFn: async () => {
      const response = await adminCouriersControllerGetById({ path: { id: courierId } })
      if (response.error)
        throw new Error('Failed to fetch courier')
      return response.data as unknown as AdminCourierDetail
    },
  }
}

export const approveCourierMutationOptions = {
  mutationFn: async (courierId: string) => {
    const response = await adminCouriersControllerApprove({ path: { id: courierId } })
    if (response.error)
      throw new Error('Failed to approve courier')
    return response.data
  },
}

export const rejectCourierMutationOptions = {
  mutationFn: async ({ courierId, reason }: { courierId: string, reason: string }) => {
    const response = await adminCouriersControllerReject({
      path: { id: courierId },
      body: { reason },
    })
    if (response.error)
      throw new Error('Failed to reject courier')
    return response.data
  },
}

export const suspendCourierMutationOptions = {
  mutationFn: async (courierId: string) => {
    const response = await adminCouriersControllerSuspend({ path: { id: courierId } })
    if (response.error)
      throw new Error('Failed to suspend courier')
    return response.data
  },
}

export const reactivateCourierMutationOptions = {
  mutationFn: async (courierId: string) => {
    const response = await adminCouriersControllerReactivate({ path: { id: courierId } })
    if (response.error)
      throw new Error('Failed to reactivate courier')
    return response.data
  },
}
