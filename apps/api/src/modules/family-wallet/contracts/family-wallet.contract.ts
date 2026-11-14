import { z } from 'zod'
import { displayCurrencyEnum } from '../../currency/contracts/currency.contract'
import { createRelativeSchema } from '../../relatives/contracts/relative.contract'

/** Bounds of a top-up, by card or from the personal wallet (FR-010). */
export const FAMILY_TOPUP_MIN = 1_000
export const FAMILY_TOPUP_MAX = 500_000

/** Far above any real household, low enough to catch a typo. */
const LIMIT_CEILING = 10_000_000

export const familyWalletStatusEnum = z.enum(['ACTIVE', 'SUSPENDED', 'CLOSED']).meta({
  title: 'FamilyWalletStatus',
  description: 'Statut du portefeuille famille',
})

export const familyMemberStatusEnum = z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'REMOVED']).meta({
  title: 'FamilyMemberStatus',
  description: 'Statut d\'un membre : en attente, actif, suspendu, retiré',
})

export const familyRefusalReasonEnum = z.enum(['INACTIVE', 'CATEGORY', 'ORDER_MAX', 'MONTHLY_CAP', 'INSUFFICIENT']).meta({
  title: 'FamilyRefusalReason',
  description: 'Pourquoi le portefeuille famille ne peut pas payer ce panier',
})

const limitAmount = z.number().int().positive('Une limite doit être supérieure à zéro').max(LIMIT_CEILING).nullable()

/** Each limit is optional: null means no limit, or every category. */
export const familyLimitsSchema = z.object({
  /** FCFA per member and per calendar month (Benin time). */
  monthlyCap: limitAmount,
  /** FCFA per order. */
  orderMax: limitAmount,
  /** Allowed categories; an empty list is refused, null means all of them. */
  categoryIds: z.array(z.string().uuid()).min(1, 'Choisissez au moins une catégorie, ou toutes').max(100).nullable(),
}).meta({
  title: 'FamilyLimits',
  description: 'Limites de dépense : plafond mensuel, maximum par commande, catégories autorisées',
})

// ===== §1 PAYER, WALLET =====

export const updateFamilyWalletSchema = z.object({
  /** Only the limits sent change; null removes one. */
  defaults: familyLimitsSchema.partial().optional(),
  /** Below this balance the payer is alerted (FR-026). */
  lowBalanceThreshold: z.number().int().min(0).max(LIMIT_CEILING).optional(),
}).meta({
  title: 'UpdateFamilyWallet',
  description: 'Limites par défaut et seuil d\'alerte du portefeuille famille',
})

export const familyMemberResponseSchema = z.object({
  id: z.string().uuid(),
  nickname: z.string(),
  phone: z.string(),
  status: familyMemberStatusEnum,
  /** The member's own limits; null means « as the default ». */
  limits: familyLimitsSchema,
  /** What actually applies: own limit, else default. */
  effective: familyLimitsSchema,
  /** FCFA spent since the 1st of the month (Benin time), refunds deducted. */
  spentThisMonth: z.number(),
}).meta({
  title: 'FamilyMember',
  description: 'Un proche membre du portefeuille famille, vu par le payeur',
})

export const familyWalletResponseSchema = z.object({
  id: z.string().uuid(),
  status: familyWalletStatusEnum,
  /** FCFA. */
  balance: z.number(),
  /** The balance in the payer's display currency; null in FCFA or without a rate. */
  display: z.object({
    currency: displayCurrencyEnum,
    balance: z.number(),
  }).nullable(),
  lowBalanceThreshold: z.number(),
  defaults: familyLimitsSchema,
  members: z.array(familyMemberResponseSchema),
}).meta({
  title: 'FamilyWallet',
  description: 'Le portefeuille famille du payeur : solde, limites par défaut, membres',
})

// ===== §2 PAYER, MEMBERS =====

/** From the address book, or a new relative (also saved in the address book). */
export const addFamilyMemberSchema = z.object({
  savedRelativeId: z.string().uuid().optional(),
  relative: createRelativeSchema.optional(),
}).refine(value => (value.savedRelativeId === undefined) !== (value.relative === undefined), {
  message: 'Choisissez un proche de votre carnet, ou créez-en un nouveau',
  path: ['savedRelativeId'],
}).meta({
  title: 'AddFamilyMember',
  description: 'Ajouter un proche au portefeuille famille, depuis le carnet ou en le créant',
})

export const updateFamilyMemberSchema = z.object({
  /** Only the limits sent change; null goes back to the default. */
  limits: familyLimitsSchema.partial(),
}).meta({
  title: 'UpdateFamilyMember',
  description: 'Limites propres d\'un membre',
})

