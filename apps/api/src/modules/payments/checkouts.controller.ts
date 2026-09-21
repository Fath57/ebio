import type { CompensateCheckout } from '../orders/contracts/checkout.contract'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Param, Post, UseGuards } from '@nestjs/common'
import { CanManage } from '../../common/decorators/check-permissions.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { AuthGuard } from '../auth/auth.guard'
import { compensateCheckoutSchema } from '../orders/contracts/checkout.contract'
import { CompensationService } from './compensation.service'

/**
 * Compensation for one order of a unified cart, triggered by hand.
 *
 * Ordinary cancellations — shop refusal, expiry — already go through it on
 * their own. This endpoint serves the back-office when an order fell through
 * without the automatic path noticing, and it is safe to replay: compensation
 * is idempotent per order.
 */
@Controller('checkouts')
@UseGuards(AuthGuard, RolesGuard, CaslGuard)
@Roles('ADMIN')
export class CheckoutsController {
  constructor(private readonly compensationService: CompensationService) {}

  @CanManage('Payment')
  @Post(':id/compensate')
  async compensate(
    @Param('id') _checkoutId: string,
    @TypedBody(compensateCheckoutSchema) body: CompensateCheckout,
  ) {
    const result = await this.compensationService.compensateOrder(body.orderId, body.reason)
    return {
      amount: result.amount,
      deliveryRefund: result.deliveryRefund,
      alreadyDone: result.alreadyDone,
      checkoutStatus: result.checkoutStatus,
    }
  }
}
