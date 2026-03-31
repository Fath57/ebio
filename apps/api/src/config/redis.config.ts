import { config } from './env.config'

export const redisConfig = {
  url: config.redis.url,
}

/**
 * Parse Redis URL into host/port/password for libraries that need individual params.
 */
export function parseRedisUrl(url: string) {
  const parsed = new URL(url)
  return {
    host: parsed.hostname,
    port: Number.parseInt(parsed.port || '6379', 10),
    password: parsed.password || undefined,
  }
}
