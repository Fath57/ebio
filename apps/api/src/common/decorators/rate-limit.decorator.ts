import { applyDecorators, SetMetadata } from '@nestjs/common'

export function RateLimit(limit: number, windowMs: number = 600_000): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    SetMetadata('rateLimit', limit),
    SetMetadata('rateLimitWindow', windowMs),
  )
}
