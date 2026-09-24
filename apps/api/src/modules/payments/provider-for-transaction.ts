import { PaymentProvider } from './payment.entity'

/**
 * Chez qui vérifier une transaction, d'après la transaction elle-même.
 *
 * La bascule d'un prestataire à l'autre ne se fait pas d'un coup : les
 * applications déjà installées embarquent le widget de l'ancien et ouvriront
 * leur paiement chez lui, quoi que le serveur ait configuré depuis. Vérifier
 * chez le prestataire courant reviendrait à chercher leur transaction là où
 * elle n'existe pas — et à ne jamais créditer quelqu'un qui a pourtant payé.
 *
 * On regarde donc la transaction plutôt que le réglage :
 *
 * - si le serveur a lui-même ouvert celle-ci, il sait de qui elle vient ;
 * - sinon, un identifiant tout en chiffres est un identifiant FedaPay
 *   (« 510148 »), là où INTRAM rend dix caractères alphanumériques
 *   (« ZnSXVuakcF »).
 *
 * La forme suffit parce que les deux ne se ressemblent pas. Un identifiant
 * INTRAM entièrement numérique est possible en théorie — dix chiffres tirés
 * sur soixante-deux caractères — et c'est précisément ce que le premier cas
 * rattrape : ceux-là, le serveur les a ouverts et les reconnaît.
 */
export function providerForTransaction(
  presentedId: string,
  openedByServer: string | null,
): PaymentProvider {
  if (openedByServer !== null && openedByServer === presentedId) {
    return PaymentProvider.INTRAM
  }

  return /^\d+$/.test(presentedId.trim()) ? PaymentProvider.FEDAPAY : PaymentProvider.INTRAM
}
