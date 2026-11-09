import { Linking } from 'react-native'
import { appAlert } from '../features/common/components/app-alert'

/**
 * Opens a WhatsApp conversation with `phone`, the message already typed.
 *
 * `wa.me` rather than `whatsapp://`: Android hands it to WhatsApp (or WhatsApp
 * Business) when installed and to the browser otherwise, without declaring
 * the scheme in the manifest queries.
 */
export function openWhatsApp(phone: string, message: string): void {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 0) {
    return
  }
  Linking.openURL(`https://wa.me/${digits}?text=${encodeURIComponent(message)}`).catch(() => {
    appAlert('WhatsApp indisponible', 'Impossible d\'ouvrir WhatsApp sur ce téléphone. Appelez plutôt ce numéro.')
  })
}
