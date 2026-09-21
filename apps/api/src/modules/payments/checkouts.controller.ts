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
 * Dédommagement d'une commande d'un panier unifié, déclenché à la main.
 *
 * Les annulations ordinaires — refus boutique, expiration — passent déjà par
 * là toutes seules. Cet endpoint sert au back-office quand une commande est
 * tombée sans que le circuit automatique l'ait vue, et il est sans danger à
 * rejouer : le dédommagement est idempotent par commande.
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
