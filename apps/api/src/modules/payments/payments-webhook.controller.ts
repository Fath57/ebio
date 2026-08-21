import { Buffer } from 'node:buffer'
import { Body, Controller, Headers, Post, RawBody } from '@nestjs/common'
import { Public } from '../auth/auth.decorator'
import { TopupService } from '../wallet/topup.service'
import { WithdrawalsService } from '../wallet/withdrawals.service'
import { PaymentProvider } from './payment.entity'
import { PaymentsService } from './payments.service'

@Controller('payments/webhook')
export class PaymentsWebhookController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly withdrawalsService: WithdrawalsService,
    private readonly topupService: TopupService,
  ) {}

  @Post('fedapay')
  @Public()
  async handleFedaPayWebhook(
    @Body() body: unknown,
  ) {
    const event = body as { object?: string, entity?: { id?: number } } | null
    const entityId = event?.entity?.id != null ? String(event.entity.id) : null

    // payout.* events belong to withdrawals, not to order payments.
    if (event?.object === 'payout') {
      if (entityId) {
        await this.withdrawalsService.settleFromProvider(entityId)
      }
      return { received: true }
    }

    // A transaction may be a wallet topup rather than an order payment.
    if (entityId) {
      const status = (event as { entity?: { status?: string } }).entity?.status
      const settled = await this.topupService.settleFromProvider(
        entityId,
        status === 'approved' || status === 'transferred' ? 'completed' : 'failed',
      )
      if (settled) {
        return { received: true }
      }
    }

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
