import type { CreatePromoCodeInput, UpdatePromoCodeInput } from './contracts/promo-code.contract'
import { EntityManager } from '@mikro-orm/postgresql'
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { User } from '../auth/auth.entity'
import { Order } from '../orders/entities/order.entity'
import { Supplier } from '../suppliers/supplier.entity'
import { PromoCode, PromoType } from './entities/promo-code.entity'
import { PromoRedemption } from './entities/promo-redemption.entity'

export interface AppliedPromo {
  promo: PromoCode
  discount: number
  fundedBy: 'SUPPLIER' | 'PLATFORM'
}

@Injectable()
export class PromoCodesService {
  private readonly logger = new Logger(PromoCodesService.name)

  constructor(private readonly em: EntityManager) {}

  // ---------- CRUD ----------

  async create(input: CreatePromoCodeInput, ownerId: string, supplierId: string | null): Promise<PromoCode> {
    const code = input.code.toUpperCase()

    // The scope's uniqueness is enforced by partial indexes; checking first
    // gives a readable message instead of a raw constraint error.
    const clash = await this.em.findOne(PromoCode, supplierId
      ? { code, supplier: { id: supplierId } }
      : { code, supplier: null })
    if (clash) {
      throw new BadRequestException('Ce code existe déjà')
    }

    if (input.startsAt && input.expiresAt && input.startsAt >= input.expiresAt) {
      throw new BadRequestException('La date de fin doit suivre la date de début')
    }

    const promo = this.em.create(PromoCode, {
      code,
      supplier: supplierId ? this.em.getReference(Supplier, supplierId) : null,
      type: input.type as PromoType,
      value: input.value,
      maxDiscount: input.maxDiscount ?? null,
      minOrderAmount: input.minOrderAmount,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      maxUses: input.maxUses ?? null,
      maxUsesPerUser: input.maxUsesPerUser,
      createdBy: ownerId,
    })
    await this.em.flush()
    return promo
  }

  async update(id: string, input: UpdatePromoCodeInput, supplierId: string | null): Promise<PromoCode> {
    const promo = await this.findOwned(id, supplierId)

    if (input.type !== undefined)
      promo.type = input.type as PromoType
    if (input.value !== undefined)
      promo.value = input.value
    if (promo.type === PromoType.PERCENT && promo.value > 100) {
      throw new BadRequestException('Un pourcentage ne peut pas dépasser 100')
    }
    if (input.maxDiscount !== undefined)
      promo.maxDiscount = input.maxDiscount
    if (input.minOrderAmount !== undefined)
      promo.minOrderAmount = input.minOrderAmount
    if (input.startsAt !== undefined)
      promo.startsAt = input.startsAt ? new Date(input.startsAt) : null
    if (input.expiresAt !== undefined)
      promo.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null
    if (promo.startsAt && promo.expiresAt && promo.startsAt >= promo.expiresAt) {
      throw new BadRequestException('La date de fin doit suivre la date de début')
    }
    if (input.maxUses !== undefined)
      promo.maxUses = input.maxUses
    if (input.maxUsesPerUser !== undefined)
      promo.maxUsesPerUser = input.maxUsesPerUser
    if (input.isActive !== undefined)
      promo.isActive = input.isActive

    await this.em.flush()
    return promo
  }

  async remove(id: string, supplierId: string | null): Promise<void> {
    const promo = await this.findOwned(id, supplierId)
    if (promo.useCount > 0) {
      // Redemptions reference it: keep the history, just retire the code.
      promo.isActive = false
      await this.em.flush()
      return
    }
    await this.em.removeAndFlush(promo)
  }

  async list(filters: { supplierId?: string | null, page: number, limit: number }): Promise<{
    items: PromoCode[]
    total: number
  }> {
    const where = filters.supplierId === undefined
      ? {}
      : { supplier: filters.supplierId === null ? null : { id: filters.supplierId } }
    const [items, total] = await this.em.findAndCount(PromoCode, where, {
      populate: ['supplier'],
      orderBy: { createdAt: 'DESC' },
      limit: filters.limit,
      offset: (filters.page - 1) * filters.limit,
    })
    return { items, total }
  }

