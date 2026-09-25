/**
 * What crosses the wire between the phone and us during a spoken exchange.
 *
 * Kept deliberately small. The phone holds the microphone open and sends what
 * it hears; everything else — deciding that a sentence has ended, the model,
 * the tools, the grounding — happens on this side, as it always has.
 */

/**
 * Sent by the phone.
 *
 * - `audio` carries a slice of microphone sound: PCM 16-bit, 24 kHz, mono. It
 *   arrives continuously, for as long as the screen is open, and as raw bytes
 *   rather than base64 — the phone already spends a decode per slice halving
 *   48 kHz down to the only rate the far end accepts, and socket.io carries
 *   binary perfectly well. A string is still read, for anything that sends one.
 * - `interrupt` says the buyer wants her to stop talking now — a tap on the
 *   button, not a word spoken over her. Speaking over her is noticed by the
 *   far end on its own.
 *
 * There is no « I have finished » message, on purpose: a buyer who says
 * « deux kilos de… euh… tomates » has not finished, and a phone counting
 * milliseconds of silence cannot tell.
 */
export type RealtimeInbound
  = | { type: 'audio', chunk: string | ArrayBufferLike }
    | { type: 'interrupt' }

/**
 * Sent to the phone.
 *
 * - `audio` is a slice of the answer, in the same format as the input.
 * - `transcript` is what she is saying, so the screen can show it.
 * - `heard` is what the buyer was heard to say: a transcription gets things
 *   wrong, and that has to be visible before it becomes an order.
 * - `cart` is the basket as the database holds it, once the tools have run.
 * - `ready` says the far end is listening. Sound sent before it is kept, not
 *   dropped, but the screen has no business saying « parlez » any earlier.
 * - `speaking` says the buyer has started talking. The phone drops whatever it
 *   was still playing: she has been cut off, and finishing her sentence into
 *   the buyer's would be the rudeness we are trying to avoid.
 * - `thinking` says the buyer has stopped and an answer is being composed.
 */
export type RealtimeOutbound
  = | { type: 'ready' }
    | { type: 'speaking' }
    | { type: 'thinking' }
    | { type: 'audio', chunk: string }
    | { type: 'transcript', text: string }
    | { type: 'heard', text: string }
    | { type: 'cart', cart: unknown }
    | { type: 'done' }
    | { type: 'error', message: string }

/** The audio format both ends agree on, and the only one either sends. */
export const REALTIME_AUDIO = {
  format: 'pcm16',
  sampleRate: 24_000,
  channels: 1,
} as const
