import type { SearchProductsQuery } from '../search/contracts/search.contract'
import type { FavoritesResponse } from './favorites.contract'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, NotFoundException } from '@nestjs/common'
import { User } from '../auth/auth.entity'
import { Product } from '../products/entities/product.entity'
import { SearchService } from '../search/search.service'
import { Favorite } from './favorites.entity'

/** As many as the search will take in one filter, and more than anyone keeps. */
const MAX_LISTED = 50

@Injectable()
export class FavoritesService {
  constructor(
    private readonly em: EntityManager,
    private readonly searchService: SearchService,
  ) {}

  /**
   * The kept products, newest first.
   *
   * Built by handing the identifiers to the search rather than by a query of
   * its own: the shop, the distance, the promotional price and the stock are
   * exactly what a card shows, and rebuilding them here would mean two
   * queries to keep in step forever.
   */
  async list(userId: string, position?: { latitude: number, longitude: number }): Promise<FavoritesResponse> {
    const kept = await this.em.find(
      Favorite,
      { user: { id: userId } },
      { orderBy: { createdAt: 'DESC' }, limit: MAX_LISTED, populate: ['product'] },
    )
    if (kept.length === 0) {
      return { items: [], total: 0 }
    }

    const savedAt = new Map(kept.map(favorite => [favorite.product.id, favorite.createdAt.toISOString()]))
    const found = await this.searchService.searchProducts({
      productIds: [...savedAt.keys()],
      // A kept product that has gone out of stock stays visible: it is the
      // reason one comes back, and hiding it reads as having lost it.
      inStockOnly: 'false',
      validatedOnly: 'false',
      promoOnly: 'false',
      sortBy: 'distance',
      page: 1,
      limit: MAX_LISTED,
      ...(position ?? {}),
    } as SearchProductsQuery)

    // The order is the buyer's, not the distance's: they kept these in a
    // sequence and expect to find them in it.
    const items = [...savedAt.keys()]
      .map(productId => found.results.find(result => result.product.id === productId))
      .filter(result => result !== undefined)
      .map(result => ({ ...result, savedAt: savedAt.get(result.product.id) ?? '' }))

    return { items, total: items.length }
  }

  /** Which of these are kept — one request for a whole page of cards. */
  async pickKept(userId: string, productIds: string[]): Promise<string[]> {
    if (productIds.length === 0) {
      return []
    }
    const kept = await this.em.find(Favorite, {
      user: { id: userId },
      product: { id: { $in: productIds } },
    }, { populate: ['product'] })
    return kept.map(favorite => favorite.product.id)
  }

  /** Keeping a product twice is keeping it once: the second call is not an error. */
  async add(userId: string, productId: string): Promise<void> {
    const existing = await this.em.findOne(Favorite, {
      user: { id: userId },
      product: { id: productId },
    })
    if (existing) {
      return
    }
    const product = await this.em.findOne(Product, { id: productId })
    if (!product) {
      throw new NotFoundException('Produit introuvable')
    }
    this.em.create(Favorite, {
      user: this.em.getReference(User, userId),
      product,
    })
    await this.em.flush()
  }

  /** Removing what is not there is the state that was asked for. */
  async remove(userId: string, productId: string): Promise<void> {
    const existing = await this.em.findOne(Favorite, {
      user: { id: userId },
      product: { id: productId },
    })
    if (existing) {
      await this.em.removeAndFlush(existing)
    }
  }
}
