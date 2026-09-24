import type { SearchProductsQuery, SearchResult } from '../search/contracts/search.contract'
import type { HomeSectionInput } from './contracts/home-section.contract'
import type { HomeSectionCriteria } from './home-section.entity'
import { EntityManager } from '@mikro-orm/postgresql'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { SearchService } from '../search/search.service'
import { HomeSection, HomeSectionMode } from './home-section.entity'

/** Une section prête à afficher : ce qu'elle dit, et ce qu'elle montre. */
export interface ResolvedHomeSection {
  id: string
  title: string
  subtitle: string | null
  icon: string | null
  /**
   * Les critères, rendus tels quels.
   *
   * L'application en a besoin pour « Tout voir » : elle rouvre la recherche
   * avec les mêmes filtres plutôt qu'un endpoint de plus. Nul pour une
   * section composée à la main, où le rail montre déjà tout.
   */
  criteria: HomeSectionCriteria | null
  results: SearchResult[]
}

/** Où se trouve l'acheteur, quand on le sait. */
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

  /** Toutes les sections, éteintes comprises : c'est la vue du back-office. */
  async listAll(): Promise<HomeSection[]> {
    return this.em.find(HomeSection, {}, { orderBy: { position: 'ASC' } })
  }

  /**
   * Les sections telles que l'acheteur les voit, produits inclus.
   *
   * Une section qui ne rend rien est écartée plutôt que montrée vide : un
   * titre suivi d'un rail vide donne l'impression d'une application cassée,
   * et « En promotion » n'a rien à dire les jours sans promotion.
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
   * Les produits d'une section.
   *
   * Tout passe par la recherche, y compris la composition à la main : elle
   * porte déjà la boutique, la distance, le stock et le prix promotionnel —
   * tout ce qu'une carte affiche, et qu'il faudrait sinon refaire ici.
   */
  private async resolve(section: HomeSection, position: BuyerPosition): Promise<SearchResult[]> {
    const criteria = section.criteria ?? {}

    const query = {
      latitude: position.latitude,
      longitude: position.longitude,
      // Le rayon de la recherche est en mètres, le réglage en kilomètres :
      // personne ne pense une zone de chalandise en mètres.
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

    // L'ordre voulu par le back-office, et non celui de la recherche : une
    // section composée à la main l'est aussi dans son ordre.
    const wanted = section.productIds ?? []
    const byProduct = new Map(response.results.map(result => [result.product.id, result]))
    return wanted.map(id => byProduct.get(id)).filter((result): result is SearchResult => result !== undefined)
  }

  async create(input: HomeSectionInput): Promise<HomeSection> {
    this.assertCoherent(input)
    // `findOne` refuse un filtre vide : on demande la liste et on prend la
    // dernière, ce qui revient au même sur une table de cette taille.
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
   * Réordonner d'un coup, plutôt qu'une position à la fois.
   *
   * Envoyer la liste entière évite les états intermédiaires où deux sections
   * partagent la même place — ce qui arrive dès qu'on déplace en deux appels.
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
   * Une section doit pouvoir rendre quelque chose.
   *
   * Composée à la main sans produit, ou par critères sans critère, elle
   * n'afficherait rien — autant le dire au moment où on l'enregistre plutôt
   * que de laisser quelqu'un chercher pourquoi son rail est absent.
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
