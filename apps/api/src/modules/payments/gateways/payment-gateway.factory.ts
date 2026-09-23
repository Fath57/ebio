import type { PaymentGatewayInterface, PayoutGatewayInterface } from './payment-gateway.interface'
import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { config } from '../../../config/env.config'
import { PaymentProvider } from '../payment.entity'
import { FedaPayGateway } from './fedapay.gateway'
import { IntramGateway } from './intram.gateway'
import { PawerPayerGateway } from './pawerpayer.gateway'
import { StripeGateway } from './stripe.gateway'

@Injectable()
export class PaymentGatewayFactory {
  private readonly logger = new Logger(PaymentGatewayFactory.name)

  createGateway(provider: PaymentProvider): PaymentGatewayInterface {
    switch (provider) {
      case PaymentProvider.FEDAPAY:
        return new FedaPayGateway()
      case PaymentProvider.STRIPE:
        return new StripeGateway()
      case PaymentProvider.PAWERPAYER:
        return new PawerPayerGateway()
      case PaymentProvider.INTRAM:
        return new IntramGateway()
      default:
        throw new BadRequestException(`Unsupported payment provider: ${provider}`)
    }
  }

  /**
   * The gateway that pays people, for the provider configured as such.
   *
   * Separate from `createGateway` because paying out is a capability, not a
   * given: Stripe and PawaPay only ever take money in, and asking them here
   * fails now rather than in front of a courier waiting for their money.
   */
  createPayoutGateway(): PayoutGatewayInterface {
    const provider = config.payments.payoutProvider === 'intram'
      ? PaymentProvider.INTRAM
      : PaymentProvider.FEDAPAY

    const gateway = this.createGateway(provider)
    if (!('createPayout' in gateway)) {
      throw new BadRequestException(`Provider ${provider} cannot send payouts`)
    }

    this.logger.log(`Reversements servis par ${provider}`)
    return gateway as unknown as PayoutGatewayInterface
  }
}
