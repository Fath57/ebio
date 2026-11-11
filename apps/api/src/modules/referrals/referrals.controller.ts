import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common'
import { RateLimit } from '../../common/decorators/rate-limit.decorator'
import { RateLimitGuard } from '../../common/guards/rate-limit.guard'
import { Public, Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { claimReferralSchema } from './contracts/referral.contract'
import { ReferralsService } from './referrals.service'

/**
 * Referrals, from the buyer's side.
 *
 * Signed in, except to read a shared code's invitation: a code belongs to someone, and a reward is paid into a
 * wallet. The holder's code is created the first time they look at it —
 * nobody needs a code until they read it.
 */
@Controller('referrals')
@UseGuards(AuthGuard)
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @Get('me')
  async me(@Session() session: LoggedInBetterAuthSession) {
    return this.referrals.summary(session.user.id)
  }

  /** The landing page of a shared link, read before anyone has an account. */
  @Get('codes/:code')
  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit(60)
  async invitation(@Param('code') code: string) {
    const invitation = await this.referrals.invitation(code)
    if (!invitation)
      throw new NotFoundException('Ce code de parrainage n\'existe pas')
    return invitation
  }

  @Post('claim')
  async claim(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(claimReferralSchema) body: { code: string },
  ) {
    return this.referrals.claim(session.user.id, body.code)
  }
}
