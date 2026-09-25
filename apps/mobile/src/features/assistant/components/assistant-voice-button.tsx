import {
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio'
import * as Haptics from 'expo-haptics'
import Mic from 'lucide-react-native/dist/esm/icons/mic'
import Square from 'lucide-react-native/dist/esm/icons/square'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, fonts, radius, spacing } from '../../../theme/theme'
import { useAssistantIdentity } from '../identity'

/**
 * Recording, with input-level metering.
 *
 * The high-quality preset does not ask for it; without it nothing on screen
 * can react to the voice — and a microphone you cannot see hearing is a
 * microphone you speak into for nothing.
 */
const PRESET = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true }

/** Often enough to follow a voice, rare enough not to burn the battery. */
const METER_INTERVAL_MS = 100

/**
 * How long we listen to the room before judging anything.
 *
 * A fixed threshold does not work: in a quiet room the floor sits at -50 dB,
 * in a market it rises to -30, and silence there never drops below a value
 * written in advance. So we measure the room as it is, then judge against it.
 */
const AMBIENT_SAMPLE_MS = 700

/**
 * What separates a voice from the room, in decibels.
 *
 * Nobody speaks just barely above the noise: a voice close to the microphone
 * beats its surroundings by 12 to 20 dB. The margin chosen lets a quiet voice
 * through without mistaking a passing motorbike for a sentence.
 */
const VOICE_ABOVE_AMBIENT_DB = 9

/** The silence that ends a turn, once something has been said. */
const SILENCE_BEFORE_STOP_MS = 1600

/**
 * Past this, we stop whatever happens.
 *
 * A microphone left open in a noisy place would record forever, and
 * transcription is billed by the minute.
 */
const MAX_RECORDING_MS = 45_000

interface AssistantVoiceButtonProps {
  /** Called with the recording's local file once the buyer stops talking. */
  onRecorded: (uri: string) => void
  onError: (message: string) => void
  /** True while the assistant is answering: one cannot talk over it. */
  disabled: boolean
}

/**
 * From decibels to a 0-to-1 share, for what the eye should see.
 *
 * Measured from the room's own noise floor: in a market, a ring anchored to
 * absolute zero would stay lit permanently and stop saying anything.
 */
function loudness(db: number | undefined, ambientDb: number | null): number {
  if (db === undefined || !Number.isFinite(db)) {
    return 0
  }
  const floor = ambientDb ?? -50
  const span = Math.max(12, 0 - floor)
  return Math.max(0, Math.min(1, (db - floor) / span))
}

/**
 * The button to speak.
 *
 * Wide and low on the screen: shopping happens standing up, often with the
 * other hand busy, and it is the thumb that reaches it. One press starts;
 * after that, falling silent is enough — the recording closes on its own,
 * which is the only way to order without touching the screen. A second press
 * is still there to cut things short.
 *
 * The ring follows the voice. It is not decoration: it is the only proof that
 * the microphone hears, and without it nobody knows they are speaking into
 * nothing.
 */
