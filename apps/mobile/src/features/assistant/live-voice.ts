import type { ExpoPlayAudioStream, RecordingConfig, Subscription } from '@mykin-ai/expo-audio-stream'
import type { AssistantCartLine } from './assistant'
import { requireOptionalNativeModule } from 'expo-modules-core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { apiUrl, getChatToken } from '../../utils/api-client'

/**
 * The microphone and loudspeaker, loaded only once we know they are there.
 *
 * The library reaches for its native half the moment it is imported, and a
 * binary built before it was added has no native half — that is a startup
 * crash, not a caught error, because the failure is in evaluating the module
 * graph and by then we have already let it begin. So the native side is asked
 * for first, and the import only happens if it answers.
 *
 * A build without it keeps the typed conversation, which needs nothing native.
 */
async function audio(): Promise<typeof ExpoPlayAudioStream | null> {
  if (requireOptionalNativeModule('ExpoPlayAudioStream') === null) {
    return null
  }
  const loaded = await import('@mykin-ai/expo-audio-stream')
  return loaded.ExpoPlayAudioStream
}

/**
 * Where the spoken conversation is held.
 *
 * Same host as the rest of the API — it is the same server. The dedicated
 * variable is what the chat already uses; falling back to the API's own
 * address keeps a development machine working when only that one is set.
 */
const WS_URL = process.env.EXPO_PUBLIC_WS_URL ?? apiUrl()

/**
 * The line is open in both directions at once.
 *
 * `off` — nothing running. `opening` — the far end is being reached.
 * `listening` — the microphone is live and nobody has said anything yet.
 * `thinking` — the buyer has stopped and an answer is being composed.
 * `answering` — she is talking, and can be cut off mid-word.
 */
export type LineState = 'off' | 'opening' | 'listening' | 'thinking' | 'answering'

/**
 * The only rate the far end accepts, in either direction — it refuses 16 000
 * for being too low and 48 000 for being too high, in those words.
 */
const WIRE_RATE = 24_000

/**
 * What the microphone actually runs at.
 *
 * The recorder allows exactly three rates and 24 000 is not among them, so we
 * take the one that divides into it: every pair of samples becomes one, which
 * is an honest halving rather than a resampling, and averaging the pair does
 * the low-pass that dropping one of them would skip.
 */
const RECORD_RATE = 48_000 as NonNullable<RecordingConfig['sampleRate']>

/** Base64, decoded by hand: nothing in the bundle does it, and this runs ten times a second. */
const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const B64_INDEX = new Uint8Array(128)
for (let i = 0; i < B64_ALPHABET.length; i += 1) {
  B64_INDEX[B64_ALPHABET.charCodeAt(i)] = i
}

/**
 * One slice of 48 kHz sound, halved to 24 kHz, as raw bytes.
 *
 * The recorder hands over base64; the socket takes bytes. Between the two the
 * sample pairs are averaged — so the decode that has to happen anyway is the
 * only pass over the data, and nothing is encoded again on the way out.
 */
function halve(base64: string): ArrayBuffer {
  let end = base64.length
  while (end > 0 && base64.charCodeAt(end - 1) === 61) {
    end -= 1
  }

  const bytes = new Uint8Array((end * 3) >> 2)
  let written = 0
  let buffer = 0
  let bits = 0
  for (let i = 0; i < end; i += 1) {
    buffer = (buffer << 6) | B64_INDEX[base64.charCodeAt(i)]
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes[written] = (buffer >> bits) & 0xFF
      written += 1
    }
  }

  const pairs = written >> 2
  const halved = new Int16Array(pairs)
  for (let i = 0; i < pairs; i += 1) {
    const at = i << 2
    // Little-endian, sign-extended: the top bit is a sign, not a loud sample.
    const first = ((bytes[at + 1] << 8) | bytes[at]) << 16 >> 16
    const second = ((bytes[at + 3] << 8) | bytes[at + 2]) << 16 >> 16
    halved[i] = (first + second) >> 1
  }
  return halved.buffer
}

/** A tenth of a second of sound per message: short enough not to be heard as lag. */
const SLICE_MS = 100

interface LiveVoiceOptions {
  /** What the buyer was heard to say — worth showing, transcription being fallible. */
  onHeard?: (text: string) => void
  /** Her answer, once she has finished saying it. */
  onSaid?: (text: string) => void
  /** The basket as the database holds it, after her tools have run. */
  onCart?: (cart: AssistantCartLine[]) => void
}

interface LiveVoice {
  state: LineState
  /** What she is saying, as she says it. */
  said: string
  error: string | null
  open: () => void
  close: () => void
  /** Make her stop talking, now. */
  hush: () => void
}

