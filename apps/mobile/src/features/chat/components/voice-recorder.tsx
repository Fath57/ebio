import {
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio'
import * as FileSystem from 'expo-file-system/legacy'
import * as Haptics from 'expo-haptics'
import ChevronUp from 'lucide-react-native/dist/esm/icons/chevron-up'
import Lock from 'lucide-react-native/dist/esm/icons/lock'
import Mic from 'lucide-react-native/dist/esm/icons/mic'
import Send from 'lucide-react-native/dist/esm/icons/send'
import Trash2 from 'lucide-react-native/dist/esm/icons/trash-2'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  AppState,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { appAlert } from '../../common/components/app-alert'
import { formatClock } from './voice-player'

export type VoiceRecorderStatus = 'idle' | 'recording' | 'locked'

interface VoiceNoteRecorderProps {
  onSend: (uri: string, durationMs: number) => void
  disabled?: boolean
  /** Lets the composer hide its text input while a recording is in progress. */
  onStatusChange?: (status: VoiceRecorderStatus) => void
}

type Phase = 'idle' | 'starting' | 'recording' | 'locked' | 'stopping'
type FinishMode = 'send' | 'cancel'
type Permission = 'unknown' | 'granted' | 'denied'

/** Horizontal drag (px, leftwards) that cancels the recording. */
const CANCEL_DX = -80
/** Vertical drag (px, upwards) that locks hands-free recording. */
const LOCK_DY = -60
const MIN_DURATION_MS = 1000
const MAX_DURATION_MS = 5 * 60 * 1000
const HINT_MS = 1600
const TIMER_POLL_MS = 200

function haptic(style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Medium): void {
  Haptics.impactAsync(style).catch(() => {
    // Haptics unavailable on this device
  })
}

function resetAudioMode(): void {
  setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {
    // Best effort
  })
}

function discardFile(uri: string | null): void {
  if (!uri)
    return
  FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {
    // Temp file may already be gone
  })
}

