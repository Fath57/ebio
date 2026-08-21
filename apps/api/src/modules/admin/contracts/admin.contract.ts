import { z } from 'zod'

export const validationActionEnum = z.enum([
  'VALIDATE',
  'REJECT',
  'REQUEST_COMPLEMENT',
]).meta({
  title: 'ValidationAction',
  description: 'Action to take on a supplier validation request',
})

export const reportTargetTypeEnum = z.enum([
  'PRODUCT',
  'REVIEW',
  'PUBLICATION',
  'MESSAGE',
]).meta({
  title: 'ReportTargetType',
  description: 'Type of content being reported',
})

export const reportStatusEnum = z.enum([
  'PENDING',
  'RESOLVED',
  'DISMISSED',
]).meta({
  title: 'ReportStatus',
  description: 'Current status of a content report',
})

export const disputeResolutionEnum = z.enum([
  'REFUND_BUYER',
  'PAY_SUPPLIER',
  'PARTIAL_REFUND',
]).meta({
  title: 'DisputeResolution',
  description: 'Resolution outcome for a dispute',
})

export const reportResolveActionEnum = z.enum([
  'DELETE_CONTENT',
  'WARN_AUTHOR',
  'DISMISS',
]).meta({
  title: 'ReportResolveAction',
  description: 'Action to take when resolving a content report',
})

export const dashboardKpiSchema = z.object({
  activeUsers: z.number().int(),
  activeSuppliers: z.number().int(),
  dailySearches: z.number().int(),
  monthlyTransactions: z.number().int(),
  platformRevenue: z.number(),
  pendingValidations: z.number().int(),
  openDisputes: z.number().int(),
}).meta({
  title: 'DashboardKpi',
  description: 'Key performance indicators for the admin dashboard',
})

export const validationQueueSchema = z.object({
  id: z.string().uuid(),
  shopName: z.string(),
  type: z.string(),
  phone: z.string().nullable(),
  submittedAt: z.string().datetime(),
  validationStatus: z.string(),
  productCount: z.number().int(),
  identityDocument: z.string().nullable(),
  businessProof: z.string().nullable(),
}).meta({
  title: 'ValidationQueueItem',
  description: 'Supplier in the validation queue',
})

export const validationQueueResponseSchema = z.object({
  items: z.array(validationQueueSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
}).meta({
  title: 'ValidationQueueResponse',
  description: 'Paginated validation queue',
})

export const validationActionSchema = z.object({
  action: validationActionEnum,
  message: z.string().optional(),
}).meta({
  title: 'ValidationActionInput',
  description: 'Action to perform on a supplier validation',
})

export const contentReportSchema = z.object({
  id: z.string().uuid(),
  targetType: reportTargetTypeEnum,
  targetId: z.string().uuid(),
  reporterName: z.string(),
  reason: z.string(),
  status: reportStatusEnum,
  createdAt: z.string().datetime(),
}).meta({
  title: 'ContentReport',
  description: 'A content report submitted by a user',
})

export const contentReportListSchema = z.object({
  items: z.array(contentReportSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
}).meta({
  title: 'ContentReportList',
  description: 'Paginated list of content reports',
})

export const resolveReportSchema = z.object({
  action: reportResolveActionEnum,
  adminNote: z.string().optional(),
}).meta({
  title: 'ResolveReportInput',
  description: 'Action to resolve a content report',
})

export const disputeResponseSchema = z.object({
  id: z.string().uuid(),
  orderNumber: z.string(),
  buyerName: z.string(),
  supplierName: z.string(),
  reason: z.string(),
  amount: z.number(),
  status: z.string(),
  createdAt: z.string().datetime(),
}).meta({
  title: 'DisputeResponse',
  description: 'A dispute in the admin view',
})

export const disputeListSchema = z.object({
  items: z.array(disputeResponseSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
}).meta({
  title: 'DisputeList',
  description: 'Paginated list of disputes',
})

export const disputeResolutionSchema = z.object({
  resolution: disputeResolutionEnum,
  partialAmount: z.number().optional(),
  adminNote: z.string().optional(),
}).meta({
  title: 'DisputeResolutionInput',
  description: 'Data to resolve a dispute',
})

export const broadcastNotificationSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  targetRole: z.enum(['BUYER', 'SUPPLIER', 'ALL']),
  targetZone: z.string().optional(),
  channel: z.enum(['PUSH', 'SMS', 'IN_APP']),
}).meta({
  title: 'BroadcastNotification',
  description: 'Send a notification to a group of users',
})

export const commissionRateSchema = z.object({
  rates: z.array(z.object({
    category: z.string(),
    rate: z.number().min(0).max(100),
  })),
}).meta({
  title: 'CommissionRates',
  description: 'Commission rates per product category',
})

export const suspendSupplierSchema = z.object({
  reason: z.string().min(1),
}).meta({
  title: 'SuspendSupplier',
  description: 'Reason for suspending a supplier',
})

export const transactionListSchema = z.object({
  items: z.array(z.object({
    id: z.string().uuid(),
    date: z.string().datetime(),
    orderNumber: z.string(),
    buyerName: z.string(),
    supplierName: z.string(),
    amount: z.number(),
    commission: z.number(),
    status: z.string(),
  })),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
}).meta({
  title: 'TransactionList',
  description: 'Paginated list of transactions',
})

export type DashboardKpi = z.infer<typeof dashboardKpiSchema>
export type ValidationQueueItem = z.infer<typeof validationQueueSchema>
export type ValidationQueueResponse = z.infer<typeof validationQueueResponseSchema>
export type ValidationActionInput = z.infer<typeof validationActionSchema>
export type ContentReportResponse = z.infer<typeof contentReportSchema>
export type ContentReportList = z.infer<typeof contentReportListSchema>
export type ResolveReportInput = z.infer<typeof resolveReportSchema>
export type DisputeResponse = z.infer<typeof disputeResponseSchema>
export type DisputeList = z.infer<typeof disputeListSchema>
export type DisputeResolutionInput = z.infer<typeof disputeResolutionSchema>
export type BroadcastNotification = z.infer<typeof broadcastNotificationSchema>
export type CommissionRates = z.infer<typeof commissionRateSchema>
export type SuspendSupplierInput = z.infer<typeof suspendSupplierSchema>
export type TransactionList = z.infer<typeof transactionListSchema>

export const adminOrderStatusSchema = z.object({
  status: z.enum(['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'IN_DELIVERY', 'DELIVERED', 'CANCELLED', 'DISPUTED']),
}).meta({
  title: 'AdminOrderStatus',
  description: 'Status forced by an admin, without the supplier-side transition rules',
})

export type AdminOrderStatusInput = z.infer<typeof adminOrderStatusSchema>
