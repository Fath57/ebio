import type { SearchProductsQuery, SearchResult } from '../search/contracts/search.contract'
import type { HomeSectionInput } from './contracts/home-section.contract'
import type { HomeSectionCriteria } from './home-section.entity'
import { EntityManager } from '@mikro-orm/postgresql'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { SearchService } from '../search/search.service'
import { HomeSection, HomeSectionMode } from './home-section.entity'

/** A section ready to display: what it says, and what it shows. */
export interface ResolvedHomeSection {
  id: string
  title: string
  subtitle: string | null
  icon: string | null
  /**
   * The criteria, returned as they are.
   *
   * The app needs them for "Tout voir": it reopens the search with the same
   * filters rather than calling one more endpoint. Null for a hand-picked
   * section, where the rail already shows everything.
   */
  criteria: HomeSectionCriteria | null
  results: SearchResult[]
}

/** Where the buyer is, when we know. */
export interface BuyerPosition {
  latitude?: number
  longitude?: number
}

@Injectable()
export class HomeSectionsService {
  constructor(
    private readonly em: EntityManager,
    private readonly search: SearchService,
  ) {}

  /** Every section, switched-off ones included: the back-office view. */
  async listAll(): Promise<HomeSection[]> {
    return this.em.find(HomeSection, {}, { orderBy: { position: 'ASC' } })
  }

  /**
   * The sections as the buyer sees them, products included.
   *
   * A section that returns nothing is dropped rather than shown empty: a title
   * followed by an empty rail reads as a broken app, and "En promotion" has
   * nothing to say on days without promotions.
   */
  async listForBuyer(position: BuyerPosition): Promise<ResolvedHomeSection[]> {
    const sections = await this.em.find(
      HomeSection,
      { active: true },
      { orderBy: { position: 'ASC' } },
    )

    const resolved = await Promise.all(
      sections.map(async section => ({
        id: section.id,
        title: section.title,
        subtitle: section.subtitle ?? null,
        icon: section.icon ?? null,
        criteria: section.mode === HomeSectionMode.MANUAL ? null : (section.criteria ?? {}),
        results: await this.resolve(section, position),
      })),
    )

    return resolved.filter(section => section.results.length > 0)
  }

  /**
   * A section's products.
   *
   * Everything goes through the search, hand-picked lists included: it already
   * carries the shop, the distance, the stock and the promotional price —
   * everything a card displays, and which would otherwise be rebuilt here.
   */
  private async resolve(section: HomeSection, position: BuyerPosition): Promise<SearchResult[]> {
    const criteria = section.criteria ?? {}

    const query = {
      latitude: position.latitude,
      longitude: position.longitude,
      // The search radius is in metres, the setting in kilometres: nobody
      // thinks of a catchment area in metres.
      radius: criteria.maxDistanceKm !== undefined ? criteria.maxDistanceKm * 1000 : undefined,
      category: criteria.categorySlug,
      supplierId: criteria.supplierId,
      maxPrice: criteria.maxPrice,
      minRating: criteria.minRating,
      newerThanDays: criteria.newerThanDays,
      inStockOnly: 'true',
      validatedOnly: criteria.validatedOnly === true ? 'true' : 'false',
      promoOnly: criteria.promoOnly === true ? 'true' : 'false',
      sortBy: criteria.sortBy ?? 'distance',
      productIds: section.mode === HomeSectionMode.MANUAL ? (section.productIds ?? []) : undefined,
      page: 1,
      limit: section.limit,
    } as SearchProductsQuery

    const response = await this.search.searchProducts(query)

    if (section.mode !== HomeSectionMode.MANUAL) {
      return response.results
    }

    // The order the back-office intended, not the search's: a hand-picked
    // section is hand-picked in its order too.
    const wanted = section.productIds ?? []
    const byProduct = new Map(response.results.map(result => [result.product.id, result]))
    return wanted.map(id => byProduct.get(id)).filter((result): result is SearchResult => result !== undefined)
  }

  async create(input: HomeSectionInput): Promise<HomeSection> {
    this.assertCoherent(input)
    // `findOne` refuses an empty filter: ask for the list and take the last,
    // which amounts to the same on a table this size.
    const [last] = await this.em.find(HomeSection, {}, { orderBy: { position: 'DESC' }, limit: 1 })
    const section = this.em.create(HomeSection, {
      title: input.title,
      subtitle: input.subtitle ?? null,
      icon: input.icon ?? null,
      mode: input.mode as HomeSectionMode,
      criteria: input.criteria ?? null,
      productIds: input.productIds ?? null,
      position: (last?.position ?? -1) + 1,
      active: input.active ?? true,
      limit: input.limit ?? 10,
    })
    await this.em.flush()
    return section
  }

  async update(id: string, input: HomeSectionInput): Promise<HomeSection> {
    this.assertCoherent(input)
    const section = await this.em.findOne(HomeSection, { id })
    if (!section) {
      throw new NotFoundException('Section introuvable')
    }

    section.title = input.title
    section.subtitle = input.subtitle ?? null
    section.icon = input.icon ?? null
    section.mode = input.mode as HomeSectionMode
    section.criteria = input.criteria ?? null
    section.productIds = input.productIds ?? null
    if (input.active !== undefined) {
      section.active = input.active
    }
    if (input.limit !== undefined) {
      section.limit = input.limit
    }
    await this.em.flush()
    return section
  }

  async remove(id: string): Promise<void> {
    const section = await this.em.findOne(HomeSection, { id })
    if (!section) {
      throw new NotFoundException('Section introuvable')
    }
    await this.em.removeAndFlush(section)
  }

  /**
   * Reorder in one go rather than one position at a time.
   *
   * Sending the whole list avoids the in-between states where two sections
   * share a place — which happens as soon as a move takes two calls.
   */
  async reorder(ids: string[]): Promise<HomeSection[]> {
    const sections = await this.em.find(HomeSection, { id: { $in: ids } })
    if (sections.length !== ids.length) {
      throw new BadRequestException('La liste ne correspond pas aux sections existantes')
    }

    const rank = new Map(ids.map((id, index) => [id, index]))
    for (const section of sections) {
      section.position = rank.get(section.id) ?? section.position
    }
    await this.em.flush()

    return this.listAll()
  }

  /**
   * A section has to be able to return something.
   *
   * Hand-picked with no product, or criteria-based with no criterion, it would
   * show nothing — better to say so when it is saved than to leave someone
   * wondering why their rail is missing.
   */
  private assertCoherent(input: HomeSectionInput): void {
    if (input.mode === 'MANUAL' && (input.productIds ?? []).length === 0) {
      throw new BadRequestException('Une section composée à la main demande au moins un produit')
    }
    if (input.mode === 'CRITERIA' && Object.keys(input.criteria ?? {}).length === 0) {
      throw new BadRequestException('Une section par critères demande au moins un critère')
    }
  }
}
