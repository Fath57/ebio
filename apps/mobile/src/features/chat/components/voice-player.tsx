import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio'
import Pause from 'lucide-react-native/dist/esm/icons/pause'
import Play from 'lucide-react-native/dist/esm/icons/play'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'

export type VoiceTint = 'own' | 'peer'

interface VoiceNotePlayerProps {
  uri: string
  durationMs: number
  /** `own` for the sender's green bubble, `peer` for the white card bubble. */
  tint?: VoiceTint
  /** Stable seed for the pseudo-waveform (signed URLs change, the media id does not). */
  seed?: string
}

const BAR_COUNT = 28
const PLAYBACK_RATES = [1, 1.5, 2] as const
const LOAD_TIMEOUT_MS = 8000

/** Formats a duration in milliseconds as `m:ss`. */
export function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// Only one voice note plays at a time: the registry pauses the previous player
// when another one starts (WhatsApp behaviour).
let currentlyPlaying: { id: number, pause: () => void } | null = null
let nextPlayerId = 1

function registerPlaying(id: number, pause: () => void): void {
  if (currentlyPlaying && currentlyPlaying.id !== id)
    currentlyPlaying.pause()
  currentlyPlaying = { id, pause }
}

function unregisterPlaying(id: number): void {
  if (currentlyPlaying?.id === id)
    currentlyPlaying = null
}

