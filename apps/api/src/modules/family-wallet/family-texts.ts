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
