import { Buffer } from 'node:buffer'
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { config } from '../../config/env.config'

const OPENAI_AUDIO_URL = 'https://api.openai.com/v1/audio'

/**
 * What the assistant hears, and what she says.
 *
 * Two functions kept apart behind a narrow interface: the price of this line
 * item will move, and the day we change provider this is the only file to
 * rewrite. The conversation itself does not know it exists.
 *
 * Audio is never kept: it comes in, it is transcribed, it is gone. What
 * remains of the speech is the text — visible to the buyer, and checkable
 * afterwards.
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
   * Audio becomes text.
   *
   * The language is forced: letting it guess would tip a short phrase — "oui",
   * "deux kilos" — into English one time in ten.
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
   * Text becomes speech, handed over as it arrives.
   *
   * MP3: played everywhere, and light enough for a mobile connection that is
   * not always good.
   *
   * The body is returned rather than a `Buffer` on purpose. Waiting for the
   * whole file before forwarding it added a full second to every sentence:
   * measured against the provider, the first bytes land at about 950 ms and
   * the file is complete at 1 250 ms, but buffering here turned that into
   * 1 800 to 2 700 ms at the phone. The voice is what the buyer waits for.
   */
  async speak(text: string, speed: number): Promise<ReadableStream<Uint8Array>> {
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
        // Both levers pull the same way. Averaged over four runs of the same
        // sentence — this model re-performs the text each time, so one sample
        // says nothing — 7.76 s as she shipped against 6.66 s here: 14 %.
        // Shorter audio also comes back sooner.
        speed,
        // This is not a narrator: it is someone behind a market stall with
        // people waiting. « Débit naturel » read as « prenez votre temps ».
        instructions: 'Parle en français, d\'un ton chaleureux et direct, comme une vendeuse de marché qui a du monde à servir. Débit rapide et enlevé, sans traîner sur les fins de phrase. Pas de ton de présentation, pas de pauses appuyées.',
      }),
    })

    if (!response.ok) {
      this.logger.error(`Synthèse refusée (${response.status}) — ${await response.text()}`)
      throw new ServiceUnavailableException('La voix est momentanément indisponible.')
    }

    if (!response.body) {
      throw new ServiceUnavailableException('La voix est momentanément indisponible.')
    }
    return response.body
  }
}
