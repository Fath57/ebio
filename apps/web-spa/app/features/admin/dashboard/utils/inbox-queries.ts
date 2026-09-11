import {
  staffInboxControllerMine,
  staffInboxControllerSendDigest,
} from '@boilerstone/openapi-generator/client/sdk.gen'

export type InboxQueueKey
  = | 'bannerRequests'
    | 'supplierValidations'
    | 'courierApplications'
    | 'withdrawals'
    | 'disputes'

export interface InboxQueue {
  key: InboxQueueKey
  count: number
}

/** Queues the signed-in staff member may act on, already filtered by the API. */
export interface StaffInbox {
  queues: InboxQueue[]
}

export interface DigestResult {
  sent: number
}

export const INBOX_QUERY_KEY = ['admin', 'inbox'] as const

export function fetchInboxQueryOptions() {
  return {
    queryKey: INBOX_QUERY_KEY,
    queryFn: async () => {
      const response = await staffInboxControllerMine()
      if (response.error)
        throw new Error('Failed to fetch staff inbox')
      return response.data as StaffInbox
    },
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  }
}

export const sendDigestMutationOptions = {
  mutationFn: async () => {
    const response = await staffInboxControllerSendDigest()
    if (response.error)
      throw new Error('Failed to send inbox digest')
    return response.data as DigestResult
  },
}
