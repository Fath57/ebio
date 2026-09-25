import { PaymentProvider } from '../payment.entity'
import { providerForTransaction } from '../provider-for-transaction'

/**
 * On switchover day, an installed app keeps opening its payment with the old
 * provider. Verifying with the new one would mean failing to credit someone
 * who paid.
 */
describe('à qui appartient une transaction', () => {
  it('reconnaît un identifiant FedaPay à ses chiffres', () => {
    expect(providerForTransaction('510148', null)).toBe(PaymentProvider.FEDAPAY)
  })

  it('reconnaît un identifiant INTRAM à sa forme', () => {
    expect(providerForTransaction('ZnSXVuakcF', null)).toBe(PaymentProvider.INTRAM)
  })

  // The case that decides it: ten digits drawn at random by INTRAM are
  // indistinguishable from a FedaPay id. The server, though, knows it opened
  // that one.
  it('fait confiance à ce que le serveur a ouvert lui-même', () => {
    expect(providerForTransaction('1234567890', '1234567890')).toBe(PaymentProvider.INTRAM)
  })

  it('ignore ce que le serveur a ouvert si l\'acheteur présente autre chose', () => {
    expect(providerForTransaction('510148', 'ZnSXVuakcF')).toBe(PaymentProvider.FEDAPAY)
  })

  it('ne se laisse pas avoir par une espace', () => {
    expect(providerForTransaction(' 510148 ', null)).toBe(PaymentProvider.FEDAPAY)
  })
})
