import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import type { InitiateCheckoutInput, InitiatePayment, VerifyCheckoutInput } from './contracts/payment.contract'
import {
  TypedBody,
  TypedParam,
  TypedRoute,
} from '@lonestone/nzoth/server'
import {
  Controller,
  UseGuards,
} from '@nestjs/common'
import { z } from 'zod'
import { CanCreate, CanRead } from '../../common/decorators/check-permissions.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import {
  checkoutVerifyResultSchema,
  initiateCheckoutSchema,
  initiatePaymentSchema,
  noRedirectPaymentResultSchema,
  paymentInfoSchema,
  paymentStatusResponseSchema,
  verifyCheckoutSchema,
} from './contracts/payment.contract'
import { PaymentsService } from './payments.service'

@Controller('payments')
@UseGuards(AuthGuard, CaslGuard)
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
  ) {}

  @TypedRoute.Get('orders/:id/info', paymentInfoSchema)
  @CanRead('Payment')
  async getPaymentInfo(
    @Session() session: LoggedInBetterAuthSession,
    @TypedParam('id', z.uuid()) id: string,
  ) {
    return this.paymentsService.getPaymentInfo(session.user.id, id)
  }

  @TypedRoute.Post('initiate', noRedirectPaymentResultSchema)
  @CanCreate('Payment')
  async initiateNoRedirectPayment(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(initiatePaymentSchema) body: InitiatePayment,
  ) {
    return this.paymentsService.initiateNoRedirectPayment(session.user.id, body)
  }

  @TypedRoute.Post('initiate-checkout', noRedirectPaymentResultSchema)
  @CanCreate('Payment')
  async initiateCheckoutPayment(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(initiateCheckoutSchema) body: InitiateCheckoutInput,
  ) {
    return this.paymentsService.initiateCheckoutPayment(session.user.id, body)
  }

  @TypedRoute.Post('verify-checkout', checkoutVerifyResultSchema)
  @CanCreate('Payment')
  async verifyCheckoutPayment(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(verifyCheckoutSchema) body: VerifyCheckoutInput,
  ) {
    return this.paymentsService.verifyCheckoutPayment(session.user.id, body)
  }

  @TypedRoute.Get('orders/:id/status', paymentStatusResponseSchema)
  @CanRead('Payment')
  async getPaymentStatus(
    @Session() session: LoggedInBetterAuthSession,
    @TypedParam('id', z.uuid()) id: string,
  ) {
    return this.paymentsService.getPaymentStatus(session.user.id, id)
  }
}
