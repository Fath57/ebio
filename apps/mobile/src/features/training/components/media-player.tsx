import type { AVPlaybackStatus } from 'expo-av'
import { Audio, Video as ExpoVideo, ResizeMode } from 'expo-av'
import * as React from 'react'
import { useCallback, useRef, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'

// eslint-disable-next-line ts/no-explicit-any
const Video = ExpoVideo as any

interface MediaPlayerProps {
  format: 'VIDEO' | 'AUDIO'
  uri: string
  title: string
  onPlaybackComplete?: () => void
}

export function MediaPlayer({
  format,
  uri,
  title,
  onPlaybackComplete,
}: MediaPlayerProps) {
  const videoRef = useRef<typeof Video>(null)
  const soundRef = useRef<Audio.Sound | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [positionMs, setPositionMs] = useState(0)
  const [durationMs, setDurationMs] = useState(0)

  function formatTime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000)
    const min = Math.floor(totalSeconds / 60)
    const sec = totalSeconds % 60
    return `${min}:${sec.toString().padStart(2, '0')}`
  }

  const handlePlaybackStatusUpdate = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded)
        return

      setIsPlaying(status.isPlaying)
      setPositionMs(status.positionMillis)
      setDurationMs(status.durationMillis ?? 0)

      if (status.didJustFinish) {
        onPlaybackComplete?.()
      }
    },
    [onPlaybackComplete],
  )

  async function handleTogglePlay(): Promise<void> {
    if (format === 'VIDEO') {
      if (!videoRef.current)
        return
      if (isPlaying) {
        await videoRef.current.pauseAsync()
      }
      else {
        await videoRef.current.playAsync()
      }
    }
    else {
      if (isPlaying && soundRef.current) {
        await soundRef.current.pauseAsync()
      }
      else if (soundRef.current) {
        await soundRef.current.playAsync()
      }
      else {
        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: true },
          handlePlaybackStatusUpdate,
        )
        soundRef.current = sound
      }
    }
  }

  async function handleSeek(direction: 'forward' | 'backward'): Promise<void> {
    const seekMs = direction === 'forward' ? 15000 : -15000
    const newPosition = Math.max(0, Math.min(positionMs + seekMs, durationMs))

    if (format === 'VIDEO' && videoRef.current) {
      await videoRef.current.setPositionAsync(newPosition)
    }
    else if (soundRef.current) {
      await soundRef.current.setPositionAsync(newPosition)
    }
  }

  const progressPercent = durationMs > 0 ? (positionMs / durationMs) * 100 : 0

  return (
    <View style={styles.container}>
      {format === 'VIDEO'
        ? (
            <Video
              ref={videoRef}
              source={{ uri }}
              style={styles.video}
              resizeMode={ResizeMode.CONTAIN}
              onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
              useNativeControls={false}
            />
          )
        : (
            <View style={styles.audioVisual}>
              <View style={styles.audioCircle}>
                <Text style={styles.audioIcon}>A</Text>
              </View>
              <Text style={styles.audioTitle}>{title}</Text>
            </View>
          )}

      {/* Progress bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View
            style={[styles.progressFill, { width: `${progressPercent}%` }]}
          />
        </View>
        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{formatTime(positionMs)}</Text>
          <Text style={styles.timeText}>{formatTime(durationMs)}</Text>
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controlsRow}>
        <TouchableOpacity
          style={styles.seekButton}
          onPress={() => handleSeek('backward')}
          accessibilityLabel="Reculer de 15 secondes"
        >
          <Text style={styles.seekText}>-15s</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.playButton}
          onPress={handleTogglePlay}
          accessibilityLabel={isPlaying ? 'Pause' : 'Lecture'}
        >
          <Text style={styles.playButtonText}>
            {isPlaying ? 'II' : '|>'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.seekButton}
          onPress={() => handleSeek('forward')}
          accessibilityLabel="Avancer de 15 secondes"
        >
          <Text style={styles.seekText}>+15s</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.neutral[900],
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  video: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: colors.neutral[900],
  },
  audioVisual: {
    paddingVertical: spacing[8],
    alignItems: 'center',
    gap: spacing[3],
    backgroundColor: colors.neutral[800],
  },
  audioCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.green[400],
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioIcon: {
    fontFamily: fonts.sansBd,
    fontSize: 32,
    color: colors.neutral[0],
  },
  audioTitle: {
    ...typography.h3,
    color: colors.neutral[0],
    textAlign: 'center',
    paddingHorizontal: spacing[4],
  },
  progressContainer: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
  },
  progressBar: {
    height: 4,
    backgroundColor: colors.neutral[600],
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.green[400],
    borderRadius: radius.pill,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing[1],
  },
  timeText: {
    ...typography.caption,
    color: colors.neutral[400],
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing[6],
    paddingVertical: spacing[4],
  },
  seekButton: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  seekText: {
    fontFamily: fonts.sansMd,
    fontSize: 14,
    color: colors.neutral[200],
  },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.green[400],
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButtonText: {
    fontFamily: fonts.sansBd,
    fontSize: 20,
    color: colors.neutral[0],
  },
})
