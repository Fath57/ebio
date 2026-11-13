import type { SettlementStatus } from '../payments/utils/await-settlement'
import { useEffect, useState } from 'react'
import { apiFetch } from '../../utils/api-client'
import { formatXof } from '../common/hooks/use-money'
import { readVerifyOutcome } from '../payments/utils/await-settlement'

/** Family wallet client, hand-written against contracts/family-wallet.md §1-§5. */

export type FamilyWalletStatus = 'ACTIVE' | 'SUSPENDED' | 'CLOSED'
export type FamilyMemberStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED'
export type FamilyRefusalReason = 'INACTIVE' | 'CATEGORY' | 'ORDER_MAX' | 'MONTHLY_CAP' | 'INSUFFICIENT'

/** `null` on any field means « no limit » (or « every category »). */
export interface FamilyLimits {
  monthlyCap: number | null
  orderMax: number | null
  categoryIds: string[] | null
}

export interface FamilyMember {
  id: string
  nickname: string
  phone: string
  status: FamilyMemberStatus
  /** The member's own limits; a null field falls back to the defaults. */
  limits: FamilyLimits
  /** What actually applies: own limit, else default. */
  effective: FamilyLimits
  spentThisMonth: number
}

export interface FamilyWallet {
  id: string
  status: FamilyWalletStatus
  balance: number
  /** The balance in the payer's display currency; null when in FCFA. */
  display: { currency: string, balance: number } | null
  lowBalanceThreshold: number | null
  defaults: FamilyLimits
  members: FamilyMember[]
}

/** One option of the checkout preview (contract §5). */
export interface FamilyWalletOption {
  memberId: string
  payerFirstName: string
  spendable: number
  usable: boolean
  reason: FamilyRefusalReason | null
  blockedProductIds: string[]
}

export interface FamilyCategory {
  id: string
  name: string
}

export interface NewFamilyRelative {
  nickname: string
  name: string
  phone: string
  address: string | null
  latitude: number | null
  longitude: number | null
}

export type FamilyWriteResult<T> = { data: T, error: null } | { data: null, error: string }

export const FAMILY_TOPUP_MIN = 1000
export const FAMILY_TOPUP_MAX = 500000
export const FAMILY_TOPUP_PRESETS = [10000, 25000, 50000, 100000]

const NETWORK_ERROR = 'Erreur de connexion. Vérifiez votre réseau.'

export const FAMILY_ERROR_MESSAGES: Record<string, string> = {
  FAMILY_WALLET_EXISTS: 'Votre portefeuille famille est déjà ouvert.',
  FAMILY_MEMBER_EXISTS: 'Ce proche fait déjà partie de votre portefeuille famille.',
  FAMILY_MEMBER_IS_PAYER: 'Vous ne pouvez pas vous ajouter vous-même : indiquez le numéro de votre proche.',
  FAMILY_TOPUP_AMOUNT: `Le montant doit être compris entre ${formatXof(FAMILY_TOPUP_MIN)} et ${formatXof(FAMILY_TOPUP_MAX)}.`,
  INSUFFICIENT_BALANCE: 'Le solde de votre portefeuille eBio ne suffit pas pour ce virement.',
  FAMILY_WALLET_DISABLED: 'Le portefeuille famille n’est pas disponible pour le moment.',
  FAMILY_WALLET_WITH_RECIPIENT: 'Une commande pour un proche ne peut pas être payée avec un portefeuille famille.',
  RELATIVES_LIMIT_REACHED: 'Vous avez atteint la limite de 20 proches. Retirez-en un de votre carnet pour en ajouter un autre.',
}

/** Why a family wallet refused (or would refuse) an order, in plain French. */
export const FAMILY_REFUSAL_MESSAGES: Record<FamilyRefusalReason, string> = {
  INACTIVE: 'Portefeuille suspendu',
  CATEGORY: 'Certains produits ne sont pas autorisés',
  ORDER_MAX: 'Au-delà du maximum par commande',
  MONTHLY_CAP: 'Plafond du mois atteint',
  INSUFFICIENT: 'Solde insuffisant',
}

const REFUSAL_REASONS: FamilyRefusalReason[] = ['INACTIVE', 'CATEGORY', 'ORDER_MAX', 'MONTHLY_CAP', 'INSUFFICIENT']

export function parseRefusalReason(value: unknown): FamilyRefusalReason | null {
  return typeof value === 'string' && (REFUSAL_REASONS as string[]).includes(value)
    ? value as FamilyRefusalReason
    : null
}

