import {
  adminControllerGetReports,
  adminControllerResolveReport,
} from '@boilerstone/openapi-generator/client/sdk.gen'

export interface ReportItem {
  id: string
  type: string
  contentPreview: string
  reportedByName: string
  authorName: string
  createdAt: string
}

export interface ReportsData {
  data: ReportItem[]
}

export function fetchReportsQueryOptions(type?: string) {
  return {
    queryKey: ['admin', 'moderation', 'reports', type],
    queryFn: async () => {
      const response = await adminControllerGetReports({
        query: { targetType: type ?? '', status: '', page: '1', limit: '50' },
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
