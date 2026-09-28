import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Get, Post, UseGuards } from '@nestjs/common'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { claimReferralSchema } from './contracts/referral.contract'
import { ReferralsService } from './referrals.service'

/**
 * Le parrainage, côté acheteur.
 *
 * Toujours connecté : un code appartient à quelqu'un, et une récompense se
 * verse sur un portefeuille. Le code du porteur est créé au premier affichage
 * — personne n'a besoin d'un code tant qu'il ne le regarde pas.
 */
@Controller('referrals')
@UseGuards(AuthGuard)
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @Get('me')
  async me(@Session() session: LoggedInBetterAuthSession) {
    return this.referrals.summary(session.user.id)
  }

  @Post('claim')
  async claim(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(claimReferralSchema) body: { code: string },
  ) {
    return this.referrals.claim(session.user.id, body.code)
  }
}