/** What the far end sends us. Narrowed on arrival: it crosses a network. */
interface Incoming {
  type: string
  chunk?: string
  text?: string
  message?: string
  cart?: AssistantCartLine[]
}

/**
 * A spoken conversation with her, held open.
 *
 * Nothing here decides when the buyer has finished talking. That was the old
 * way — count milliseconds of silence, stop the recorder, upload a file — and
 * it cut people off in the middle of « deux kilos de… euh… tomates ». The
 * microphone now simply stays open and the far end judges by meaning, which is
 * both better at it and closer to the ear: around 200 ms to notice the end of
 * a sentence, against a second and a half of deliberate waiting.
 *
 * Her sound is played as it arrives, a tenth of a second at a time, so she
 * starts speaking before she has finished composing.
 */
export function useLiveVoice({ onHeard, onSaid, onCart }: LiveVoiceOptions): LiveVoice {
  const [state, setState] = useState<LineState>('off')
  const [said, setSaid] = useState('')
  const [error, setError] = useState<string | null>(null)

  const socketRef = useRef<ReturnType<typeof io> | null>(null)
  /**
   * The sound library, once loaded.
   *
   * Held for the life of the line rather than asked for at each use: a tenth
   * of a second of her voice arrives ten times a second, and that path has no
   * business awaiting anything.
   */
  const player = useRef<typeof ExpoPlayAudioStream | null>(null)
  const micOn = useRef(false)
  /**
   * The microphone listener, held so it can be released.
   *
   * Left behind, one accumulates per opened conversation, and by the third the
   * same tenth of a second is sent three times.
   */
  const micTap = useRef<Subscription | null>(null)
  /**
   * Which answer is being played.
   *
   * Everything queued for playback is filed under this, so cutting her off is
   * one call rather than a hunt through what has already been handed to the
   * loudspeaker. It changes at every turn.
   */
  const turn = useRef(0)
  /** What she has said this turn, kept outside state so `done` can report it whole. */
  const saidSoFar = useRef('')
  /** Guards against a late callback touching a screen that has gone. */
  const alive = useRef(true)
  /**
   * When the loudspeaker will have finished, in milliseconds.
   *
   * The microphone says nothing while she talks. The phone already opens it on
   * the voice-communication path with the hardware echo canceller attached,
   * and it is still not enough: a loudspeaker at arm's length gets heard, the
   * far end writes her own words down as the buyer's, and she answers herself
   * — which is exactly what the screen showed, « C'est nous. », « J'écoute. »,
   * in the buyer's bubbles.
   *
   * Counted from the sound itself rather than waited for as an event: each
   * slice is so many bytes of 24 kHz, so we know to the millisecond when the
   * queue runs dry. A lost slice shortens the wait instead of muting her
   * conversation partner forever.
   */
  const quietUntil = useRef(0)

  const stopEverything = useCallback(async () => {
    const socket = socketRef.current
    socketRef.current = null
    socket?.removeAllListeners()
    socket?.disconnect()

    micTap.current?.remove()
    micTap.current = null

    if (micOn.current) {
      micOn.current = false
      try {
        await player.current?.stopMicrophone()
      }
      catch {
        // Already stopped, or never started. Either way there is nothing to do.
      }
    }
    try {
      await player.current?.stopAudio()
    }
    catch {
      // Same: silence is the desired end state, however we get there.
    }
  }, [])

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      void stopEverything()
    }
  }, [stopEverything])

  /** Throw away whatever she was still about to say. */
  const drop = useCallback(async () => {
    const dropped = turn.current
    turn.current += 1
    saidSoFar.current = ''
    // She has been cut off, so the loudspeaker falls silent now and the
    // microphone has no reason to keep waiting for her.
    quietUntil.current = 0
    try {
      await player.current?.clearPlaybackQueueByTurnId(String(dropped))
      await player.current?.stopAudio()
    }
    catch {
      // Nothing was playing.
    }
  }, [])

  const hush = useCallback(() => {
    socketRef.current?.emit('voice', { type: 'interrupt' })
    void drop()
    if (alive.current) {
      setState('listening')
    }
  }, [drop])

  const open = useCallback(() => {
    if (socketRef.current) {
      return
    }
    setError(null)
    setSaid('')
    setState('opening')

    async function connect(): Promise<void> {
      player.current = await audio()
      if (player.current === null) {
        if (alive.current) {
          setError('Cette version de l\'application ne sait pas encore parler. Écrivez-lui en attendant la mise à jour.')
          setState('off')
        }
        return
      }

      // Asked for before anything else is set up. Android grants nothing by
      // declaring a permission in the manifest: without this the microphone
      // opens onto silence, and a conversation in which one is never heard is
      // harder to diagnose than one that says plainly it may not listen.
      try {
        const allowed = await player.current.requestPermissionsAsync()
        if (!allowed.granted) {
          if (alive.current) {
            setError(allowed.canAskAgain === false
              ? 'Le micro est refusé pour eBio. Autorisez-le dans les réglages du téléphone.'
              : 'Sans le micro, elle ne peut pas vous entendre.')
            setState('off')
          }
          return
        }
      }
      catch {
        if (alive.current) {
          setError('Le micro n\'est pas disponible sur cet appareil.')
          setState('off')
        }
        return
      }

      const token = await getChatToken()
      if (!token) {
        if (alive.current) {
          setError('Connexion impossible. Reconnectez-vous puis réessayez.')
          setState('off')
        }
        return
      }

      // Her voice and the microphone are live at the same time, so the far end
      // must not hear itself: conversation mode is what turns on the phone's
      // echo cancellation.
      try {
        await player.current.setSoundConfig({
          // Playback has no such restriction — it takes the rate it is given.
          sampleRate: WIRE_RATE as NonNullable<RecordingConfig['sampleRate']>,
          playbackMode: 'conversation',
        })
      }
      catch (caught) {
        // Said out loud rather than swallowed: refused, playback falls back to
        // 44 100 Hz and her voice comes out fast and high — a symptom one
        // would otherwise chase for a long time.
        console.warn('[voix] réglage du lecteur refusé', caught)
      }

      const socket = io(`${WS_URL}/ws/assistant`, {
        auth: { token },
        transports: ['websocket'],
      })
      socketRef.current = socket

      socket.on('connect_error', () => {
        if (alive.current) {
          setError('La conversation n\'a pas pu s\'ouvrir.')
          setState('off')
        }
        void stopEverything()
      })

      socket.on('event', (raw: Incoming) => {
        if (!alive.current) {
          return
        }
        switch (raw.type) {
          case 'ready':
            void listen()
            break

          // She has been cut off by the buyer. What is still queued is hers,
          // not the answer to what is being said now, so it goes.
          case 'speaking':
            void drop()
            setSaid('')
            setState('listening')
            break

          case 'thinking':
            setState('thinking')
            break

          case 'audio':
            if (raw.chunk) {
              // Base64 to bytes to seconds of 16-bit mono at 24 kHz.
              const seconds = ((raw.chunk.length * 3) / 4) / (24_000 * 2)
              quietUntil.current = Math.max(quietUntil.current, Date.now()) + seconds * 1000
              setState('answering')
              void player.current
                ?.playAudio(raw.chunk, String(turn.current), 'pcm_s16le')
                .catch(() => {
                  // One lost tenth of a second is not worth ending a
                  // conversation over.
                })
            }
            break

          case 'transcript':
            saidSoFar.current += raw.text ?? ''
            setSaid(saidSoFar.current)
            break

          case 'heard':
            onHeard?.(raw.text ?? '')
            break

          case 'cart':
            if (raw.cart) {
              onCart?.(raw.cart)
            }
            break

          case 'done':
            if (saidSoFar.current.trim()) {
              onSaid?.(saidSoFar.current.trim())
            }
            saidSoFar.current = ''
            turn.current += 1
            setState('listening')
            break

          case 'error':
            setError(raw.message ?? 'La conversation s\'est interrompue.')
            setState('off')
            void stopEverything()
            break

          default:
            break
        }
      })

      /**
       * Opens the microphone and keeps it open.
       *
       * The recorder runs at 48 kHz because it refuses the 24 kHz the far end
       * insists on, so each slice is halved on the way out — one pass over a
       * tenth of a second of sound, ten times a second.
       */
      async function listen(): Promise<void> {
        try {
          const { subscription } = await (player.current?.startMicrophone({
            sampleRate: RECORD_RATE,
            channels: 1,
            encoding: 'pcm_16bit',
            interval: SLICE_MS,
            onAudioStream: async (event) => {
              // A quarter second of margin: the last of her voice leaves the
              // loudspeaker after the queue is empty, and the room keeps a
              // little of it.
              if (Date.now() < quietUntil.current + 250) {
                return
              }
              if (typeof event.data === 'string') {
                socketRef.current?.emit('voice', { type: 'audio', chunk: halve(event.data) })
              }
            },
          }) ?? { subscription: undefined })
          micTap.current = subscription ?? null
          micOn.current = true
          if (alive.current) {
            setState('listening')
          }
        }
        catch {
          if (alive.current) {
            setError('Le micro n\'est pas disponible sur cet appareil.')
            setState('off')
          }
          void stopEverything()
        }
      }
    }

    void connect()
  }, [drop, onCart, onHeard, onSaid, stopEverything])

  const close = useCallback(() => {
    setState('off')
    setSaid('')
    saidSoFar.current = ''
    void stopEverything()
  }, [stopEverything])

  return { state, said, error, open, close, hush }
}
