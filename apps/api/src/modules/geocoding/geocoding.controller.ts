import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { RateLimit } from '../../common/decorators/rate-limit.decorator'
import { RateLimitGuard } from '../../common/guards/rate-limit.guard'
import { Public } from '../auth/auth.decorator'
import { placeKindSchema } from './contracts/geocoding.contract'
import { GeocodingService } from './geocoding.service'

/**
 * Public : le choix de position est proposé avant toute connexion. La limite de
 * débit protège la facturation Google d'un abus depuis l'application.
 */
@Controller('geocoding')
@UseGuards(RateLimitGuard)
export class GeocodingController {
  constructor(private readonly geocodingService: GeocodingService) {}

  @Get('autocomplete')
  @Public()
  @RateLimit(120, 60_000)
  async autocomplete(
    @Query('q') q: string = '',
    @Query('session') session?: string,
    @Query('kind') kind?: string,
  ) {
    // Anything other than the one accepted value falls back to city search,
    // which is what every existing caller expects.
    const parsed = placeKindSchema.safeParse(kind)
    return {
      suggestions: await this.geocodingService.autocomplete(
        q,
        session,
        parsed.success ? parsed.data : 'city',
      ),
    }
  }

  @Get('place')
  @Public()
  @RateLimit(60, 60_000)
  async resolvePlace(
    @Query('placeId') placeId: string,
    @Query('session') session?: string,
  ) {
    return this.geocodingService.resolvePlace(placeId, session)
  }
}
