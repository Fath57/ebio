import { z } from 'zod'

export const userResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  role: z.enum(['BUYER', 'SUPPLIER', 'COURIER', 'ADMIN']),
  image: z.string().url().nullable(),
  /** Null until the person has accepted the terms. */
  termsAcceptedAt: z.string().nullable(),
  createdAt: z.string().datetime(),
  /** Staff members only: the back-office role they hold (null = super administrator). */
  staffRole: z.object({ id: z.string().uuid(), name: z.string() }).nullable(),
  /** What the back-office lets this user see or do (empty for app users). */
  permissions: z.array(z.object({ action: z.string(), subject: z.string() })),
}).meta({ title: 'UserResponse', description: 'Public user profile' })

export const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  image: z.string().url().optional(),
  deviceId: z.string().optional(),
}).meta({ title: 'UpdateUser', description: 'Update user profile' })

export const userSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  image: z.string().url().nullable(),
}).meta({ title: 'UserSummary', description: 'Minimal user info for lists' })

export type UserResponse = z.infer<typeof userResponseSchema>
export type UpdateUser = z.infer<typeof updateUserSchema>
export type UserSummary = z.infer<typeof userSummarySchema>

/**
 * The acceptance of the terms, as the app declares it.
 *
 * `depuis` says which app the agreement came from: the same person may sign up
 * as a buyer and later become a courier, and where they accepted is part of
 * what has to be showable.
 */
export const acceptTermsSchema = z.object({
  depuis: z.enum(['client', 'supplier', 'courier', 'web']),
}).meta({
  title: 'AcceptTerms',
  description: 'Enregistrer l\'acceptation des conditions et de la politique de confidentialité',
})

export type AcceptTermsInput = z.infer<typeof acceptTermsSchema>
