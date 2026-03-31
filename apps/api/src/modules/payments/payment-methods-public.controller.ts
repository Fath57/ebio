import { TypedRoute } from '@lonestone/nzoth/server'
import { Controller, Query, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { CanRead } from '../../common/decorators/check-permissions.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { AuthGuard } from '../auth/auth.guard'
import { availablePaymentMethodsSchema } from './contracts/payment-methods.contract'
import { PaymentMethodService } from './payment-methods.service'

const availableQuerySchema = z.object({
  countryCode: z.string().min(2).max(3),
})

@Controller('payment-methods')
@UseGuards(AuthGuard, CaslGuard)
export class PaymentMethodPublicController {
  constructor(private readonly paymentMethodService: PaymentMethodService) {}

  @TypedRoute.Get('available', availablePaymentMethodsSchema)
  @CanRead('PaymentMethod')
  async getAvailable(
    @Query() query: Record<string, string>,
  ) {
    const parsed = availableQuerySchema.parse(query)
    return this.paymentMethodService.listAvailable(parsed.countryCode)
  }
}
