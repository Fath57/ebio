import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio'
import { useEffect, useRef } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'

interface MediaPlayerProps {
  format: 'VIDEO' | 'AUDIO'
  uri: string
  title: string
  onPlaybackComplete?: () => void
}

const SEEK_STEP_SEC = 15

function formatTime(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds))
  const min = Math.floor(totalSeconds / 60)
  const sec = totalSeconds % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

/** Audio branch: expo-audio player with play/pause and 15 s seek buttons. */
function AudioPlayerView({ uri, title, onPlaybackComplete }: Omit<MediaPlayerProps, 'format'>) {
  const player = useAudioPlayer({ uri }, { updateInterval: 500 })
  const status = useAudioPlayerStatus(player)
  const onCompleteRef = useRef(onPlaybackComplete)
  onCompleteRef.current = onPlaybackComplete

  useEffect(() => {
    if (status.didJustFinish)
      onCompleteRef.current?.()
  }, [status.didJustFinish])

  function handleTogglePlay(): void {
    if (status.playing)
      player.pause()
    else
      player.play()
  }

  function handleSeek(direction: 'forward' | 'backward'): void {
    const delta = direction === 'forward' ? SEEK_STEP_SEC : -SEEK_STEP_SEC
    const next = Math.max(0, Math.min(status.currentTime + delta, status.duration))
    player.seekTo(next).catch(() => {
      // Not loaded yet
    })
  }

  const progressPercent = status.duration > 0 ? (status.currentTime / status.duration) * 100 : 0

  return (
    <View style={styles.container}>
      <View style={styles.audioVisual}>
        <View style={styles.audioCircle}>
          <Text style={styles.audioIcon}>A</Text>
        </View>
        <Text style={styles.audioTitle}>{title}</Text>
      </View>

      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
        </View>
        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{formatTime(status.currentTime)}</Text>
          <Text style={styles.timeText}>{formatTime(status.duration)}</Text>
        </View>
      </View>

      <View style={styles.controlsRow}>
        <TouchableOpacity
          style={styles.seekButton}
          onPress={() => handleSeek('backward')}
          accessibilityRole="button"
          accessibilityLabel="Reculer de 15 secondes"
        >
          <Text style={styles.seekText}>-15s</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.playButton}
          onPress={handleTogglePlay}
          accessibilityRole="button"
          accessibilityLabel={status.playing ? 'Pause' : 'Lecture'}
        >
          <Text style={styles.playButtonText}>{status.playing ? 'II' : '|>'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.seekButton}
          onPress={() => handleSeek('forward')}
          accessibilityRole="button"
          accessibilityLabel="Avancer de 15 secondes"
        >
          <Text style={styles.seekText}>+15s</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

/**
 * Video branch: the legacy AV video component is retired and `expo-video` is not part of the build,
 * so the video plays inline through the system player inside a WebView.
 */
function VideoPlayerView({ uri, title }: Omit<MediaPlayerProps, 'format'>) {
  return (
    <View style={styles.container}>
      <WebView
        source={{ uri }}
        style={styles.video}
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction
        accessibilityLabel={`Vidéo : ${title}`}
      />
    </View>
  )
}

export function MediaPlayer({ format, uri, title, onPlaybackComplete }: MediaPlayerProps) {
  if (format === 'VIDEO')
    return <VideoPlayerView uri={uri} title={title} />
  return <AudioPlayerView uri={uri} title={title} onPlaybackComplete={onPlaybackComplete} />
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
