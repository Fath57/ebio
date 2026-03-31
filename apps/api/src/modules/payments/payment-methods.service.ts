import type { CreatePaymentMethodInput, ListPaymentMethodsQuery, UpdatePaymentMethodInput } from './contracts/payment-methods.contract'
import { EntityManager, FilterQuery } from '@mikro-orm/core'
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { config } from '../../config/env.config'
import { PaymentMethod } from './entities/payment-method.entity'
import { PaymentMethodType, PaymentProvider } from './payment.entity'

@Injectable()
export class PaymentMethodService {
  constructor(
    private readonly em: EntityManager,
  ) {}

  async list(query: ListPaymentMethodsQuery) {
    const where: FilterQuery<PaymentMethod> = {}

    if (query.countryCode)
      where.countryCode = query.countryCode
    if (query.provider)
      where.provider = query.provider as PaymentProvider
    if (query.type)
      where.type = query.type as PaymentMethodType
    if (query.active !== undefined)
      where.active = query.active === 'true'

    const [items, count] = await this.em.findAndCount(PaymentMethod, where, {
      limit: query.pageSize,
      offset: query.offset,
      orderBy: { countryCode: 'ASC', priority: 'DESC' },
    })

    return {
      data: items.map(item => this.mapToAdmin(item)),
      meta: {
        itemCount: count,
        pageSize: query.pageSize,
        offset: query.offset,
        hasMore: query.offset + query.pageSize < count,
      },
    }
  }

  async getOne(id: string) {
    const method = await this.em.findOneOrFail(PaymentMethod, { id })
    return this.mapToAdmin(method)
  }

  async create(input: CreatePaymentMethodInput) {
    const existing = await this.em.findOne(PaymentMethod, {
      code: input.code,
      countryCode: input.countryCode,
      provider: input.provider as PaymentProvider,
    })
    if (existing) {
      throw new ConflictException('A payment method with this code, country, and provider already exists')
    }

    const method = new PaymentMethod()
    method.name = input.name
    method.code = input.code
    method.type = input.type as PaymentMethodType
    method.provider = input.provider as PaymentProvider
    method.countryCode = input.countryCode
    method.commission = input.commission.toFixed(2)
    method.priority = input.priority
    method.active = input.active
    method.useFedapayCheckout = input.useFedapayCheckout
    method.supportsPayout = input.supportsPayout
    method.supportsRefund = input.supportsRefund

    this.em.persist(method)
    await this.em.flush()

    return this.mapToAdmin(method)
  }

  async update(id: string, input: UpdatePaymentMethodInput) {
    const method = await this.em.findOneOrFail(PaymentMethod, { id })

    if (input.code !== undefined || input.provider !== undefined || input.countryCode !== undefined) {
      const checkCode = input.code ?? method.code
      const checkProvider = (input.provider ?? method.provider) as PaymentProvider
      const checkCountryCode = input.countryCode ?? method.countryCode

      const existing = await this.em.findOne(PaymentMethod, {
        code: checkCode,
        countryCode: checkCountryCode,
        provider: checkProvider,
        id: { $ne: id },
      })
      if (existing) {
        throw new ConflictException('A payment method with this code, country, and provider already exists')
      }
    }

    if (input.name !== undefined)
      method.name = input.name
    if (input.code !== undefined)
      method.code = input.code
    if (input.type !== undefined)
      method.type = input.type as PaymentMethodType
    if (input.provider !== undefined)
      method.provider = input.provider as PaymentProvider
    if (input.countryCode !== undefined)
      method.countryCode = input.countryCode
    if (input.commission !== undefined)
      method.commission = input.commission.toFixed(2)
    if (input.priority !== undefined)
      method.priority = input.priority
    if (input.active !== undefined)
      method.active = input.active
    if (input.useFedapayCheckout !== undefined)
      method.useFedapayCheckout = input.useFedapayCheckout
    if (input.supportsPayout !== undefined)
      method.supportsPayout = input.supportsPayout
    if (input.supportsRefund !== undefined)
      method.supportsRefund = input.supportsRefund
    if (input.icon !== undefined)
      method.icon = input.icon || undefined

    await this.em.flush()
    return this.mapToAdmin(method)
  }

  async remove(id: string) {
    const method = await this.em.findOneOrFail(PaymentMethod, { id })
    await this.em.removeAndFlush(method)
    return { message: 'Payment method deleted' }
  }

  async toggleActive(id: string) {
    const method = await this.em.findOneOrFail(PaymentMethod, { id })
    method.active = !method.active
    await this.em.flush()
    return this.mapToAdmin(method)
  }

  async listAvailable(countryCode: string) {
    const methods = await this.em.find(
      PaymentMethod,
      { countryCode, active: true },
      { orderBy: { priority: 'DESC' } },
    )

    return {
      methods: methods.map(m => ({
        id: m.id,
        name: m.name,
        code: m.code,
        type: m.type as 'mobile' | 'card',
        useFedapayCheckout: m.useFedapayCheckout,
        requiresPhone: m.type === PaymentMethodType.MOBILE && !m.useFedapayCheckout,
        icon: m.icon ? `${config.s3.publicUrl}/${m.icon}` : null,
      })),
    }
  }

  private mapToAdmin(method: PaymentMethod) {
    return {
      id: method.id,
      name: method.name,
      code: method.code,
      type: method.type as 'mobile' | 'card',
      provider: method.provider as 'fedapay' | 'stripe' | 'pawerpayer',
      countryCode: method.countryCode,
      commission: Number(method.commission),
      priority: method.priority,
      active: method.active,
      useFedapayCheckout: method.useFedapayCheckout,
      supportsPayout: method.supportsPayout,
      supportsRefund: method.supportsRefund,
      icon: method.icon ? `${config.s3.publicUrl}/${method.icon}` : null,
      createdAt: method.createdAt.toISOString(),
      updatedAt: method.updatedAt.toISOString(),
    }
  }
}