export function VoiceNoteRecorder({ onSend, disabled = false, onStatusChange }: VoiceNoteRecorderProps) {
  const { semantic } = useTheme()
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const recorderState = useAudioRecorderState(recorder, TIMER_POLL_MS)

  const [phase, setPhase] = useState<Phase>('idle')
  const [hintVisible, setHintVisible] = useState(false)

  const phaseRef = useRef<Phase>('idle')
  const permissionRef = useRef<Permission>('unknown')
  /** Release/cancel that happened while the recorder was still starting. */
  const pendingRef = useRef<FinishMode | null>(null)
  /** Set once the current gesture has been consumed (cancelled or locked). */
  const gestureDoneRef = useRef(false)
  /** A fresh press on the send slot while locked. */
  const lockedTapRef = useRef(false)
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onSendRef = useRef(onSend)
  onSendRef.current = onSend
  const onStatusChangeRef = useRef(onStatusChange)
  onStatusChangeRef.current = onStatusChange
  const disabledRef = useRef(disabled)
  disabledRef.current = disabled

  const dragX = useRef(new Animated.Value(0)).current
  const micScale = useRef(new Animated.Value(1)).current
  const pulse = useRef(new Animated.Value(1)).current
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null)

  const updatePhase = useCallback((next: Phase) => {
    phaseRef.current = next
    setPhase(next)
    const status: VoiceRecorderStatus = next === 'locked'
      ? 'locked'
      : next === 'idle'
        ? 'idle'
        : 'recording'
    onStatusChangeRef.current?.(status)
  }, [])

  const startPulse = useCallback(() => {
    pulseLoopRef.current?.stop()
    pulse.setValue(1)
    pulseLoopRef.current = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.2, duration: 500, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]))
    pulseLoopRef.current.start()
    Animated.spring(micScale, { toValue: 1.3, useNativeDriver: true, friction: 5 }).start()
  }, [pulse, micScale])

  const stopPulse = useCallback(() => {
    pulseLoopRef.current?.stop()
    pulseLoopRef.current = null
    pulse.setValue(1)
    Animated.spring(micScale, { toValue: 1, useNativeDriver: true, friction: 6 }).start()
    Animated.timing(dragX, { toValue: 0, duration: 120, useNativeDriver: true }).start()
  }, [pulse, micScale, dragX])

  const showHint = useCallback(() => {
    if (hintTimerRef.current)
      clearTimeout(hintTimerRef.current)
    setHintVisible(true)
    hintTimerRef.current = setTimeout(() => {
      hintTimerRef.current = null
      setHintVisible(false)
    }, HINT_MS)
  }, [])

  // Pre-check so the common case (already granted) records on the first press.
  useEffect(() => {
    let cancelled = false
    getRecordingPermissionsAsync()
      .then((res) => {
        if (!cancelled && res.granted)
          permissionRef.current = 'granted'
      })
      .catch(() => {
        // Keep 'unknown': the press will trigger the request
      })
    return () => {
      cancelled = true
    }
  }, [])

  const requestPermission = useCallback(async () => {
    try {
      const res = await requestRecordingPermissionsAsync()
      if (res.granted) {
        permissionRef.current = 'granted'
        showHint()
        return
      }
      permissionRef.current = 'denied'
      appAlert(
        'Microphone requis',
        'Autorisez l’accès au microphone dans les réglages de votre téléphone pour envoyer des notes vocales.',
      )
    }
    catch {
      permissionRef.current = 'unknown'
    }
  }, [showHint])

  /** Stops the recorder, then sends or discards. Called at most once per recording. */
  const finish = useCallback(async (mode: FinishMode) => {
    const current = phaseRef.current
    if (current !== 'recording' && current !== 'locked')
      return
    phaseRef.current = 'stopping'
    setPhase('stopping')
    stopPulse()

    let durationMs = 0
    let uri: string | null = null
    try {
      const status = recorder.getStatus()
      durationMs = status.durationMillis > 0 ? status.durationMillis : Math.round(recorder.currentTime * 1000)
      await recorder.stop()
      uri = recorder.uri
    }
    catch {
      uri = null
    }
    resetAudioMode()
    updatePhase('idle')

    if (mode === 'cancel' || !uri) {
      discardFile(uri)
      return
    }
    if (durationMs < MIN_DURATION_MS) {
      discardFile(uri)
      showHint()
      return
    }
    onSendRef.current(uri, durationMs)
  }, [recorder, stopPulse, updatePhase, showHint])

  const start = useCallback(async () => {
    if (phaseRef.current !== 'idle')
      return
    phaseRef.current = 'starting'
    setPhase('starting')
    pendingRef.current = null
    haptic()
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
      await recorder.prepareToRecordAsync()
      if (phaseRef.current !== 'starting')
        return
      recorder.record()
      updatePhase('recording')
      startPulse()
      const pending = pendingRef.current
      pendingRef.current = null
      if (pending)
        await finish(pending)
    }
    catch {
      phaseRef.current = 'idle'
      setPhase('idle')
      pendingRef.current = null
      resetAudioMode()
      appAlert('Enregistrement impossible', 'Le microphone n’a pas pu démarrer. Veuillez réessayer.')
    }
  }, [recorder, updatePhase, startPulse, finish])

  const lock = useCallback(() => {
    if (phaseRef.current !== 'recording')
      return
    haptic(Haptics.ImpactFeedbackStyle.Light)
    Animated.timing(dragX, { toValue: 0, duration: 120, useNativeDriver: true }).start()
    updatePhase('locked')
  }, [dragX, updatePhase])

  // Auto-stop and send at the cap.
  useEffect(() => {
    const current = phaseRef.current
    if ((current === 'recording' || current === 'locked') && recorderState.durationMillis >= MAX_DURATION_MS)
      void finish('send')
  }, [recorderState.durationMillis, finish])

  // Backgrounding discards the recording in progress.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active')
        return
      const current = phaseRef.current
      if (current === 'starting')
        pendingRef.current = 'cancel'
      else if (current === 'recording' || current === 'locked')
        void finish('cancel')
    })
    return () => sub.remove()
  }, [finish])

  // Unmount while recording: stop and discard.
  useEffect(() => {
    return () => {
      if (hintTimerRef.current)
        clearTimeout(hintTimerRef.current)
      pulseLoopRef.current?.stop()
      const current = phaseRef.current
      phaseRef.current = 'idle'
      if (current === 'recording' || current === 'locked' || current === 'starting') {
        try {
          recorder.stop()
            .then(() => discardFile(recorder.uri))
            .catch(() => {
              // Recorder already released by its hook
            })
        }
        catch {
          // Recorder already released by its hook
        }
        resetAudioMode()
      }
    }
  }, [recorder])

  const handlers = useRef({
    onGrant: () => {
      // Replaced below on every render
    },
    onMove: (_dx: number, _dy: number) => {
      // Replaced below on every render
    },
    onRelease: () => {
      // Replaced below on every render
    },
    onTerminate: () => {
      // Replaced below on every render
    },
  })
  handlers.current = {
    onGrant: () => {
      if (disabledRef.current)
        return
      const current = phaseRef.current
      if (current === 'locked') {
        lockedTapRef.current = true
        return
      }
      if (current !== 'idle')
        return
      if (permissionRef.current !== 'granted') {
        void requestPermission()
        return
      }
      gestureDoneRef.current = false
      lockedTapRef.current = false
      void start()
    },
    onMove: (dx: number, dy: number) => {
      if (gestureDoneRef.current)
        return
      const current = phaseRef.current
      if (current !== 'recording' && current !== 'starting')
        return
      dragX.setValue(Math.min(0, dx))
      if (dx <= CANCEL_DX) {
        gestureDoneRef.current = true
        haptic(Haptics.ImpactFeedbackStyle.Heavy)
        if (current === 'starting')
          pendingRef.current = 'cancel'
        else
          void finish('cancel')
        return
      }
      if (dy <= LOCK_DY && current === 'recording') {
        gestureDoneRef.current = true
        lock()
      }
    },
    onRelease: () => {
      if (lockedTapRef.current) {
        lockedTapRef.current = false
        void finish('send')
        return
      }
      if (gestureDoneRef.current)
        return
      const current = phaseRef.current
      if (current === 'starting')
        pendingRef.current = 'send'
      else if (current === 'recording')
        void finish('send')
    },
    onTerminate: () => {
      lockedTapRef.current = false
      if (gestureDoneRef.current)
        return
      const current = phaseRef.current
      if (current === 'starting')
        pendingRef.current = 'cancel'
      else if (current === 'recording')
        void finish('cancel')
    },
  }

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => handlers.current.onGrant(),
    onPanResponderMove: (_evt, g) => handlers.current.onMove(g.dx, g.dy),
    onPanResponderRelease: () => handlers.current.onRelease(),
    onPanResponderTerminate: () => handlers.current.onTerminate(),
  }), [])

  const isActive = phase !== 'idle'
  const isLocked = phase === 'locked'
  const isHolding = phase === 'recording' || phase === 'starting'
  const elapsedMs = isActive ? recorderState.durationMillis : 0
  const cancelHintOpacity = dragX.interpolate({
    inputRange: [CANCEL_DX, 0],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  })

  return (
    <View style={[styles.root, isActive && styles.rootActive]}>
      {isActive && (
        <View style={styles.bar}>
          {isLocked
            ? (
                <TouchableOpacity
                  style={styles.barButton}
                  onPress={() => {
                    void finish('cancel')
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Supprimer l’enregistrement"
                >
                  <Trash2 size={22} color={colors.coral[400]} />
                </TouchableOpacity>
              )
            : (
                <Animated.View style={[styles.dot, { opacity: pulse }]} />
              )}
          <Text style={[styles.timer, { color: semantic.textPrimary }]}>{formatClock(elapsedMs)}</Text>
          {isLocked
            ? (
                <Text style={[styles.lockedLabel, { color: semantic.textTertiary }]} numberOfLines={1}>
                  Enregistrement…
                </Text>
              )
            : (
                <Animated.Text
                  style={[styles.cancelHint, { color: semantic.textTertiary, opacity: cancelHintOpacity }]}
                  numberOfLines={1}
                >
                  ‹ Glissez pour annuler
                </Animated.Text>
              )}
        </View>
      )}

      {isHolding && (
        <View style={styles.lockPill} pointerEvents="none">
          <Lock size={16} color={colors.neutral[600]} />
          <ChevronUp size={16} color={colors.neutral[400]} />
        </View>
      )}

      {hintVisible && !isActive && (
        <View style={styles.hintToast} pointerEvents="none">
          <Text style={styles.hintText}>Maintenez pour enregistrer</Text>
        </View>
      )}

      <Animated.View
        style={[
          styles.micSlot,
          disabled && styles.micDisabled,
          { transform: [{ translateX: dragX }, { scale: micScale }] },
          isHolding && styles.micHolding,
          isLocked && styles.micLocked,
        ]}
        accessibilityRole="button"
        accessibilityLabel={isLocked
          ? 'Envoyer la note vocale'
          : isActive
            ? 'Relâchez pour envoyer, glissez à gauche pour annuler, vers le haut pour verrouiller'
            : 'Maintenez pour enregistrer une note vocale'}
        accessibilityState={{ disabled }}
        {...panResponder.panHandlers}
      >
        {isLocked
          ? <Send size={18} color={colors.neutral[0]} />
          : <Mic size={22} color={isHolding ? colors.neutral[0] : colors.green[600]} />}
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rootActive: {
    flex: 1,
  },
  bar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    minHeight: 44,
    paddingRight: spacing[2],
  },
  barButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.coral[400],
    marginHorizontal: spacing[3],
  },
  timer: {
    fontFamily: fonts.mono,
    fontSize: 15,
    minWidth: 44,
  },
  cancelHint: {
    ...typography.bodyS,
    flex: 1,
    textAlign: 'center',
  },
  lockedLabel: {
    ...typography.bodyS,
    flex: 1,
    textAlign: 'center',
  },
  lockPill: {
    position: 'absolute',
    right: 4,
    bottom: 64,
    width: 36,
    paddingVertical: spacing[2],
    borderRadius: radius.pill,
    backgroundColor: colors.neutral[100],
    alignItems: 'center',
    gap: spacing[1],
    zIndex: 2,
  },
  hintToast: {
    position: 'absolute',
    right: 0,
    bottom: 52,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radius.md,
    backgroundColor: colors.neutral[800],
    zIndex: 2,
  },
  hintText: {
    ...typography.caption,
    color: colors.neutral[0],
  },
  micSlot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.neutral[100],
  },
  micHolding: {
    backgroundColor: colors.green[400],
  },
  micLocked: {
    backgroundColor: colors.green[400],
  },
  micDisabled: {
    opacity: 0.4,
  },
})
