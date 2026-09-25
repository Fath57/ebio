import { z } from 'zod'

export const otpRequestSchema = z.object({
  phone: z.string().regex(/^\+229\d{10}$/, 'Format téléphone Bénin requis: +229XXXXXXXXXX'),
}).meta({ title: 'OtpRequest', description: 'Request OTP via SMS' })

export const otpVerifySchema = z.object({
  phone: z.string(),
  code: z.string().length(6),
}).meta({ title: 'OtpVerify', description: 'Verify OTP code' })

export const refreshTokenSchema = z.object({
  refreshToken: z.string(),
}).meta({ title: 'RefreshToken', description: 'Refresh access token' })

export const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
}).meta({ title: 'AdminLogin', description: 'Admin login step 1' })

export const adminVerifyOtpSchema = z.object({
  tempToken: z.string(),
  code: z.string().length(6),
}).meta({ title: 'AdminVerifyOtp', description: 'Admin 2FA verification' })

/**
 * Trusting a phone.
 *
 * No secret travels up: the server draws it and hands it back once. The app
 * only says which device it is and what to call it in the list.
 */
export const biometricEnrollSchema = z.object({
  deviceId: z.string().min(8).max(128),
  label: z.string().trim().min(1).max(120),
}).meta({ title: 'BiometricEnroll', description: 'Faire confiance à cet appareil' })

export const biometricVerifySchema = z.object({
  deviceId: z.string().min(8).max(128),
  secret: z.string().min(32).max(256),
}).meta({ title: 'BiometricVerify', description: 'Connexion par empreinte' })

export const authResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: z.object({
    id: z.string().uuid(),
    name: z.string(),
    phone: z.string().nullable(),
    role: z.enum(['BUYER', 'SUPPLIER', 'ADMIN']),
  }),
  isNewUser: z.boolean(),
}).meta({ title: 'AuthResponse', description: 'Authentication tokens + user' })

export type OtpRequest = z.infer<typeof otpRequestSchema>
export type OtpVerify = z.infer<typeof otpVerifySchema>
export type RefreshToken = z.infer<typeof refreshTokenSchema>
export type AdminLogin = z.infer<typeof adminLoginSchema>
export type AdminVerifyOtp = z.infer<typeof adminVerifyOtpSchema>
export type BiometricEnroll = z.infer<typeof biometricEnrollSchema>
export type BiometricVerify = z.infer<typeof biometricVerifySchema>
export type AuthResponse = z.infer<typeof authResponseSchema>
