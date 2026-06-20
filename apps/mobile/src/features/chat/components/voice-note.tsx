import { Audio } from 'expo-av'
import * as React from 'react'
import { useCallback, useRef, useState } from 'react'
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { appAlert } from '../../common/components/app-alert'

interface VoiceNoteRecorderProps {
  onSend: (uri: string, durationMs: number) => void
}

export function VoiceNoteRecorder({ onSend }: VoiceNoteRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const recordingRef = useRef<Audio.Recording | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const handlePressIn = useCallback(async () => {
    try {
      const permission = await Audio.requestPermissionsAsync()
      if (!permission.granted) {
        appAlert(
          'Permission refusée',
          'L’accès au microphone est requis pour les notes vocales.',
        )
        return
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      })

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      )
      recordingRef.current = recording
      setIsRecording(true)
      setDuration(0)

      intervalRef.current = setInterval(() => {
        setDuration(prev => prev + 1)
      }, 1000)
    }
    catch {
      appAlert('Erreur', 'Impossible de démarrer l\u2019enregistrement.')
    }
  }, [])

  const handlePressOut = useCallback(async () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setIsRecording(false)

    const recording = recordingRef.current
    if (!recording)
      return
    recordingRef.current = null

    try {
      await recording.stopAndUnloadAsync()
      const uri = recording.getURI()
      const status = await recording.getStatusAsync()
      if (uri) {
        onSend(uri, status.durationMillis ?? 0)
      }
    }
    catch {
      // Silently fail
    }
  }, [onSend])

  function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <TouchableOpacity
      style={[styles.recordButton, isRecording && styles.recordButtonActive]}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={
        isRecording ? 'Relâchez pour envoyer' : 'Maintenez pour enregistrer'
      }
    >
      <Text style={styles.recordIcon}>
        {isRecording ? '\u23F9' : '\uD83C\uDF99'}
      </Text>
      {isRecording && (
        <Text style={styles.durationText}>{formatDuration(duration)}</Text>
      )}
    </TouchableOpacity>
  )
}

interface VoiceNotePlayerProps {
  uri: string
  durationMs: number
}

export function VoiceNotePlayer({ uri, durationMs }: VoiceNotePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const soundRef = useRef<Audio.Sound | null>(null)

  const handleTogglePlay = useCallback(async () => {
    if (isPlaying && soundRef.current) {
      await soundRef.current.pauseAsync()
      setIsPlaying(false)
      return
    }

    try {
      if (!soundRef.current) {
        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: true },
          (status) => {
            if (status.isLoaded) {
              if (status.durationMillis && status.durationMillis > 0) {
                setProgress(status.positionMillis / status.durationMillis)
              }
              if (status.didJustFinish) {
                setIsPlaying(false)
                setProgress(0)
                soundRef.current?.unloadAsync()
                soundRef.current = null
              }
            }
          },
        )
        soundRef.current = sound
      }
      else {
        await soundRef.current.playAsync()
      }
      setIsPlaying(true)
    }
    catch {
      appAlert('Erreur', 'Impossible de lire la note vocale.')
    }
  }, [isPlaying, uri])

  function formatDurationMs(ms: number): string {
    const totalSec = Math.round(ms / 1000)
    const m = Math.floor(totalSec / 60)
    const s = totalSec % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <View style={playerStyles.container}>
      <TouchableOpacity
        style={playerStyles.playButton}
        onPress={handleTogglePlay}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? 'Pause' : 'Lire la note vocale'}
      >
        <Text style={playerStyles.playIcon}>
          {isPlaying ? '\u23F8' : '\u25B6'}
        </Text>
      </TouchableOpacity>

      <View style={playerStyles.waveformContainer}>
        <View style={playerStyles.waveformTrack}>
          <View
            style={[
              playerStyles.waveformProgress,
              { width: `${Math.round(progress * 100)}%` },
            ]}
          />
        </View>
      </View>

      <Text style={playerStyles.duration}>
        {formatDurationMs(durationMs)}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  recordButton: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[1],
    borderRadius: radius.pill,
    backgroundColor: colors.neutral[100],
    paddingHorizontal: spacing[3],
  },
  recordButtonActive: {
    backgroundColor: colors.coral[100],
  },
  recordIcon: {
    fontSize: 20,
  },
  durationText: {
    ...typography.caption,
    color: colors.coral[600],
    fontFamily: fonts.mono,
  },
})

const playerStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    backgroundColor: colors.neutral[50],
    borderRadius: radius.lg,
    minWidth: 180,
  },
  playButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.green[400],
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    fontSize: 14,
    color: colors.neutral[0],
  },
  waveformContainer: {
    flex: 1,
    height: 20,
    justifyContent: 'center',
  },
  waveformTrack: {
    height: 4,
    backgroundColor: colors.neutral[200],
    borderRadius: 2,
    overflow: 'hidden',
  },
  waveformProgress: {
    height: 4,
    backgroundColor: colors.green[400],
    borderRadius: 2,
  },
  duration: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.neutral[600],
  },
})
