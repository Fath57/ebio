import { z } from 'zod'

/** No I, O, 0 or 1: a code is read aloud and copied by hand. */
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
}).meta({ title: 'ClaimReferral', description: 'Attaches a sponsor to the current account' })

export const referralSummarySchema = z.object({
  /** The account holder's code, created the first time they look. */
  code: z.string(),
  /** A link ready to share, the code already in it. */
  link: z.string(),
  /** Referees whose first order has not been delivered yet. */
  pending: z.number().int(),
  /** Referees whose reward has been paid. */
  rewarded: z.number().int(),
  /** Total earned so far, in FCFA. */
  earned: z.number().int(),
  /** What the next referee would earn, at today's rates. */
  sponsorReward: z.number().int(),
  refereeReward: z.number().int(),
  /** Smallest order that triggers the reward. */
  minOrderAmount: z.number().int(),
  /** False when referrals are paused from the back-office. */
  active: z.boolean(),
  /** This account's sponsor, if it has one. */
  sponsoredBy: z.object({
    name: z.string(),
    status: z.enum(['PENDING', 'REWARDED']),
  }).nullable(),
}).meta({ title: 'ReferralSummary', description: 'Referral dashboard' })

export const referralRewardsSchema = z.object({
  /** Paid to the sponsor on their referee's first delivered order. */
  sponsorAmount: z.number().int().min(0).max(100_000),
  /** Paid to the referee at the same moment. */
  refereeAmount: z.number().int().min(0).max(100_000),
  /**
   * Floor under which an order pays nothing.
   *
   * Without it a two-hundred-franc order would be enough to trigger two
   * rewards: referrals would cost more than they bring in.
   */
  minOrderAmount: z.number().int().min(0).max(1_000_000),
  /** Pauses the programme without erasing the links already made. */
  active: z.boolean(),
}).meta({ title: 'ReferralRewards', description: 'Referral rewards and thresholds' })

export type ClaimReferral = z.infer<typeof claimReferralSchema>
export type ReferralSummary = z.infer<typeof referralSummarySchema>
export type ReferralRewards = z.infer<typeof referralRewardsSchema>