/** The French message of a refused call body: a named code first, then the server's message. */
export function familyErrorMessage(body: Record<string, unknown> | null, fallback: string): string {
  const code = typeof body?.code === 'string' ? body.code : null
  if (code === 'FAMILY_WALLET_REFUSED') {
    const reason = parseRefusalReason(body?.reason)
    return reason
      ? `Le portefeuille famille ne peut pas payer cette commande : ${FAMILY_REFUSAL_MESSAGES[reason].toLowerCase()}.`
      : 'Le portefeuille famille ne peut pas payer cette commande.'
  }
  if (code && FAMILY_ERROR_MESSAGES[code])
    return FAMILY_ERROR_MESSAGES[code]
  return typeof body?.message === 'string' ? body.message : fallback
}

function readAmount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function parseLimits(raw: unknown): FamilyLimits {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    monthlyCap: readAmount(data.monthlyCap),
    orderMax: readAmount(data.orderMax),
    categoryIds: Array.isArray(data.categoryIds) ? data.categoryIds.map(String) : null,
  }
}

function parseMemberStatus(value: unknown): FamilyMemberStatus {
  return value === 'ACTIVE' || value === 'SUSPENDED' ? value : 'PENDING'
}

function parseMember(raw: Record<string, unknown>): FamilyMember {
  return {
    id: String(raw.id),
    nickname: typeof raw.nickname === 'string' ? raw.nickname : '',
    phone: typeof raw.phone === 'string' ? raw.phone : '',
    status: parseMemberStatus(raw.status),
    limits: parseLimits(raw.limits),
    effective: parseLimits(raw.effective),
    spentThisMonth: readAmount(raw.spentThisMonth) ?? 0,
  }
}

function parseWallet(raw: Record<string, unknown>): FamilyWallet {
  const display = raw.display as Record<string, unknown> | null | undefined
  const status = raw.status
  return {
    id: String(raw.id),
    status: status === 'SUSPENDED' || status === 'CLOSED' ? status : 'ACTIVE',
    balance: readAmount(raw.balance) ?? 0,
    display: display && typeof display.currency === 'string' && typeof display.balance === 'number'
      ? { currency: display.currency, balance: display.balance }
      : null,
    lowBalanceThreshold: readAmount(raw.lowBalanceThreshold),
    defaults: parseLimits(raw.defaults),
    members: Array.isArray(raw.members)
      ? (raw.members as Array<Record<string, unknown>>).map(parseMember)
      : [],
  }
}

/** Reads one preview option; `null` when malformed. */
export function parseFamilyWalletOption(raw: unknown): FamilyWalletOption | null {
  if (!raw || typeof raw !== 'object')
    return null
  const data = raw as Record<string, unknown>
  if (typeof data.memberId !== 'string')
    return null
  return {
    memberId: data.memberId,
    payerFirstName: typeof data.payerFirstName === 'string' ? data.payerFirstName : '',
    spendable: readAmount(data.spendable) ?? 0,
    usable: data.usable === true,
    reason: parseRefusalReason(data.reason),
    blockedProductIds: Array.isArray(data.blockedProductIds) ? data.blockedProductIds.map(String) : [],
  }
}

async function readBody(res: Response): Promise<Record<string, unknown> | null> {
  return await res.json().catch(() => null) as Record<string, unknown> | null
}

/**
 * Sends a write and turns the answer into data or a French error. A named
 * code wins; `byStatus` covers refusals the contract only gives a status for.
 */
