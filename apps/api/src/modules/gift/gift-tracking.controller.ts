import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common'
import { RateLimit } from '../../common/decorators/rate-limit.decorator'
import { RateLimitGuard } from '../../common/guards/rate-limit.guard'
import { Public } from '../auth/auth.decorator'
import { GiftTrackingMapper } from './gift-tracking.mapper'
import { GiftTrackingService } from './gift-tracking.service'

const MINUTE_MS = 60_000

/**
 * The tracking link texted to the relative, read without an account by the
 * public page `suivi/:token` of the site.
 */
@Controller('gift-tracking')
export class GiftTrackingController {
  constructor(private readonly tracking: GiftTrackingService) {}

  @Get(':token')
  @Public()
  @UseGuards(RateLimitGuard)
  // The landing SSR loader calls this server-side, so every visitor shares the
  // landing server's IP; each open page polls every 15 s. The 144-bit token
  // makes guessing pointless, so the ceiling only guards against floods.
  @RateLimit(1200, MINUTE_MS)
  async get(@Param('token') token: string) {
    const bundle = await this.tracking.findByToken(token)
    if (!bundle) {
      throw new NotFoundException('Ce lien de suivi n\'existe pas')
    }
    return GiftTrackingMapper.toResponse(bundle)
  }
}