// ===== §3 PAYER, MONEY =====

/** Bounds are checked by the service, to answer with FAMILY_TOPUP_AMOUNT. */
export const familyAmountSchema = z.object({
  amount: z.number().int().positive(),
}).meta({
  title: 'FamilyAmount',
  description: `Montant en FCFA, de ${FAMILY_TOPUP_MIN} à ${FAMILY_TOPUP_MAX}`,
})

export const familyTopupResponseSchema = z.object({
  topupId: z.string().uuid(),
  amount: z.number(),
  /** The provider's hosted page, when it gives one; the app opens it. */
  paymentUrl: z.string().nullable(),
  providerTransactionId: z.string().nullable(),
}).meta({
  title: 'FamilyTopup',
  description: 'Recharge du portefeuille famille ouverte chez le prestataire',
})

export const familyTransferResponseSchema = z.object({
  /** Family wallet balance after the transfer. */
  balance: z.number(),
  /** Personal wallet balance after the transfer. */
  personalBalance: z.number(),
}).meta({
  title: 'FamilyTransfer',
  description: 'Soldes après un virement du portefeuille personnel vers le portefeuille famille',
})

export const familyTransactionSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  amount: z.number(),
  balanceAfter: z.number(),
  createdAt: z.string().datetime(),
  member: z.object({ id: z.string().uuid(), nickname: z.string() }).optional(),
  order: z.object({
    id: z.string().uuid(),
    orderNumber: z.string(),
    shopName: z.string(),
    lines: z.array(z.object({
      name: z.string(),
      quantity: z.number(),
      imageUrl: z.string().nullable(),
    })),
  }).optional(),
}).meta({
  title: 'FamilyTransaction',
  description: 'Une opération du portefeuille famille ; jamais d\'adresse ni de message',
})

export const familyTransactionListSchema = z.object({
  items: z.array(familyTransactionSchema),
  total: z.number().int(),
}).meta({ title: 'FamilyTransactionList' })

// ===== §4 MEMBER =====

export const memberFamilyWalletSchema = z.object({
  memberId: z.string().uuid(),
  payerFirstName: z.string(),
  /** Wallet and member combined: ACTIVE only when both are. */
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  spendable: z.number(),
  limits: z.object({
    monthlyCap: z.number().nullable(),
    orderMax: z.number().nullable(),
    categoryNames: z.array(z.string()).nullable(),
  }),
  spentThisMonth: z.number(),
}).meta({
  title: 'MemberFamilyWallet',
  description: 'Un portefeuille famille vu par le membre ; jamais le solde total',
})

// ===== §5 CHECKOUT =====

export const familyWalletOptionSchema = z.object({
  memberId: z.string().uuid(),
  payerFirstName: z.string(),
  spendable: z.number(),
  usable: z.boolean(),
  reason: familyRefusalReasonEnum.nullable(),
  /** Only for CATEGORY. */
  blockedProductIds: z.array(z.string().uuid()).optional(),
}).meta({
  title: 'FamilyWalletOption',
  description: 'Un portefeuille famille proposé au passage en caisse',
})

export type FamilyLimitsInput = z.infer<typeof familyLimitsSchema>
export type UpdateFamilyWallet = z.infer<typeof updateFamilyWalletSchema>
export type FamilyWalletResponse = z.infer<typeof familyWalletResponseSchema>
export type FamilyMemberResponse = z.infer<typeof familyMemberResponseSchema>
export type AddFamilyMember = z.infer<typeof addFamilyMemberSchema>
export type UpdateFamilyMember = z.infer<typeof updateFamilyMemberSchema>
export type FamilyAmount = z.infer<typeof familyAmountSchema>
export type FamilyTopupResponse = z.infer<typeof familyTopupResponseSchema>
export type FamilyTransferResponse = z.infer<typeof familyTransferResponseSchema>
export type FamilyTransaction = z.infer<typeof familyTransactionSchema>
export type MemberFamilyWallet = z.infer<typeof memberFamilyWalletSchema>
export type FamilyWalletOption = z.infer<typeof familyWalletOptionSchema>

// ===== §3 HISTORY QUERY, §4 MEMBER HISTORY =====