export function AssistantVoiceButton({ onRecorded, onError, disabled }: AssistantVoiceButtonProps) {
  const assistant = useAssistantIdentity()
  const recorder = useAudioRecorder(PRESET)
  const state = useAudioRecorderState(recorder, METER_INTERVAL_MS)
  const listening = state.isRecording

  const ring = useRef(new Animated.Value(0)).current
  const [heardSomething, setHeardSomething] = useState(false)
  const silenceSince = useRef<number | null>(null)
  const stopRef = useRef<() => void>(() => {})

  // The room noise measured as listening starts, and the threshold it sets.
  const startedAt = useRef<number>(0)
  const ambient = useRef<number | null>(null)
  const ambientSamples = useRef<number[]>([])

  const stop = useCallback(async () => {
    try {
      await recorder.stop()
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true })

      const uri = recorder.uri
      if (uri) {
        onRecorded(uri)
      }
    }
    catch {
      onError('L\'enregistrement s\'est perdu. Réessayez ?')
    }
  }, [onError, onRecorded, recorder])

  stopRef.current = () => void stop()

  // The ring follows the measured level, with no idle animation: what moves
  // here is the voice, and nothing else.
  const level = listening ? loudness(state.metering, ambient.current) : 0
  useEffect(() => {
    Animated.timing(ring, {
      toValue: level,
      duration: METER_INTERVAL_MS,
      useNativeDriver: true,
    }).start()
  }, [level, ring])

  // Something was said, then silence: the turn is over. Silence only counts
  // after something has been heard, or the recording would close before the
  // buyer had opened their mouth.
  useEffect(() => {
    if (!listening) {
      silenceSince.current = null
      ambient.current = null
      ambientSamples.current = []
      setHeardSomething(false)
      return
    }

    const db = state.metering ?? -160
    const elapsed = Date.now() - startedAt.current

    // The first few hundred milliseconds are spent listening to the room.
    // Nothing is judged during that time.
    if (ambient.current === null) {
      ambientSamples.current.push(db)
      if (elapsed < AMBIENT_SAMPLE_MS) {
        return
      }
      // The median rather than the mean: one slam during the measurement
      // would skew the threshold for the rest of the turn.
      const sorted = [...ambientSamples.current].sort((a, b) => a - b)
      ambient.current = sorted[Math.floor(sorted.length / 2)] ?? -50
      return
    }

    if (elapsed > MAX_RECORDING_MS) {
      stopRef.current()
      return
    }

    const speaking = db > ambient.current + VOICE_ABOVE_AMBIENT_DB
    if (speaking) {
      silenceSince.current = null
      if (!heardSomething) {
        setHeardSomething(true)
      }
      return
    }

    if (!heardSomething) {
      return
    }

    if (silenceSince.current === null) {
      silenceSince.current = Date.now()
      return
    }

    if (Date.now() - silenceSince.current >= SILENCE_BEFORE_STOP_MS) {
      silenceSince.current = null
      stopRef.current()
    }
  }, [heardSomething, listening, state.metering])

  const start = useCallback(async () => {
    try {
      let permission = await getRecordingPermissionsAsync()
      if (!permission.granted) {
        permission = await requestRecordingPermissionsAsync()
      }
      if (!permission.granted) {
        onError('Sans le micro, je ne peux pas vous entendre. Écrivez-moi ?')
        return
      }

      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
      await recorder.prepareToRecordAsync()
      recorder.record()
      setHeardSomething(false)
      silenceSince.current = null
      startedAt.current = Date.now()
      ambient.current = null
      ambientSamples.current = []
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    }
    catch {
      onError('Le micro n\'a pas démarré. Réessayez ?')
    }
  }, [onError, recorder])

  const hint = (): string => {
    if (!listening) {
      return 'Appuyez et parlez'
    }
    if (heardSomething) {
      return 'Je vous entends — taisez-vous pour envoyer'
    }
    return ambient.current === null ? 'Un instant…' : 'Je vous écoute…'
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.buttonRow}>
        {listening && (
          <Animated.View
            pointerEvents="none"
            style={[styles.ring, {
              opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.45] }),
              transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.55] }) }],
            }]}
          />
        )}

        <Pressable
          style={[styles.button, listening && styles.buttonListening, disabled && styles.buttonDisabled]}
          onPress={() => {
            if (listening) {
              void stop()
            }
            else {
              void start()
            }
          }}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={listening ? 'Arrêter et envoyer' : `Parler à ${assistant.name}`}
        >
          {listening
            ? <Square size={26} color={colors.neutral[0]} strokeWidth={2.4} fill={colors.neutral[0]} />
            : <Mic size={28} color={colors.neutral[0]} strokeWidth={2.2} />}
        </Pressable>
      </View>

      <Text style={styles.hint}>{hint()}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: spacing[2],
  },
  buttonRow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.coral[400],
  },
  button: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.green[400],
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonListening: {
    backgroundColor: colors.coral[400],
  },
  buttonDisabled: {
    backgroundColor: colors.neutral[400],
  },
  hint: {
    fontFamily: fonts.sansMd,
    fontSize: 12,
    color: colors.neutral[600],
  },
})
