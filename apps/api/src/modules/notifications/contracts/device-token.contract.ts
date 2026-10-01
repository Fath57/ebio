import { z } from 'zod'

const fcmTokenSchema = z.string().trim().min(1).max(4096)

export const registerDeviceTokenSchema = z.object({
  token: fcmTokenSchema,
  platform: z.string().trim().min(1).max(20),
  /** client | supplier | courier — any other value is ignored. */
  app: z.string().optional(),
}).meta({
  title: 'RegisterDeviceToken',
  description: 'Attaches a push token to the signed-in account',
  examples: [{ token: 'fcm-token', platform: 'android', app: 'client' }],
})

export type RegisterDeviceToken = z.infer<typeof registerDeviceTokenSchema>

export const unregisterDeviceTokenSchema = z.object({
  token: fcmTokenSchema,
}).meta({
  title: 'UnregisterDeviceToken',
  description: 'Detaches a push token from the signed-in account',
  examples: [{ token: 'fcm-token' }],
})

export type UnregisterDeviceToken = z.infer<typeof unregisterDeviceTokenSchema>
