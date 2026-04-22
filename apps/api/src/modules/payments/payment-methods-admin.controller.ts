import type { CreatePaymentMethodInput, UpdatePaymentMethodInput } from './contracts/payment-methods.contract'
import {
  TypedBody,
  TypedParam,
  TypedRoute,
} from '@lonestone/nzoth/server'
import { Controller, Query, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { CanManage } from '../../common/decorators/check-permissions.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { AuthGuard } from '../auth/auth.guard'
import {
  createPaymentMethodSchema,
  listPaymentMethodsQuerySchema,
  messageResponseSchema,
  paymentMethodListSchema,
  paymentMethodOutputSchema,
  updatePaymentMethodSchema,
} from './contracts/payment-methods.contract'
import { PaymentMethodService } from './payment-methods.service'

@Controller('admin/payment-methods')
@UseGuards(AuthGuard, CaslGuard)
export class PaymentMethodAdminController {
  constructor(private readonly paymentMethodService: PaymentMethodService) {}

  @TypedRoute.Get('', paymentMethodListSchema)
  @CanManage('PaymentMethod')
  async list(
    @Query() query: Record<string, string>,
  ) {
    const parsed = listPaymentMethodsQuerySchema.parse(query)
    return this.paymentMethodService.list(parsed)
  }

  @TypedRoute.Get(':id', paymentMethodOutputSchema)
  @CanManage('PaymentMethod')
  async getOne(
    @TypedParam('id', z.uuid()) id: string,
  ) {
    return this.paymentMethodService.getOne(id)
  }

  @TypedRoute.Post('', paymentMethodOutputSchema)
  @CanManage('PaymentMethod')
  async create(
    @TypedBody(createPaymentMethodSchema) body: CreatePaymentMethodInput,
  ) {
    return this.paymentMethodService.create(body)
  }

  @TypedRoute.Patch(':id', paymentMethodOutputSchema)
  @CanManage('PaymentMethod')
  async update(
    @TypedParam('id', z.uuid()) id: string,
    @TypedBody(updatePaymentMethodSchema) body: UpdatePaymentMethodInput,
  ) {
    return this.paymentMethodService.update(id, body)
  }

  @TypedRoute.Delete(':id', messageResponseSchema)
  @CanManage('PaymentMethod')
  async remove(
    @TypedParam('id', z.uuid()) id: string,
  ) {
    return this.paymentMethodService.remove(id)
  }

  @TypedRoute.Post(':id/toggle', paymentMethodOutputSchema)
  @CanManage('PaymentMethod')
  async toggleActive(
    @TypedParam('id', z.uuid()) id: string,
  ) {
    return this.paymentMethodService.toggleActive(id)
  }
}
