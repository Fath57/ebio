import type { PaymentGatewayInterface } from './payment-gateway.interface'
import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { PaymentProvider } from '../payment.entity'
import { FedaPayGateway } from './fedapay.gateway'
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
      default:
        throw new BadRequestException(`Unsupported payment provider: ${provider}`)
    }
  }
}
