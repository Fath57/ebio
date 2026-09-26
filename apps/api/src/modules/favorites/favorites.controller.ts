import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import { Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { favoriteIdsQuerySchema } from './favorites.contract'
import { FavoritesService } from './favorites.service'

/**
 * Products a buyer keeps aside.
 *
 * Signed in, always: a favourite belongs to someone. The heart used to fill in
 * and forget everything on leaving the screen, while the profile promised
 * « votre panier et vos favoris » to anyone signed out — a promise with
 * nothing behind it.
 */
@Controller('favorites')
@UseGuards(AuthGuard)
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get()
  async list(
    @Session() session: LoggedInBetterAuthSession,
    @Query('latitude') latitude?: string,
    @Query('longitude') longitude?: string,
  ) {
    const lat = Number(latitude)
    const lng = Number(longitude)
    const position = Number.isFinite(lat) && Number.isFinite(lng)
      ? { latitude: lat, longitude: lng }
      : undefined
    return this.favoritesService.list(session.user.id, position)
  }

  /** Which of these are kept — asked once for a whole page of cards. */
  @Get('ids')
  async pickKept(
    @Session() session: LoggedInBetterAuthSession,
    @Query('productIds') productIds?: string,
  ) {
    const parsed = favoriteIdsQuerySchema.safeParse({ productIds: productIds ?? [] })
    if (!parsed.success) {
      return { productIds: [] }
    }
    return { productIds: await this.favoritesService.pickKept(session.user.id, parsed.data.productIds) }
  }

  @Post(':productId')
  async add(
    @Session() session: LoggedInBetterAuthSession,
    @Param('productId') productId: string,
  ) {
    await this.favoritesService.add(session.user.id, productId)
    return { isFavorite: true }
  }

  @Delete(':productId')
  async remove(
    @Session() session: LoggedInBetterAuthSession,
    @Param('productId') productId: string,
  ) {
    await this.favoritesService.remove(session.user.id, productId)
    return { isFavorite: false }
  }
}