export const familyTransactionsQuerySchema = z.object({
  /** One member exactly; every line of the wallet otherwise. */
  memberId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).meta({ title: 'FamilyTransactionsQuery' })

/** A member's own purchase or refund: no balance after it, which would give the total away (FR-025). */
export const memberFamilyTransactionSchema = familyTransactionSchema.omit({ balanceAfter: true, member: true }).meta({
  title: 'MemberFamilyTransaction',
  description: 'Un achat ou un remboursement du membre ; jamais le solde du portefeuille',
})

export const memberFamilyTransactionListSchema = z.object({
  items: z.array(memberFamilyTransactionSchema),
  total: z.number().int(),
}).meta({ title: 'MemberFamilyTransactionList' })

// ===== §1 PAYER, CLOSURE =====

export const familyClosureResponseSchema = z.object({
  /** FCFA credited to the payer's personal wallet; 0 when it was already closed or empty. */
  refunded: z.number(),
  /** Personal wallet balance afterwards. */
  personalBalance: z.number(),
}).meta({
  title: 'FamilyClosure',
  description: 'Fermeture du portefeuille famille : montant rendu au portefeuille personnel',
})

// ===== §7 BACK OFFICE =====

export const adminFamilyReasonSchema = z.object({
  reason: z.string().trim().min(3, 'Indiquez le motif').max(500),
}).meta({
  title: 'AdminFamilyReason',
  description: 'Motif d\'une suspension décidée par eBio',
})

/** Lifting a suspension: the reason is welcome, not required. */
export const adminFamilyResumeSchema = z.object({
  reason: z.string().trim().max(500).optional(),
}).meta({ title: 'AdminFamilyResume' })

export const adminFamilyWalletsQuerySchema = z.object({
  status: familyWalletStatusEnum.optional(),
  /** Payer name, email or phone. */
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).meta({ title: 'AdminFamilyWalletsQuery' })

export const adminFamilyWalletRowSchema = z.object({
  id: z.string().uuid(),
  status: familyWalletStatusEnum,
  suspendedByAdmin: z.boolean(),
  balance: z.number(),
  /** The `wallets` row holding the balance, for the ledger page. */
  walletId: z.string().uuid(),
  payer: z.object({
    id: z.string().uuid(),
    name: z.string(),
    phone: z.string().nullable(),
    email: z.string(),
  }),
  /** Members not removed. */
  memberCount: z.number().int(),
  createdAt: z.string().datetime(),
  closedAt: z.string().datetime().nullable(),
}).meta({
  title: 'AdminFamilyWalletRow',
  description: 'Un portefeuille famille dans la liste du back-office',
})

export const adminFamilyWalletListSchema = z.object({
  items: z.array(adminFamilyWalletRowSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
}).meta({ title: 'AdminFamilyWalletList' })

export const adminFamilyMemberSchema = z.object({
  id: z.string().uuid(),
  nickname: z.string(),
  phone: z.string(),
  status: familyMemberStatusEnum,
  userId: z.string().uuid().nullable(),
  /** Suspended by eBio rather than by the payer: only eBio lifts it. */
  suspendedByAdmin: z.boolean(),
  effective: familyLimitsSchema,
  spentThisMonth: z.number(),
  createdAt: z.string().datetime(),
}).meta({ title: 'AdminFamilyMember' })

export const adminFamilyWalletDetailSchema = adminFamilyWalletRowSchema.extend({
  lowBalanceThreshold: z.number(),
  defaults: familyLimitsSchema,
  /** Every member, removed ones included. */
  members: z.array(adminFamilyMemberSchema),
  /** The first page of the ledger; the rest through `/admin/wallets/:walletId/transactions`. */
  transactions: familyTransactionListSchema,
}).meta({
  title: 'AdminFamilyWalletDetail',
  description: 'Détail d\'un portefeuille famille : membres et historique',
})

export type FamilyTransactionsQuery = z.infer<typeof familyTransactionsQuerySchema>
export type FamilyTransactionList = z.infer<typeof familyTransactionListSchema>
export type MemberFamilyTransaction = z.infer<typeof memberFamilyTransactionSchema>
export type MemberFamilyTransactionList = z.infer<typeof memberFamilyTransactionListSchema>
export type FamilyClosureResponse = z.infer<typeof familyClosureResponseSchema>
export type AdminFamilyReason = z.infer<typeof adminFamilyReasonSchema>
export type AdminFamilyResume = z.infer<typeof adminFamilyResumeSchema>
export type AdminFamilyWalletsQuery = z.infer<typeof adminFamilyWalletsQuerySchema>
export type AdminFamilyWalletRow = z.infer<typeof adminFamilyWalletRowSchema>
export type AdminFamilyWalletList = z.infer<typeof adminFamilyWalletListSchema>
export type AdminFamilyMember = z.infer<typeof adminFamilyMemberSchema>
export type AdminFamilyWalletDetail = z.infer<typeof adminFamilyWalletDetailSchema>
