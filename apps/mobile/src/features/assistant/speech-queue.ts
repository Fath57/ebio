import { createAudioPlayer, setAudioModeAsync } from 'expo-audio'
import { discardSpoken, speak } from './assistant'

/**
 * The answer, spoken as it is written.
 *
 * The turn already arrives sentence by sentence, but the voice used to wait
 * for the whole thing: the text appeared in a second and the first sound came
 * three or four seconds later, once the complete answer had been synthesised
 * in one go. Here each sentence is sent to synthesis the moment it is known —
 * so the next one is being made while the current one plays — and they are
 * played strictly in order.
 *
 * Kept out of the screen because it is a small state machine with two clocks:
 * synthesis, which runs ahead, and playback, which must not.
 */
export class SpeechQueue {
  /** Synthesis already launched, in the order the sentences were said. */
  private pending: Array<Promise<string | null>> = []
  private playing = false
  private stopped = false
  private player: ReturnType<typeof createAudioPlayer> | null = null

  constructor(private readonly onSpeakingChange: (speaking: boolean) => void) {}

  /**
   * Hands a sentence over, and starts making its audio straight away.
   *
   * Synthesis begins here rather than at playback time: waiting for the
   * previous sentence to finish before even asking for the next one would put
   * a second of silence between every sentence.
   */
  push(text: string): void {
    const sentence = text.trim()
    if (this.stopped || sentence.length === 0) {
      return
    }
    // The promise is stored, not awaited: the order of the array is the order
    // of speech, whatever order the answers come back in.
    this.pending.push(speak(sentence).catch(() => null))
    void this.drain()
  }

  /**
   * Cuts the voice and forgets what was queued.
   *
   * Used when the buyer mutes, leaves, or when the server takes back what it
   * had started saying: finishing a sentence that no longer holds would be
   * worse than silence.
   */
  stop(): void {
    this.stopped = true
    this.pending = []
    this.player?.remove()
    this.player = null
    this.playing = false
    this.onSpeakingChange(false)
  }

  /** Ready for the next turn after a `stop`. */
  reset(): void {
    this.stop()
    this.stopped = false
  }

  /** Plays what is ready, one sentence at a time, never two at once. */
  private async drain(): Promise<void> {
    if (this.playing) {
      return
    }
    this.playing = true

    try {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true })
    }
    catch {
      // A device that refuses the audio mode still shows the text.
    }

    while (this.pending.length > 0 && !this.stopped) {
      const uri = await this.pending.shift()
      if (uri === null || uri === undefined || this.stopped) {
        continue
      }
      await this.playOne(uri)
    }

    this.playing = false
    if (!this.stopped) {
      this.onSpeakingChange(false)
    }
  }

  /** One file, from its first sound to its last. */
  private playOne(uri: string): Promise<void> {
    return new Promise((resolve) => {
      try {
        this.player?.remove()
        // A new player per sentence: an existing one does not reload when its
        // source changes, and the voice would simply never come out.
        const player = createAudioPlayer({ uri })
        this.player = player

        let settled = false
        const finish = (): void => {
          if (settled) {
            return
          }
          settled = true
          discardSpoken(uri)
          resolve()
        }

        player.addListener('playbackStatusUpdate', (status) => {
          this.onSpeakingChange(status.playing)
          if (status.didJustFinish) {
            finish()
          }
        })

        player.play()
      }
      catch {
        // A sentence that will not play must not hold up the ones behind it.
        discardSpoken(uri)
        resolve()
      }
    })
  }
}
