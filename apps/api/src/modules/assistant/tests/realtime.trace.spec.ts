import type { EntityManager } from '@mikro-orm/postgresql'
import { Buffer } from 'node:buffer'
import { Logger } from '@nestjs/common'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { addLevels, formatDbfs, measureLevel, rmsDbfs, toDbfs } from '../realtime/realtime.audio-level'
import { RealtimeSession } from '../realtime/realtime.session'

function pcm(samples: number[]): Buffer {
  const buffer = Buffer.alloc(samples.length * 2)
  samples.forEach((sample, index) => buffer.writeInt16LE(sample, index * 2))
  return buffer
}

function base64Pcm(samples: number[]): string {
  return pcm(samples).toString('base64')
}

function newSession() {
  const session = new RealtimeSession(
    {} as EntityManager,
    [],
    { buyerId: 'buyer', sessionId: '12345678-aaaa-bbbb-cccc-000000000000' },
    'instructions',
    'voice',
    vi.fn(),
  )
  const internals = session as unknown as { receive: (raw: Buffer) => void, settle: () => Promise<void> }
  // Running the tools needs a database, and only the trace is under test.
  internals.settle = vi.fn().mockResolvedValue(undefined)
  const receive = (event: Record<string, unknown>) => internals.receive(Buffer.from(JSON.stringify(event)))
  return { session, receive }
}

describe('audio level', () => {
  it('finds the peak and the energy of a slice, ignoring an odd trailing byte', () => {
    const level = measureLevel(Buffer.concat([pcm([100, -300]), Buffer.from([7])]))
    expect(level).toEqual({ peak: 300, energy: 100_000, samples: 2 })
  })

  it('adds slices together', () => {
    const total = addLevels(measureLevel(pcm([100])), measureLevel(pcm([-300])))
    expect(total).toEqual({ peak: 300, energy: 100_000, samples: 2 })
  })

  it('reads full scale as 0 dBFS and says when there is nothing at all', () => {
    expect(toDbfs(32_768)).toBeCloseTo(0)
    expect(rmsDbfs(measureLevel(pcm([0, 0])))).toBe(Number.NEGATIVE_INFINITY)
    expect(formatDbfs(toDbfs(0))).toBe('silence absolu')
  })
})

describe('realtime session trace', () => {
  afterEach(() => vi.restoreAllMocks())

  it('says nothing was received when the phone sent no sound', () => {
    const { session } = newSession()
    expect(session.summary()).toContain('aucun son reçu du téléphone')
  })

  it('tells a silent microphone from a dead line', () => {
    const { session } = newSession()
    session.appendAudio(base64Pcm([0, 1, -1, 0]))
    expect(session.summary()).toContain('le micro ne capte rien')
  })

  it('tells sound lost on a closed line from sound the provider never recognised', () => {
    const { session } = newSession()
    session.appendAudio(base64Pcm([12_000, -12_000]))
    expect(session.summary()).toContain('son perdu')
  })

  it('logs a failed response, which carries no usage and would otherwise leave no trace', () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    const { session, receive } = newSession()
    session.appendAudio(base64Pcm([12_000, -12_000]))
    receive({ type: 'input_audio_buffer.speech_started' })

    const details = { type: 'failed', error: { code: 'insufficient_quota' } }
    receive({ type: 'response.done', response: { status: 'failed', status_details: details } })

    expect(error).toHaveBeenCalledWith(expect.stringContaining('insufficient_quota'))
    expect(session.summary()).toContain('réponses refusées par le fournisseur')
  })

  it('never writes what the buyer said', () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
    const { session, receive } = newSession()
    receive({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'deux kilos de tomates' })

    const written = [...log.mock.calls.flat(), session.summary()].join(' ')
    expect(written).not.toContain('tomates')
    expect(written).toContain('21 caractères')
  })
})
