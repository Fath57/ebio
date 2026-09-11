import {
  adminBannerRequestsControllerApprove,
  adminBannerRequestsControllerList,
  adminBannerRequestsControllerReject,
} from '@boilerstone/openapi-generator/client/sdk.gen'

export const BANNER_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const

export type BannerRequestStatus = (typeof BANNER_REQUEST_STATUSES)[number]

export type BannerRequestTargetType = 'SUPPLIER' | 'PRODUCT'

/** The live banner created on approval, with its diffusion window and counters. */
export interface BannerRequestBanner {
  id: string
  startsAt: string | null
  endsAt: string | null
  isActive: boolean
  impressions: number
  clicks: number
}

export interface BannerRequest {
  id: string
  supplierId: string
  supplierName: string
  title: string
  subtitle: string | null
  imageUrl: string
  targetType: BannerRequestTargetType
  targetId: string
  targetLabel: string | null
  durationDays: number
  /** Amount paid by the shop, in FCFA. */
  price: number
  requestedStartAt: string | null
  status: BannerRequestStatus
  rejectionReason: string | null
  banner: BannerRequestBanner | null
  paidAt: string | null
  refundedAt: string | null
  reviewedAt: string | null
  createdAt: string
}

export interface ApproveBannerRequestInput {
  /** ISO start of the diffusion; omitted = requested start or now. */
  startsAt?: string
  position?: number
}

export function fetchBannerRequestsQueryOptions(status: BannerRequestStatus) {
  return {
    queryKey: ['admin', 'banner-requests', status],
    queryFn: async () => {
      const response = await adminBannerRequestsControllerList({ query: { status } })
      if (response.error)
        throw new Error('Failed to fetch banner requests')
      return response.data as BannerRequest[]
    },
  }
}

export async function approveBannerRequest(
  requestId: string,
  input: ApproveBannerRequestInput,
): Promise<BannerRequest> {
  const response = await adminBannerRequestsControllerApprove({
    path: { id: requestId },
    body: {
      // The generated contract types the field as Date; JSON serialises it as ISO.
      startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
      position: input.position,
    },
  })
  if (response.error)
    throw new Error('Failed to approve banner request')
  return response.data as BannerRequest
}

export async function rejectBannerRequest(requestId: string, reason: string): Promise<BannerRequest> {
  const response = await adminBannerRequestsControllerReject({
    path: { id: requestId },
    body: { reason },
  })
  if (response.error)
    throw new Error('Failed to reject banner request')
  return response.data as BannerRequest
}