async function write<T>(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body: unknown,
  parse: (raw: Record<string, unknown>) => T,
  fallback: string,
  byStatus: Record<number, string> = {},
): Promise<FamilyWriteResult<T>> {
  try {
    const res = await apiFetch(path, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const data = await readBody(res)
    if (!res.ok) {
      const code = typeof data?.code === 'string' ? data.code : null
      const known = code !== null && (code === 'FAMILY_WALLET_REFUSED' || Boolean(FAMILY_ERROR_MESSAGES[code]))
      return { data: null, error: !known && byStatus[res.status] ? byStatus[res.status] : familyErrorMessage(data, fallback) }
    }
    return { data: parse(data ?? {}), error: null }
  }
  catch {
    return { data: null, error: NETWORK_ERROR }
  }
}

/** The payer's family wallet; `null` when none is open yet (404). Throws on other failures. */
export async function fetchFamilyWallet(): Promise<FamilyWallet | null> {
  const res = await apiFetch('/api/family-wallet')
  if (res.status === 404)
    return null
  if (!res.ok)
    throw new Error(familyErrorMessage(await readBody(res), 'Impossible de charger votre portefeuille famille.'))
  return parseWallet(await res.json() as Record<string, unknown>)
}

export function openFamilyWallet(): Promise<FamilyWriteResult<FamilyWallet>> {
  return write('/api/family-wallet', 'POST', undefined, parseWallet, 'Impossible d’ouvrir le portefeuille famille.')
}

export function updateFamilyDefaults(
  defaults: FamilyLimits,
  lowBalanceThreshold?: number | null,
): Promise<FamilyWriteResult<true>> {
  return write(
    '/api/family-wallet',
    'PATCH',
    { defaults, ...(lowBalanceThreshold === undefined ? {} : { lowBalanceThreshold }) },
    () => true as const,
    'Impossible d’enregistrer les limites.',
  )
}

/** Adds a member, either from the address book or as a new relative. */
export function addFamilyMember(
  input: { savedRelativeId: string } | { relative: NewFamilyRelative },
): Promise<FamilyWriteResult<FamilyMember>> {
  return write('/api/family-wallet/members', 'POST', input, parseMember, 'Impossible d’ajouter ce proche.')
}

/** A null field brings the member back to the default limit. */
export function updateMemberLimits(memberId: string, limits: FamilyLimits): Promise<FamilyWriteResult<true>> {
  return write(
    `/api/family-wallet/members/${memberId}`,
    'PATCH',
    { limits },
    () => true as const,
    'Impossible d’enregistrer les limites de ce proche.',
  )
}

export interface FamilyTopupStart {
  topupId: string
  paymentUrl: string | null
  providerTransactionId: string | null
}

export function startFamilyTopup(amount: number): Promise<FamilyWriteResult<FamilyTopupStart>> {
  return write('/api/family-wallet/topups', 'POST', { amount }, raw => ({
    topupId: String(raw.topupId),
    paymentUrl: typeof raw.paymentUrl === 'string' ? raw.paymentUrl : null,
    providerTransactionId: typeof raw.providerTransactionId === 'string' ? raw.providerTransactionId : null,
  }), 'Impossible de démarrer la recharge.')
}

/** One verify call: the server re-reads the provider before answering. */
export async function verifyFamilyTopup(topupId: string, reference: string): Promise<SettlementStatus> {
  const res = await apiFetch(`/api/family-wallet/topups/${topupId}/verify`, {
    method: 'POST',
    body: JSON.stringify({ fedapayTransactionId: reference }),
  })
  return readVerifyOutcome(res)
}

/** Moves money from the payer's personal eBio wallet. */
export function transferToFamilyWallet(amount: number): Promise<FamilyWriteResult<true>> {
  return write(
    '/api/family-wallet/transfer',
    'POST',
    { amount },
    () => true as const,
    'Impossible d’effectuer le virement.',
  )
}

/** The payer's personal wallet balance, for the transfer tab; null when unknown. */
export async function fetchPersonalBalance(): Promise<number | null> {
  try {
    const res = await apiFetch('/api/wallet/me?page=1&limit=1')
    if (!res.ok)
      return null
    const data = await res.json() as Record<string, unknown>
    return readAmount(data.balance)
  }
  catch {
    return null
  }
}

/** Product categories, as the catalog search lists them. */
export async function fetchFamilyCategories(): Promise<FamilyCategory[]> {
  const res = await apiFetch('/api/search/categories')
  if (!res.ok)
    throw new Error('Impossible de charger les catégories.')
  const data = await res.json() as Record<string, unknown>
  const raw = Array.isArray(data.categories) ? data.categories as Array<Record<string, unknown>> : []
  return raw
    .filter(cat => typeof cat.id === 'string' && typeof cat.name === 'string')
    .map(cat => ({ id: String(cat.id), name: String(cat.name) }))
}

let enabledCache: boolean | null = null

/**
 * Whether the family wallet is switched on (`familyWalletEnabled` in the
 * public settings). Absent or unreadable means off: every entry point hides.
 */
export function useFamilyWalletEnabled(): boolean {
  const [enabled, setEnabled] = useState(enabledCache ?? false)

  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      try {
        const res = await apiFetch('/api/settings/public')
        if (!res.ok || cancelled)
          return
        const data = await res.json() as Record<string, unknown>
        enabledCache = data.familyWalletEnabled === true
        setEnabled(enabledCache)
      }
      catch {
        // keep the last known value
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return enabled
}

// ---------------------------------------------------------------------------
// Control (contract §1-§2): suspend, resume, remove, close, invite again.

const MEMBER_NOT_PENDING = 'Ce proche n’est plus en attente : il a déjà rejoint votre portefeuille famille.'
const INVITE_TOO_SOON = 'Une invitation a déjà été envoyée à ce numéro il y a moins de 24 heures. Vous pourrez la renvoyer demain.'
const BLOCKED_BY_EBIO = 'Votre portefeuille famille a été suspendu par eBio. Contactez le support pour le réactiver.'

export function suspendFamilyMember(memberId: string): Promise<FamilyWriteResult<true>> {
  return write(`/api/family-wallet/members/${memberId}/suspend`, 'POST', undefined, () => true as const, 'Impossible de suspendre ce proche.')
}

export function resumeFamilyMember(memberId: string): Promise<FamilyWriteResult<true>> {
  return write(`/api/family-wallet/members/${memberId}/resume`, 'POST', undefined, () => true as const, 'Impossible de réactiver ce proche.')
}

/** Removes the member (204): past purchases stay in the history, the relative stays in the address book. */
export function removeFamilyMember(memberId: string): Promise<FamilyWriteResult<true>> {
  return write(`/api/family-wallet/members/${memberId}`, 'DELETE', undefined, () => true as const, 'Impossible de retirer ce proche.')
}

/** Sends the invitation SMS again: pending members only, once per 24 hours. */
export function inviteFamilyMember(memberId: string): Promise<FamilyWriteResult<true>> {
  return write(
    `/api/family-wallet/members/${memberId}/invite`,
    'POST',
    undefined,
    () => true as const,
    'Impossible de renvoyer l’invitation.',
    { 400: MEMBER_NOT_PENDING, 409: MEMBER_NOT_PENDING, 429: INVITE_TOO_SOON },
  )
}

export function suspendFamilyWallet(): Promise<FamilyWriteResult<true>> {
  return write('/api/family-wallet/suspend', 'POST', undefined, () => true as const, 'Impossible de suspendre le portefeuille famille.')
}

export function resumeFamilyWallet(): Promise<FamilyWriteResult<true>> {
  return write(
    '/api/family-wallet/resume',
    'POST',
    undefined,
    () => true as const,
    'Impossible de réactiver le portefeuille famille.',
    { 403: BLOCKED_BY_EBIO },
  )
}

/** Closes the wallet; what was left goes back to the payer's personal eBio wallet. */
/** What closing moved back to the payer's personal wallet. */
export interface FamilyClosure {
  refunded: number
  personalBalance: number
}

function parseClosure(raw: Record<string, unknown>): FamilyClosure {
  return { refunded: readAmount(raw.refunded) ?? 0, personalBalance: readAmount(raw.personalBalance) ?? 0 }
}

export function closeFamilyWallet(): Promise<FamilyWriteResult<FamilyClosure>> {
  return write('/api/family-wallet/close', 'POST', undefined, parseClosure, 'Impossible de fermer le portefeuille famille.')
}

// ---------------------------------------------------------------------------
// History (contract §3) and the member's view (contract §4).

export type FamilyTransactionType = 'TOPUP' | 'ORDER_PAYMENT' | 'REFUND' | 'FAMILY_TRANSFER_IN' | 'FAMILY_CLOSURE_OUT'

export interface FamilyOrderLine {
  name: string
  quantity: number
  imageUrl: string | null
}

export interface FamilyTransaction {
  id: string
  type: FamilyTransactionType
  /** Signed, in FCFA: positive credits the wallet. */
  amount: number
  /** Null on the member's view, which never shows the wallet balance. */
  balanceAfter: number | null
  createdAt: string
  member: { id: string, nickname: string } | null
  order: { id: string, orderNumber: string, shopName: string, lines: FamilyOrderLine[] } | null
}

export interface FamilyTransactionPage {
  items: FamilyTransaction[]
  total: number
}

/** One family wallet the current user can spend from, as a member. */
export interface MemberFamilyWallet {
  memberId: string
  payerFirstName: string
  /** Combined status of the wallet and of the membership. */
  status: FamilyMemberStatus
  spendable: number
  limits: { monthlyCap: number | null, orderMax: number | null, categoryNames: string[] | null }
  spentThisMonth: number
}

const TRANSACTION_TYPES: FamilyTransactionType[] = ['TOPUP', 'ORDER_PAYMENT', 'REFUND', 'FAMILY_TRANSFER_IN', 'FAMILY_CLOSURE_OUT']

function parseOrderLine(raw: Record<string, unknown>): FamilyOrderLine {
  return {
    name: typeof raw.name === 'string' ? raw.name : '',
    quantity: readAmount(raw.quantity) ?? 1,
    imageUrl: typeof raw.imageUrl === 'string' && raw.imageUrl.length > 0 ? raw.imageUrl : null,
  }
}

function parseTransaction(raw: Record<string, unknown>): FamilyTransaction | null {
  const type = TRANSACTION_TYPES.find(known => known === raw.type)
  if (!type || raw.id === undefined)
    return null
  const member = raw.member as Record<string, unknown> | null | undefined
  const order = raw.order as Record<string, unknown> | null | undefined
  return {
    id: String(raw.id),
    type,
    amount: readAmount(raw.amount) ?? 0,
    balanceAfter: readAmount(raw.balanceAfter),
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
    member: member && typeof member.id === 'string'
      ? { id: member.id, nickname: typeof member.nickname === 'string' ? member.nickname : '' }
      : null,
    order: order && typeof order.id === 'string'
      ? {
          id: order.id,
          orderNumber: typeof order.orderNumber === 'string' ? order.orderNumber : '',
          shopName: typeof order.shopName === 'string' ? order.shopName : '',
          lines: Array.isArray(order.lines)
            ? (order.lines as Array<Record<string, unknown>>).map(parseOrderLine)
            : [],
        }
      : null,
  }
}

async function readTransactionPage(path: string): Promise<FamilyTransactionPage> {
  const res = await apiFetch(path)
  if (!res.ok)
    throw new Error(familyErrorMessage(await readBody(res), 'Impossible de charger l’historique.'))
  const data = await res.json() as Record<string, unknown>
  const items = Array.isArray(data.items)
    ? (data.items as Array<Record<string, unknown>>)
        .map(parseTransaction)
        .filter((item): item is FamilyTransaction => item !== null)
    : []
  return { items, total: readAmount(data.total) ?? items.length }
}

/** The payer's history, optionally narrowed to one member. */
export function fetchFamilyTransactions(page: number, limit: number, memberId: string | null): Promise<FamilyTransactionPage> {
  const filter = memberId ? `&memberId=${encodeURIComponent(memberId)}` : ''
  return readTransactionPage(`/api/family-wallet/transactions?page=${page}&limit=${limit}${filter}`)
}

/** A member's own purchases on one family wallet; never the balance. */
export async function fetchMyFamilyPurchases(memberId: string, page: number, limit: number): Promise<FamilyTransactionPage> {
  const result = await readTransactionPage(`/api/family-wallets/mine/${memberId}/transactions?page=${page}&limit=${limit}`)
  return { ...result, items: result.items.map(item => ({ ...item, balanceAfter: null })) }
}

function parseMemberWallet(raw: Record<string, unknown>): MemberFamilyWallet | null {
  if (typeof raw.memberId !== 'string')
    return null
  const limits = (raw.limits && typeof raw.limits === 'object' ? raw.limits : {}) as Record<string, unknown>
  return {
    memberId: raw.memberId,
    payerFirstName: typeof raw.payerFirstName === 'string' ? raw.payerFirstName : '',
    status: parseMemberStatus(raw.status),
    spendable: readAmount(raw.spendable) ?? 0,
    limits: {
      monthlyCap: readAmount(limits.monthlyCap),
      orderMax: readAmount(limits.orderMax),
      categoryNames: Array.isArray(limits.categoryNames) ? limits.categoryNames.map(String) : null,
    },
    spentThisMonth: readAmount(raw.spentThisMonth) ?? 0,
  }
}

/** The family wallets the current user is a member of; empty on any failure. */
export async function fetchMyFamilyWallets(): Promise<MemberFamilyWallet[]> {
  try {
    const res = await apiFetch('/api/family-wallets/mine')
    if (!res.ok)
      return []
    const data = await res.json() as unknown
    return Array.isArray(data)
      ? (data as Array<Record<string, unknown>>)
          .map(parseMemberWallet)
          .filter((wallet): wallet is MemberFamilyWallet => wallet !== null)
      : []
  }
  catch {
    return []
  }
}