/** Deterministic pseudo-waveform heights (px) derived from a string hash. */
function buildBars(seed: string): number[] {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const bars: number[] = []
  let s = h >>> 0
  for (let i = 0; i < BAR_COUNT; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    bars.push(4 + ((s >>> 24) % 20))
  }
  return bars
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function formatRate(rate: number): string {
  return `${rate.toString().replace('.', ',')}×`
}

export function VoiceNotePlayer({ uri, durationMs, tint = 'peer', seed }: VoiceNotePlayerProps) {
  const { semantic } = useTheme()
  const idRef = useRef(nextPlayerId++)
  const player = useAudioPlayer({ uri }, { updateInterval: 250 })
  const status = useAudioPlayerStatus(player)
  const [rate, setRate] = useState<number>(1)
  const [error, setError] = useState(false)
  const [scrubFraction, setScrubFraction] = useState<number | null>(null)
  const [trackWidth, setTrackWidth] = useState(0)
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const bars = useMemo(() => buildBars(seed ?? uri), [seed, uri])

  const totalSec = status.duration > 0 ? status.duration : durationMs / 1000
  const isFinished = totalSec > 0 && status.currentTime >= totalSec - 0.05
  const fraction = scrubFraction ?? (totalSec > 0 ? clamp01(status.currentTime / totalSec) : 0)
  const showElapsed = status.playing || (status.currentTime > 0 && !isFinished)
  const clockMs = scrubFraction != null
    ? scrubFraction * totalSec * 1000
    : showElapsed
      ? status.currentTime * 1000
      : totalSec * 1000

  // Never loop: a voice note must stop at the end, not restart.
  useEffect(() => {
    player.loop = false
  }, [player])

  // End of playback. Order matters: pause() FIRST, then seekTo(0) — seeking a
  // player that is still in the playing state makes it restart from 0. The
  // `finishedHandledRef` guard makes sure a `didJustFinish` that stays true
  // across several status updates is handled once and never re-triggers play.
  const finishedHandledRef = useRef(false)
  useEffect(() => {
    if (!status.didJustFinish) {
      finishedHandledRef.current = false
      return
    }
    if (finishedHandledRef.current)
      return
    finishedHandledRef.current = true
    unregisterPlaying(idRef.current)
    try {
      player.pause()
      player.seekTo(0).catch(() => {
        // Player may already be released
      })
    }
    catch {
      // Player may already be released
    }
    // UI resets through the status: not playing → play icon, currentTime 0 → total duration
  }, [status.didJustFinish, player])

  useEffect(() => {
    const id = idRef.current
    return () => {
      unregisterPlaying(id)
      if (loadTimerRef.current)
        clearTimeout(loadTimerRef.current)
    }
  }, [])

  const handleTogglePlay = useCallback(async () => {
    if (status.playing) {
      player.pause()
      unregisterPlaying(idRef.current)
      return
    }
    try {
      registerPlaying(idRef.current, () => player.pause())
      if (isFinished)
        await player.seekTo(0)
      player.play()
      if (!player.isLoaded && !loadTimerRef.current) {
        loadTimerRef.current = setTimeout(() => {
          loadTimerRef.current = null
          if (!player.isLoaded)
            setError(true)
        }, LOAD_TIMEOUT_MS)
      }
    }
    catch {
      setError(true)
    }
  }, [status.playing, isFinished, player])

  const handleCycleRate = useCallback(() => {
    const index = PLAYBACK_RATES.indexOf(rate as typeof PLAYBACK_RATES[number])
    const next = PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length]
    try {
      player.setPlaybackRate(next, 'medium')
      setRate(next)
    }
    catch {
      // Ignore: rate change is a nicety, playback keeps going
    }
  }, [rate, player])

  const seekRef = useRef({ trackWidth, totalSec, player })
  seekRef.current = { trackWidth, totalSec, player }
  const seekPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => seekRef.current.trackWidth > 0,
    onMoveShouldSetPanResponder: () => seekRef.current.trackWidth > 0,
    onPanResponderGrant: (evt) => {
      setScrubFraction(clamp01(evt.nativeEvent.locationX / seekRef.current.trackWidth))
    },
    onPanResponderMove: (evt) => {
      setScrubFraction(clamp01(evt.nativeEvent.locationX / seekRef.current.trackWidth))
    },
    onPanResponderRelease: (evt) => {
      const { trackWidth: width, totalSec: total, player: target } = seekRef.current
      const target01 = clamp01(evt.nativeEvent.locationX / width)
      setScrubFraction(null)
      if (total > 0) {
        target.seekTo(target01 * total).catch(() => {
          // Not loaded yet: ignore
        })
      }
    },
    onPanResponderTerminate: () => {
      setScrubFraction(null)
    },
  }), [])

  const palette = tint === 'own'
    ? {
        playBg: colors.neutral[0],
        playIcon: colors.green[600],
        barIdle: 'rgba(255,255,255,0.45)',
        barPlayed: colors.neutral[0],
        pillBg: 'rgba(255,255,255,0.22)',
        pillText: colors.neutral[0],
        time: 'rgba(255,255,255,0.85)',
      }
    : {
        playBg: colors.green[400],
        playIcon: colors.neutral[0],
        barIdle: semantic.borderNormal,
        barPlayed: colors.green[400],
        pillBg: semantic.bgSurface,
        pillText: semantic.textSecondary,
        time: semantic.textSecondary,
      }

  const playedCount = Math.round(fraction * BAR_COUNT)

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.playButton, { backgroundColor: palette.playBg }]}
        onPress={() => {
          void handleTogglePlay()
        }}
        disabled={error}
        accessibilityRole="button"
        accessibilityLabel={status.playing ? 'Mettre en pause' : 'Lire la note vocale'}
      >
        {status.playing
          ? <Pause size={16} color={palette.playIcon} fill={palette.playIcon} />
          : <Play size={16} color={palette.playIcon} fill={palette.playIcon} style={styles.playIcon} />}
      </TouchableOpacity>

      <View style={styles.body}>
        {error
          ? (
              <Text style={[styles.errorText, { color: palette.time }]}>Impossible de lire</Text>
            )
          : (
              <View
                style={styles.track}
                onLayout={e => setTrackWidth(e.nativeEvent.layout.width)}
                accessibilityRole="adjustable"
                accessibilityLabel="Position de lecture"
                accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }}
                {...seekPanResponder.panHandlers}
              >
                {bars.map((height, index) => (
                  <View
                    // eslint-disable-next-line react/no-array-index-key
                    key={index}
                    style={[
                      styles.bar,
                      { height, backgroundColor: index < playedCount ? palette.barPlayed : palette.barIdle },
                    ]}
                  />
                ))}
              </View>
            )}
        <View style={styles.footer}>
          <Text style={[styles.time, { color: palette.time }]}>{formatClock(clockMs)}</Text>
          {!error && (
            <TouchableOpacity
              onPress={handleCycleRate}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={[styles.ratePill, { backgroundColor: palette.pillBg }]}
              accessibilityRole="button"
              accessibilityLabel={`Vitesse de lecture ${formatRate(rate)}`}
            >
              <Text style={[styles.rateText, { color: palette.pillText }]}>{formatRate(rate)}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    minWidth: 200,
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    marginLeft: 2,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
  },
  // Compact bubble: the bars top out at 24 px; the hit area stays ≥ 32 px.
  track: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bar: {
    width: 3,
    borderRadius: radius.pill,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: -2,
  },
  time: {
    fontFamily: fonts.mono,
    fontSize: 11,
    lineHeight: 14,
  },
  ratePill: {
    paddingHorizontal: spacing[2],
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  rateText: {
    ...typography.caption,
    fontSize: 10,
    lineHeight: 13,
  },
  errorText: {
    ...typography.caption,
    paddingVertical: spacing[2],
  },
})
