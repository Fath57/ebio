import { PaymentProvider } from '../payment.entity'
import { providerForTransaction } from '../provider-for-transaction'

/**
 * Le jour de la bascule, une application installée continue d'ouvrir son
 * paiement chez l'ancien prestataire. Vérifier chez le nouveau reviendrait à
 * ne pas créditer quelqu'un qui a payé.
 */
describe('à qui appartient une transaction', () => {
  it('reconnaît un identifiant FedaPay à ses chiffres', () => {
    expect(providerForTransaction('510148', null)).toBe(PaymentProvider.FEDAPAY)
  })

  it('reconnaît un identifiant INTRAM à sa forme', () => {
    expect(providerForTransaction('ZnSXVuakcF', null)).toBe(PaymentProvider.INTRAM)
  })

  // Le cas qui départage : dix chiffres tirés au sort chez INTRAM ne se
  // distinguent pas d'un identifiant FedaPay. Le serveur, lui, sait qu'il a
  // ouvert celui-là.
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