  /** Ownership guard: a supplier can only touch its own codes; admin (null scope) touches any. */
  private async findOwned(id: string, supplierId: string | null): Promise<PromoCode> {
    const promo = await this.em.findOne(PromoCode, supplierId
      ? { id, supplier: { id: supplierId } }
      : { id })
    if (!promo) {
      throw new NotFoundException('Code promo introuvable')
    }
    return promo
  }

  // ---------- Validation & application ----------

  /**
   * Checks a code against a cart. Returns the discount when usable, or the
   * exact human reason it is not. The shop's own code wins over a platform
   * code with the same name.
   */
  async check(codeRaw: string, supplierId: string, itemsTotal: number, userId: string): Promise<
    { valid: true, promo: PromoCode, discount: number } | { valid: false, message: string }
  > {
    const code = codeRaw.trim().toUpperCase()
    const promo = await this.em.findOne(PromoCode, { code, supplier: { id: supplierId } })
      ?? await this.em.findOne(PromoCode, { code, supplier: null })

    if (!promo || !promo.isActive) {
      return { valid: false, message: 'Ce code n’existe pas ou n’est plus actif' }
    }
    const now = new Date()
    if (promo.startsAt && now < promo.startsAt) {
      return { valid: false, message: 'Ce code n’est pas encore actif' }
    }
    if (promo.expiresAt && now > promo.expiresAt) {
      return { valid: false, message: 'Ce code a expiré' }
    }
    if (itemsTotal < promo.minOrderAmount) {
      return { valid: false, message: `Valable à partir de ${promo.minOrderAmount.toLocaleString('fr-FR')} FCFA d’articles` }
    }
    if (promo.maxUses !== null && promo.maxUses !== undefined && promo.useCount >= promo.maxUses) {
      return { valid: false, message: 'Ce code a atteint son nombre maximum d’utilisations' }
    }
    const userUses = await this.em.count(PromoRedemption, {
      promoCode: { id: promo.id },
      user: { id: userId },
    })
    if (userUses >= promo.maxUsesPerUser) {
      return { valid: false, message: 'Vous avez déjà utilisé ce code' }
    }

    return { valid: true, promo, discount: this.computeDiscount(promo, itemsTotal) }
  }

  private computeDiscount(promo: PromoCode, itemsTotal: number): number {
    let discount = promo.type === PromoType.PERCENT
      ? itemsTotal * (promo.value / 100)
      : promo.value
    if (promo.maxDiscount != null) {
      discount = Math.min(discount, promo.maxDiscount)
    }
    // A discount can empty the cart, never make it negative.
    discount = Math.min(discount, itemsTotal)
    return Math.round(discount * 100) / 100
  }

  /**
   * Reserves one use for an order being created. The conditional UPDATE on
   * the counter is the arbiter under concurrency: two last-slot buyers can
   * both pass check(), only one increment succeeds.
   */
  async redeem(promo: PromoCode, orderId: string, userId: string, discount: number): Promise<void> {
    const result = await this.em.getConnection().execute<{ affectedRows?: number }>(
      `UPDATE promo_codes
       SET use_count = use_count + 1, "updatedAt" = NOW()
       WHERE id = ? AND is_active = true
         AND (max_uses IS NULL OR use_count < max_uses)`,
      [promo.id],
      'run',
    )
    if ((result.affectedRows ?? 0) === 0) {
      throw new BadRequestException('Ce code a atteint son nombre maximum d’utilisations')
    }

    this.em.create(PromoRedemption, {
      promoCode: promo,
      user: this.em.getReference(User, userId),
      order: this.em.getReference(Order, orderId),
      amountDiscounted: discount,
    })
    await this.em.flush()
  }

  /** Cancelled order (including never-paid ones): the use goes back to the pool. */
  async release(orderId: string): Promise<void> {
    const redemption = await this.em.findOne(PromoRedemption, { order: { id: orderId } })
    if (!redemption) {
      return
    }
    await this.em.getConnection().execute(
      `UPDATE promo_codes SET use_count = GREATEST(use_count - 1, 0), "updatedAt" = NOW() WHERE id = ?`,
      [redemption.promoCode.id],
      'run',
    )
    await this.em.removeAndFlush(redemption)
    this.logger.log(`Promo redemption released for order ${orderId}`)
  }
}
