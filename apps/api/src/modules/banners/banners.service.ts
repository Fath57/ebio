import type { BannerResponse, CreateBanner, UpdateBanner } from './contracts/banner.contract'
import { EntityManager } from '@mikro-orm/postgresql'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Product } from '../products/entities/product.entity'
import { Supplier } from '../suppliers/supplier.entity'
import { Banner, BannerTargetType } from './banner.entity'

/** Nombre de bannières renvoyées à l'accueil — au-delà, plus personne ne fait défiler. */
const PUBLIC_LIMIT = 5

@Injectable()
export class BannersService {
  constructor(private readonly em: EntityManager) {}

  /**
   * Bannières actives pour l'accueil mobile. Une bannière dont la cible a été
   * supprimée est écartée : elle mènerait à un écran vide.
   */
  async findActive(): Promise<BannerResponse[]> {
    const banners = await this.em.find(
      Banner,
      { isActive: true },
      { orderBy: { position: 'ASC', createdAt: 'DESC' } },
    )

    const labels = await this.resolveTargetLabels(banners)

    return banners
      .filter(banner => labels.get(banner.targetId) !== undefined)
      .slice(0, PUBLIC_LIMIT)
      .map(banner => this.toResponse(banner, labels))
  }

  async findAll(): Promise<{ items: BannerResponse[], total: number }> {
    const banners = await this.em.find(
      Banner,
      {},
      { orderBy: { position: 'ASC', createdAt: 'DESC' } },
    )
    const labels = await this.resolveTargetLabels(banners)

    return {
      items: banners.map(banner => this.toResponse(banner, labels)),
      total: banners.length,
    }
  }

  async findById(id: string): Promise<BannerResponse> {
    const banner = await this.em.findOne(Banner, { id })
    if (!banner) {
      throw new NotFoundException('Bannière introuvable')
    }
    const labels = await this.resolveTargetLabels([banner])
    return this.toResponse(banner, labels)
  }

  async create(input: CreateBanner): Promise<BannerResponse> {
    await this.assertTargetExists(input.targetType as BannerTargetType, input.targetId)
    const banner = this.em.create(Banner, {
      ...input,
      targetType: input.targetType as BannerTargetType,
    })
    await this.em.flush()
    return this.findById(banner.id)
  }

  async update(id: string, input: UpdateBanner): Promise<BannerResponse> {
    const banner = await this.em.findOne(Banner, { id })
    if (!banner) {
      throw new NotFoundException('Bannière introuvable')
    }

    // La cible n'est vérifiée que si l'un des deux champs bouge.
    const targetType = (input.targetType as BannerTargetType) ?? banner.targetType
    const targetId = input.targetId ?? banner.targetId
    if (input.targetType !== undefined || input.targetId !== undefined) {
      await this.assertTargetExists(targetType, targetId)
    }

    this.em.assign(banner, { ...input, targetType, targetId })
    await this.em.flush()
    return this.findById(banner.id)
  }

  async remove(id: string): Promise<void> {
    const banner = await this.em.findOne(Banner, { id })
    if (!banner) {
      throw new NotFoundException('Bannière introuvable')
    }
    await this.em.removeAndFlush(banner)
  }

  /** Refuse une bannière pointant vers une cible inexistante, dès la création. */
  private async assertTargetExists(targetType: BannerTargetType, targetId: string): Promise<void> {
    const found = targetType === BannerTargetType.SUPPLIER
      ? await this.em.findOne(Supplier, { id: targetId })
      : await this.em.findOne(Product, { id: targetId })

    if (!found) {
      throw new BadRequestException(
        targetType === BannerTargetType.SUPPLIER
          ? 'Fournisseur cible introuvable'
          : 'Produit cible introuvable',
      )
    }
  }

  /** Un seul aller-retour par type de cible, quel que soit le nombre de bannières. */
  private async resolveTargetLabels(banners: Banner[]): Promise<Map<string, string>> {
    const labels = new Map<string, string>()
    if (banners.length === 0) {
      return labels
    }

    const supplierIds = banners.filter(b => b.targetType === BannerTargetType.SUPPLIER).map(b => b.targetId)
    const productIds = banners.filter(b => b.targetType === BannerTargetType.PRODUCT).map(b => b.targetId)

    if (supplierIds.length > 0) {
      const suppliers = await this.em.find(Supplier, { id: { $in: supplierIds } })
      suppliers.forEach(s => labels.set(s.id, s.shopName))
    }
    if (productIds.length > 0) {
      const products = await this.em.find(Product, { id: { $in: productIds } })
      products.forEach(p => labels.set(p.id, p.name))
    }

    return labels
  }

  private toResponse(banner: Banner, labels: Map<string, string>): BannerResponse {
    return {
      id: banner.id,
      title: banner.title,
      subtitle: banner.subtitle ?? null,
      imageUrl: banner.imageUrl,
      targetType: banner.targetType,
      targetId: banner.targetId,
      targetLabel: labels.get(banner.targetId) ?? null,
      isActive: banner.isActive,
      position: banner.position,
      createdAt: banner.createdAt.toISOString(),
    }
  }
}
