import {
  adminFamilyWalletsControllerDetail,
  adminFamilyWalletsControllerList,
  adminFamilyWalletsControllerResume,
  adminFamilyWalletsControllerResumeMember,
  adminFamilyWalletsControllerSuspend,
  adminFamilyWalletsControllerSuspendMember,
} from '@boilerstone/openapi-generator/client/sdk.gen'

export type FamilyWalletStatus = 'ACTIVE' | 'SUSPENDED' | 'CLOSED'
export type FamilyMemberStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REMOVED'

export interface FamilyLimits {
  /** FCFA per calendar month; null = no cap. */
  monthlyCap: number | null
  /** FCFA per order; null = no cap. */
  orderMax: number | null
  /** Allowed categories; null = every category. */
  categoryIds: string[] | null
}

export interface AdminFamilyWalletRow {
  id: string
  status: FamilyWalletStatus
  suspendedByAdmin: boolean
  balance: number
  /** Ledger wallet behind the family wallet (the generic wallet pages). */
  walletId: string
  payer: { id: string, name: string, phone: string | null, email: string }
  memberCount: number
  createdAt: string
  closedAt: string | null
}

export interface AdminFamilyMember {
  id: string
  nickname: string
  phone: string
  status: FamilyMemberStatus
  userId: string | null
  suspendedByAdmin: boolean
  effective: FamilyLimits
  spentThisMonth: number
  createdAt: string
}

export interface AdminFamilyTransaction {
  id: string
  type: string
  amount: number
  balanceAfter: number
  createdAt: string
  member?: { id: string, nickname: string }
  order?: { id: string, orderNumber: string, shopName: string }
}

export interface AdminFamilyWalletDetail extends AdminFamilyWalletRow {
  lowBalanceThreshold: number
  defaults: FamilyLimits
  members: AdminFamilyMember[]
  transactions: { items: AdminFamilyTransaction[], total: number }
}

interface AdminFamilyWalletsPage {
  items: AdminFamilyWalletRow[]
  total: number
  page: number
  limit: number
}

export interface AdminFamilyWalletFilters {
  status?: FamilyWalletStatus
  search?: string
  page: number
}

export const FAMILY_WALLETS_PAGE_SIZE = 20

const FAMILY_WALLETS_KEY = ['admin', 'family-wallets'] as const

export function familyWalletDetailQueryKey(id: string) {
  return [...FAMILY_WALLETS_KEY, 'detail', id] as const
}

/** The API sends some amounts as numeric strings: every one goes through Number(). */
function toLimits(raw: FamilyLimits): FamilyLimits {
  return {
    monthlyCap: raw.monthlyCap == null ? null : Number(raw.monthlyCap),
    orderMax: raw.orderMax == null ? null : Number(raw.orderMax),
    categoryIds: raw.categoryIds ?? null,
  }
}

function toRow(raw: AdminFamilyWalletRow): AdminFamilyWalletRow {
  return { ...raw, balance: Number(raw.balance), memberCount: Number(raw.memberCount) }
}

function toDetail(raw: AdminFamilyWalletDetail): AdminFamilyWalletDetail {
  return {
    ...toRow(raw),
    lowBalanceThreshold: Number(raw.lowBalanceThreshold),
    defaults: toLimits(raw.defaults),
    members: raw.members.map(member => ({
      ...member,
      effective: toLimits(member.effective),
      spentThisMonth: Number(member.spentThisMonth),
    })),
    transactions: {
      total: Number(raw.transactions.total),
      items: raw.transactions.items.map(item => ({
        ...item,
        amount: Number(item.amount),
        balanceAfter: Number(item.balanceAfter),
      })),
    },
  }
}

/** The API explains a refusal in French; that sentence is what the staff reads. */
function errorMessage(error: unknown, fallback: string): string {
  const message = (error as { message?: unknown } | undefined)?.message
  return typeof message === 'string' ? message : fallback
}

export function fetchFamilyWalletsQueryOptions(filters: AdminFamilyWalletFilters) {
  return {
    queryKey: [...FAMILY_WALLETS_KEY, 'list', filters],
    queryFn: async () => {
      const response = await adminFamilyWalletsControllerList({
        query: {
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.search ? { search: filters.search } : {}),
          page: filters.page,
          limit: FAMILY_WALLETS_PAGE_SIZE,
        },
      })
      if (response.error)
        throw new Error('Failed to load family wallets')
      const page = response.data as AdminFamilyWalletsPage
      return { ...page, total: Number(page.total), items: page.items.map(toRow) }
    },
  }
}

export function fetchFamilyWalletQueryOptions(id: string) {
  return {
    queryKey: familyWalletDetailQueryKey(id),
    queryFn: async () => {
      const response = await adminFamilyWalletsControllerDetail({ path: { id } })
      if (response.error)
        throw new Error('Failed to load family wallet')
      return toDetail(response.data as AdminFamilyWalletDetail)
    },
    enabled: Boolean(id),
  }
}

export type FamilyStatusAction
  = | { target: 'wallet', kind: 'suspend' | 'resume', id: string }
    | { target: 'member', kind: 'suspend' | 'resume', id: string }

/** Suspends or resumes the wallet or one member; every route answers with the fresh detail. */
export async function applyFamilyStatusAction(action: FamilyStatusAction, reason: string): Promise<AdminFamilyWalletDetail> {
  const path = { id: action.id }
  const note = reason ? { reason } : {}
  let response
  if (action.target === 'wallet') {
    response = action.kind === 'suspend'
      ? await adminFamilyWalletsControllerSuspend({ path, body: { reason } })
      : await adminFamilyWalletsControllerResume({ path, body: note })
  }
  else {
    response = action.kind === 'suspend'
      ? await adminFamilyWalletsControllerSuspendMember({ path, body: { reason } })
      : await adminFamilyWalletsControllerResumeMember({ path, body: note })
  }
  if (response.error)
    throw new Error(errorMessage(response.error, ''))
  return toDetail(response.data as AdminFamilyWalletDetail)
}
