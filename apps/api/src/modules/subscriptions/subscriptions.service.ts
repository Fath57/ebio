import type { CreateSubscription } from './contracts/subscription.contract'
import { EntityManager } from '@mikro-orm/postgresql'
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Supplier } from '../suppliers/supplier.entity'
import { SubscriptionPlan } from './entities/subscription-plan.entity'
import { Subscription, SubscriptionStatus } from './entities/subscription.entity'

const SUBSCRIPTION_DURATION_DAYS = 30

@Injectable()
export class SubscriptionsService {
  constructor(private readonly em: EntityManager) {}

  async getPlans(): Promise<SubscriptionPlan[]> {
    return this.em.find(SubscriptionPlan, {}, { orderBy: { priceMonthly: 'ASC' } })
  }

  async subscribe(
    supplierId: string,
    data: CreateSubscription,
  ): Promise<Subscription> {
    const plan = await this.em.findOne(SubscriptionPlan, { id: data.planId })
    if (!plan)
      throw new NotFoundException('Plan introuvable')

    const existing = await this.em.findOne(Subscription, {
      supplier: { id: supplierId },
      status: SubscriptionStatus.ACTIVE,
    })

    if (existing) {
      throw new BadRequestException('Vous avez deja un abonnement actif. Utilisez la mise a niveau.')
    }

    const startDate = new Date()
    const endDate = new Date(startDate.getTime() + SUBSCRIPTION_DURATION_DAYS * 24 * 60 * 60 * 1000)

    const subscription = this.em.create(Subscription, {
      supplier: this.em.getReference(Supplier, supplierId),
      plan,
      status: SubscriptionStatus.ACTIVE,
      startDate,
      endDate,
      autoRenew: true,
      paymentId: data.paymentReference ?? null,
    })

    await this.em.flush()
    return subscription
  }

  async getCurrentSubscription(supplierId: string): Promise<Subscription | null> {
    return this.em.findOne(
      Subscription,
      { supplier: { id: supplierId }, status: SubscriptionStatus.ACTIVE },
      { populate: ['plan'] },
    )
  }

  async cancelSubscription(subscriptionId: string): Promise<Subscription> {
    const subscription = await this.em.findOne(Subscription, { id: subscriptionId })
    if (!subscription)
      throw new NotFoundException('Abonnement introuvable')

    subscription.autoRenew = false
    await this.em.flush()

    return subscription
  }

  async upgradeSubscription(
    subscriptionId: string,
    newPlanId: string,
  ): Promise<Subscription> {
    const subscription = await this.em.findOne(Subscription, { id: subscriptionId }, { populate: ['plan'] })
    if (!subscription)
      throw new NotFoundException('Abonnement introuvable')

    const newPlan = await this.em.findOne(SubscriptionPlan, { id: newPlanId })
    if (!newPlan)
      throw new NotFoundException('Nouveau plan introuvable')

    if (newPlan.priceMonthly <= subscription.plan.priceMonthly) {
      throw new BadRequestException('Le nouveau plan doit etre superieur au plan actuel')
    }

    // Calculate prorated remaining days
    const now = new Date()
    const remainingMs = subscription.endDate.getTime() - now.getTime()
    const remainingDays = Math.max(0, remainingMs / (24 * 60 * 60 * 1000))

    // Apply proration: extend end date from now by remaining days + new period
    const newEndDate = new Date(now.getTime() + remainingDays * 24 * 60 * 60 * 1000)

    subscription.plan = newPlan
    subscription.endDate = newEndDate
    await this.em.flush()

    return subscription
  }

  async checkPlanLimit(
    supplierId: string,
    feature: 'orderMode' | 'advancedAnalytics' | 'products',
  ): Promise<boolean> {
    const subscription = await this.getCurrentSubscription(supplierId)
    if (!subscription)
      return false

    const plan = subscription.plan

    switch (feature) {
      case 'orderMode':
        return plan.orderModeEnabled
      case 'advancedAnalytics':
        return plan.advancedAnalytics
      case 'products':
        return true // Use enforceProductLimit for count-based check
      default:
        return false
    }
  }

  async enforceProductLimit(supplierId: string): Promise<void> {
    const subscription = await this.getCurrentSubscription(supplierId)

    const maxProducts = subscription?.plan?.maxProducts ?? 5 // Default free tier

    const rows = await this.em.getConnection().execute(
      // 'ARCHIVED' is not a product status: the exclusion never applied and
      // deleted products counted against the plan.
      `SELECT COUNT(*)::int as count FROM products WHERE supplier_id = ? AND status <> 'HIDDEN'`,
      [supplierId],
    )

    const currentCount = rows[0]?.count ?? 0
    if (currentCount >= maxProducts) {
      throw new ForbiddenException(
        `Limite de ${maxProducts} produits atteinte pour votre plan. Passez a un plan superieur.`,
      )
    }
  }
}
