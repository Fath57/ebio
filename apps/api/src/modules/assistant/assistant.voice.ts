import { Buffer } from 'node:buffer'
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { config } from '../../config/env.config'

const OPENAI_AUDIO_URL = 'https://api.openai.com/v1/audio'

/**
 * Ce que l'assistant entend, et ce qu'il dit.
 *
 * Deux fonctions séparées du reste, derrière une interface étroite : le prix
 * de ce poste bougera, et le jour où l'on change de fournisseur il n'y a que
 * ce fichier à réécrire. La conversation, elle, ne sait pas qu'il existe.
 *
 * L'audio n'est jamais conservé : il entre, il est transcrit, il disparaît.
 * Ce qui reste de la parole, c'est le texte — visible par l'acheteur, et
 * vérifiable après coup.
 */
@Injectable()
export class AssistantVoiceService {
  private readonly logger = new Logger(AssistantVoiceService.name)

  private get apiKey(): string {
    const key = config.ai.providers.openai.apiKey
    if (!key) {
      throw new ServiceUnavailableException('La voix n\'est pas configurée.')
    }
    return key
  }

  /**
   * L'audio devient du texte.
   *
   * La langue est imposée : laisser deviner ferait basculer une phrase courte
   * — « oui », « deux kilos » — vers l'anglais une fois sur dix.
   */
  async transcribe(audio: Buffer, filename: string, mimeType: string): Promise<string> {
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(audio)], { type: mimeType }), filename)
    form.append('model', config.assistant.sttModel)
    form.append('language', 'fr')

    const response = await fetch(`${OPENAI_AUDIO_URL}/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    })

    if (!response.ok) {
      this.logger.error(`Transcription refusée (${response.status}) — ${await response.text()}`)
      throw new ServiceUnavailableException('Je n\'ai pas pu vous entendre. Réessayez ?')
    }

    const data = await response.json() as { text?: string }
    return (data.text ?? '').trim()
  }

  /**
   * Le texte devient de la voix.
   *
   * Rendu en MP3 : lu partout, et assez léger pour une connexion mobile qui
   * n'est pas toujours bonne.
   */
  async speak(text: string): Promise<Buffer> {
    const response = await fetch(`${OPENAI_AUDIO_URL}/speech`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.assistant.ttsModel,
        voice: config.assistant.ttsVoice,
        input: text,
        response_format: 'mp3',
        // Ce n'est pas un narrateur : c'est quelqu'un derrière un étal.
        instructions: 'Parle en français, d\'un ton chaleureux et direct, comme une vendeuse de marché qui connaît ses produits. Débit naturel, pas de ton de présentation.',
      }),
    })

    if (!response.ok) {
      this.logger.error(`Synthèse refusée (${response.status}) — ${await response.text()}`)
      throw new ServiceUnavailableException('La voix est momentanément indisponible.')
    }

    return Buffer.from(await response.arrayBuffer())
  }
}
