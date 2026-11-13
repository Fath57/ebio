import { HttpException, HttpStatus } from '@nestjs/common'
import { firstName } from '../gift/gift-texts'

/** An error the apps translate by its `code`, in the shape the rest of the API uses. */
export function familyError(status: HttpStatus, code: string, message: string): HttpException {
  return new HttpException({ statusCode: status, code, message }, status)
}

export function familyWalletNone(): HttpException {
  return familyError(HttpStatus.NOT_FOUND, 'FAMILY_WALLET_NONE', 'Vous n\'avez pas encore de portefeuille famille.')
}

export function familyWalletClosed(): HttpException {
  return familyError(HttpStatus.CONFLICT, 'FAMILY_WALLET_CLOSED', 'Ce portefeuille famille est fermé.')
}

/**
 * « 15 000 FCFA » with plain spaces: these words also travel by SMS, where a
 * non-breaking space would switch the whole message to the costly encoding.
 */
export function spokenFcfa(amount: number): string {
  const grouped = Math.round(amount).toString().replace(/\B(?=(?:\d{3})+(?!\d))/g, ' ')
  return `${grouped} FCFA`
}

export function memberAddedText(payerName: string): string {
  return `${firstName(payerName)} vous a ajouté(e) à son portefeuille famille eBio : vos courses peuvent être payées avec.`
}

export function memberInvitationSms(payerName: string, link: string): string {
  return `${firstName(payerName)} vous a ajouté(e) à son portefeuille famille eBio. Installez eBio avec ce numéro pour faire vos courses : ${link}`
}

export function topupText(payerName: string, memberSpendable: number): string {
  return `${firstName(payerName)} a rechargé le portefeuille famille. Vous pouvez dépenser ${spokenFcfa(memberSpendable)} ce mois-ci.`
}

/** What a member hears when their access, or the whole wallet, changes. */
export type FamilyStatusEvent = 'MEMBER_SUSPENDED' | 'MEMBER_SUSPENDED_BY_EBIO' | 'MEMBER_RESUMED' | 'MEMBER_REMOVED' | 'WALLET_SUSPENDED' | 'WALLET_RESUMED' | 'WALLET_CLOSED'

export function statusText(payerName: string, event: FamilyStatusEvent): string {
  const payer = firstName(payerName)
  switch (event) {
    case 'MEMBER_SUSPENDED':
      return `${payer} a mis en pause votre accès au portefeuille famille. Vous ne pouvez plus payer vos courses avec pour le moment.`
    case 'MEMBER_SUSPENDED_BY_EBIO':
      return `eBio a mis en pause votre accès au portefeuille famille de ${payer}. Contactez le support pour en savoir plus.`
    case 'MEMBER_RESUMED':
      return `Votre accès au portefeuille famille de ${payer} est réactivé : vous pouvez de nouveau payer vos courses avec.`
    case 'MEMBER_REMOVED':
      return `${payer} vous a retiré(e) de son portefeuille famille. Vos commandes passées restent visibles dans l'app.`
    case 'WALLET_SUSPENDED':
      return `Le portefeuille famille de ${payer} est en pause. Vous ne pouvez plus payer vos courses avec pour le moment.`
    case 'WALLET_RESUMED':
      return `Le portefeuille famille de ${payer} est de nouveau disponible pour vos courses.`
    case 'WALLET_CLOSED':
      return `${payer} a fermé son portefeuille famille. Il ne peut plus payer vos courses.`
  }
}

export function memberJoinedText(nickname: string): string {
  return `${nickname} a rejoint votre portefeuille famille.`
}

export function memberPendingText(nickname: string): string {
  return `${nickname} n'a pas encore installé eBio. Renvoyer l'invitation ?`
}

/** Told to the payer when eBio suspends or lifts the suspension of their wallet. */
export function adminWalletStatusText(suspended: boolean, reason: string | null): string {
  return suspended
    ? `eBio a suspendu votre portefeuille famille${reason ? ` : ${reason}` : ''}. Contactez le support pour en savoir plus.`
    : 'eBio a levé la suspension de votre portefeuille famille : vos proches peuvent de nouveau l\'utiliser.'
}

/** « Maman a commandé chez Ferme Bio Tori : 6 800 FCFA. » — the payer calls the member by their nickname. */
export function purchaseText(nickname: string, shopName: string, amount: number): string {
  return `${nickname} a commandé chez ${shopName} : ${spokenFcfa(amount)}.`
}

export function lowBalanceText(balance: number): string {
  return `Il reste ${spokenFcfa(balance)} dans votre portefeuille famille.`
}
