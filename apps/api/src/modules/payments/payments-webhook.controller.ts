import { Controller, Body, Headers, Post, RawBody } from '@nestjs/common'
import { Public } from '../auth/auth.decorator'
import { PaymentProvider } from './payment.entity'
import { PaymentsService } from './payments.service'

@Controller('payments/webhook')
export class PaymentsWebhookController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('fedapay')
  @Public()
  async handleFedaPayWebhook(
    @Body() body: unknown,
  ) {
    await this.paymentsService.handleWebhookCallback(
      PaymentProvider.FEDAPAY,
      body,
    )
    return { received: true }
  }

  @Post('stripe')
  @Public()
  async handleStripeWebhook(
    @RawBody() rawBody: Buffer,
    @Headers('stripe-signature') signature: string,
  ) {
    await this.paymentsService.handleWebhookCallback(
      PaymentProvider.STRIPE,
      rawBody,
      signature,
    )
    return { received: true }
  }

  @Post('pawerpayer')
  @Public()
  async handlePawerPayerWebhook(
    @Body() body: unknown,
  ) {
    await this.paymentsService.handleWebhookCallback(
      PaymentProvider.PAWERPAYER,
      body,
    )
    return { received: true }
  }
}
