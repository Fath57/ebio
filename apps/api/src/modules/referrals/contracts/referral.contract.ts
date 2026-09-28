import { z } from 'zod'

/** Sans I, O, 0 ni 1 : un code se lit à voix haute et se recopie à la main. */
export const REFERRAL_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const REFERRAL_CODE_LENGTH = 6

export const referralCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(4)
  .max(16)
  .regex(/^[A-Z0-9]+$/, 'Un code de parrainage ne contient que des lettres et des chiffres')

export const claimReferralSchema = z.object({
  code: referralCodeSchema,
}).meta({ title: 'ClaimReferral', description: 'Rattache un parrain au compte courant' })

export const referralSummarySchema = z.object({
  /** Le code du porteur du compte, créé au premier affichage. */
  code: z.string(),
  /** Lien prêt à partager, le code déjà dedans. */
  link: z.string(),
  /** Filleuls dont la première commande n'est pas encore livrée. */
  pending: z.number().int(),
  /** Filleuls dont la récompense a été versée. */
  rewarded: z.number().int(),
  /** Total déjà gagné, en FCFA. */
  earned: z.number().int(),
  /** Ce que rapporterait le prochain filleul, au barème du jour. */
  sponsorReward: z.number().int(),
  refereeReward: z.number().int(),
  /** Montant minimum de la commande qui déclenche la récompense. */
  minOrderAmount: z.number().int(),
  /** Faux quand le parrainage est suspendu au back-office. */
  active: z.boolean(),
  /** Le parrain de ce compte, s'il en a un. */
  sponsoredBy: z.object({
    name: z.string(),
    status: z.enum(['PENDING', 'REWARDED']),
  }).nullable(),
}).meta({ title: 'ReferralSummary', description: 'Tableau de bord du parrainage' })

export const referralRewardsSchema = z.object({
  /** Versé au parrain à la première commande livrée de son filleul. */
  sponsorAmount: z.number().int().min(0).max(100_000),
  /** Versé au filleul au même moment. */
  refereeAmount: z.number().int().min(0).max(100_000),
  /**
   * Plancher de la commande qui déclenche le versement.
   *
   * Sans lui, une commande à deux cents francs suffirait à déclencher deux
   * récompenses : le parrainage coûterait plus cher que ce qu'il rapporte.
   */
  minOrderAmount: z.number().int().min(0).max(1_000_000),
  /** Suspend le programme sans effacer les liens déjà noués. */
  active: z.boolean(),
}).meta({ title: 'ReferralRewards', description: 'Barème du parrainage' })

export type ClaimReferral = z.infer<typeof claimReferralSchema>
export type ReferralSummary = z.infer<typeof referralSummarySchema>
export type ReferralRewards = z.infer<typeof referralRewardsSchema>
