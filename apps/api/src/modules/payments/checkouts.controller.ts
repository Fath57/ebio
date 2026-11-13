import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import type { CompensateCheckout } from '../orders/contracts/checkout.contract'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import { CanManage } from '../../common/decorators/check-permissions.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { GiftNotifierService } from '../gift/gift-notifier.service'
import { compensateCheckoutSchema } from '../orders/contracts/checkout.contract'
import { CompensationService } from './compensation.service'

@Controller('checkouts')
@UseGuards(AuthGuard)
export class CheckoutsController {
  constructor(
    private readonly compensationService: CompensationService,
    private readonly giftNotifier: GiftNotifierService,
  ) {}

  /**
   * Compensation for one order of a unified cart, triggered by hand.
   *
   * Ordinary cancellations — shop refusal, expiry — already go through it on
   * their own. This endpoint serves the back-office when an order fell through
   * without the automatic path noticing, and it is safe to replay: compensation
   * is idempotent per order.
   */
  @Post(':id/compensate')
  @Roles('ADMIN')
  @UseGuards(RolesGuard, CaslGuard)
  @CanManage('Payment')
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

  /**
   * The payer sends the relative the last useful text again — the code while
   * the courier is on the way, the announcement before. Three times at most,
   * then `429 RECIPIENT_SMS_LIMIT`. Payer only: anyone else gets a 404.
   */
  @Post(':id/recipient-sms')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resendRecipientSms(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id', new ParseUUIDPipe()) checkoutId: string,
  ): Promise<void> {
    await this.giftNotifier.resendToRecipient(checkoutId, session.user.id)
  }
}
