import type { User } from '../auth/auth.entity'
import { BadRequestException } from '@nestjs/common'

/**
 * No order from an account that proved nothing: neither its e-mail (code,
 * Google, Apple) nor its phone (SMS sign-up). An unverifiable buyer is who
 * fraud and unreachable deliveries come from (FR-034c).
 */
export function assertBuyerVerified(buyer: Pick<User, 'emailVerified' | 'phoneVerifiedAt'>): void {
  if (buyer.emailVerified || buyer.phoneVerifiedAt) {
    return
  }
  throw new BadRequestException({
    statusCode: 400,
    code: 'ACCOUNT_NOT_VERIFIED',
    message: 'Confirmez votre adresse e-mail ou votre numéro de téléphone avant de commander.',
  })
}
