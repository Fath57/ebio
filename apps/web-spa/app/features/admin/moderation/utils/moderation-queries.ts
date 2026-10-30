import {
  adminControllerGetReports,
  adminControllerResolveReport,
} from '@boilerstone/openapi-generator/client/sdk.gen'

export interface ReportItem {
  id: string
  /** PRODUCT | REVIEW | PRODUCT_REVIEW | PUBLICATION | MESSAGE */
  targetType: string
  targetId: string
  reporterName: string
  reason: string
  /** PENDING | RESOLVED | DISMISSED */
  status: string
  createdAt: string
}

export interface ReportsData {
  items: ReportItem[]
  total: number
  page: number
  limit: number
  /** Rows per status under the other filters, for the tabs. */
  statusCounts: Record<string, number>
}

export const REPORT_TARGET_TYPES = ['PRODUCT', 'REVIEW', 'PRODUCT_REVIEW', 'PUBLICATION', 'MESSAGE']
export const REPORT_STATUSES = ['PENDING', 'RESOLVED', 'DISMISSED']
export const REPORTS_PAGE_SIZE = 20

export function fetchReportsQueryOptions(filters: { type?: string, status?: string, page?: number }) {
  return {
    queryKey: ['admin', 'moderation', 'reports', filters],
    queryFn: async () => {
      const response = await adminControllerGetReports({
        query: {
          targetType: filters.type ?? '',
          status: filters.status ?? '',
          page: String(filters.page ?? 1),
          limit: String(REPORTS_PAGE_SIZE),
        },
      })
      if (response.error)
        throw new Error('Failed to fetch reports')
      return response.data as ReportsData
    },
  }
}

export const deleteContentMutationOptions = {
  mutationFn: async (reportId: string) => {
    const response = await adminControllerResolveReport({
      path: { id: reportId },
      body: { action: 'DELETE_CONTENT' },
    })
    if (response.error)
      throw new Error('Failed to delete content')
    return response.data
  },
}

export const warnAuthorMutationOptions = {
  mutationFn: async (reportId: string) => {
    const response = await adminControllerResolveReport({
      path: { id: reportId },
      body: { action: 'WARN_AUTHOR' },
    })
    if (response.error)
      throw new Error('Failed to warn author')
    return response.data
  },
}

export const ignoreReportMutationOptions = {
  mutationFn: async (reportId: string) => {
    const response = await adminControllerResolveReport({
      path: { id: reportId },
      body: { action: 'DISMISS' },
    })
    if (response.error)
      throw new Error('Failed to ignore report')
    return response.data
  },
}
