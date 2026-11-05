import type { Buffer } from 'node:buffer'

/** Full scale of a signed 16-bit sample. */
const FULL_SCALE = 32_768

/** Below this peak, in dBFS, a microphone is not picking up a voice at all. */
export const SILENCE_PEAK_DBFS = -50

export interface AudioLevel {
  peak: number
  /** Sum of squared samples, kept raw so several slices can be added together. */
  energy: number
  samples: number
}

export const EMPTY_LEVEL: AudioLevel = { peak: 0, energy: 0, samples: 0 }

/** How loud a slice of 16-bit little-endian PCM is. A trailing odd byte is ignored. */
export function measureLevel(pcm: Buffer): AudioLevel {
  const samples = Math.floor(pcm.length / 2)
  let peak = 0
  let energy = 0

  for (let i = 0; i < samples; i += 1) {
    const sample = pcm.readInt16LE(i * 2)
    peak = Math.max(peak, Math.abs(sample))
    energy += sample * sample
  }

  return { peak, energy, samples }
}

export function addLevels(a: AudioLevel, b: AudioLevel): AudioLevel {
  return { peak: Math.max(a.peak, b.peak), energy: a.energy + b.energy, samples: a.samples + b.samples }
}

/** Decibels relative to full scale; digital silence is minus infinity. */
export function toDbfs(amplitude: number): number {
  return amplitude <= 0 ? Number.NEGATIVE_INFINITY : 20 * Math.log10(amplitude / FULL_SCALE)
}

/** The average level of what was measured, in dBFS. */
export function rmsDbfs(level: AudioLevel): number {
  return level.samples === 0 ? Number.NEGATIVE_INFINITY : toDbfs(Math.sqrt(level.energy / level.samples))
}

export function formatDbfs(value: number): string {
  return Number.isFinite(value) ? `${value.toFixed(1)} dBFS` : 'silence absolu'
}
