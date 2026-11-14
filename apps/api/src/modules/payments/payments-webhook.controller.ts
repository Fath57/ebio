import { Buffer } from 'node:buffer'
import { BadRequestException, Body, Controller, Get, Headers, Post, Query, RawBody, Redirect } from '@nestjs/common'
import { config } from '../../config/env.config'
import { Public } from '../auth/auth.decorator'
import { TopupService } from '../wallet/topup.service'
import { WithdrawalsService } from '../wallet/withdrawals.service'
import { IntramGateway } from './gateways/intram.gateway'
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
    if (entityId && await this.topupService.settleFromWebhook(entityId)) {
      return { received: true }
    }

    await this.paymentsService.handleWebhookCallback(
      PaymentProvider.FEDAPAY,
      body,
    )
    return { received: true }
  }

  /**
   * INTRAM's hosted page ends by sending the *browser* here, as a GET with
   * `?transaction_id=…&status=SUCCESS`, rather than to the return URL. The
   * payment WebView then showed our 404 as raw JSON and never learnt that
   * the page was done.
   *
   * Nothing in that query is signed, so nothing is done with it: the browser
   * is only forwarded to the return URL, which the app watches for and
   * answers by asking our server, which asks INTRAM.
   */
  @Get('intram')
  @Public()
  @Redirect()
  returnFromIntram(@Query('transaction_id') transactionId?: string) {
    const target = new URL(config.payments.returnUrl)
    if (transactionId) {
      target.searchParams.set('transaction_id', transactionId)
    }
    return { url: target.toString(), statusCode: 302 }
  }

  /**
   * INTRAM signs what it sends, so this route proves the delivery before
   * acting on it, unlike the FedaPay one above, which can only re-read
   * the transaction it names.
   *
   * The raw bytes are required: the signature covers `timestamp.body` exactly
   * as sent, and re-serialising the parsed JSON breaks it. INTRAM retries a
   * non-2xx five times over two hours, so answering quickly matters more than
   * answering in detail.
   */
  @Post('intram')
  @Public()
  async handleIntramWebhook(
    @RawBody() rawBody: Buffer,
    @Headers('x-intram-signature') signature: string,
    @Headers('x-intram-timestamp') timestamp: string,
  ) {
    const gateway = new IntramGateway()
    const body = rawBody?.toString('utf8') ?? ''

    if (!gateway.verifyWebhook(body, signature, timestamp)) {
      // 400 rather than 200: a body we cannot prove is not one we acknowledge.
      throw new BadRequestException('Signature INTRAM invalide')
    }

    const payload = JSON.parse(body) as {
      event?: string
      operation_id?: string
      data?: { reference?: string, status?: string }
    }

    // payout.* belongs to withdrawals, never to an order payment.
    if (payload.event?.startsWith('payout.')) {
      const payoutId = payload.operation_id ?? payload.data?.reference
      if (payoutId) {
        await this.withdrawalsService.settleFromProvider(payoutId)
      }
      return { received: true }
    }

    await this.paymentsService.handleWebhookCallback(
      PaymentProvider.INTRAM,
      payload,
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
