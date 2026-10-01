import { config } from '../config/env.config'

const LAN_IP_PATTERN = /^https?:\/\/(?:10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)(?::\d+)?$/

/**
 * One origin policy for HTTP and the sockets. No origin (the mobile apps,
 * server calls) passes; a browser must come from a trusted origin, or from
 * the LAN outside production.
 */
export function checkCorsOrigin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void): void {
  if (!origin || config.betterAuth.trustedOrigins.includes(origin))
    return callback(null, true)
  if (config.env !== 'production' && LAN_IP_PATTERN.test(origin))
    return callback(null, true)
  return callback(new Error(`Origin ${origin} not allowed`), false)
}
