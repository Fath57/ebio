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

/**
 * L'enregistrement, avec la mesure du niveau d'entrée.
 *
 * Le préréglage haute qualité ne la demande pas ; sans elle, rien à l'écran ne
 * peut réagir à la voix — et un micro dont on ne voit pas s'il entend est un
 * micro dans lequel on parle pour rien.
 */
const PRESET = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true }

/** Assez souvent pour suivre la voix, assez rare pour ne pas chauffer. */
const METER_INTERVAL_MS = 100

/**
 * En dessous, c'est du silence.
 *
 * Le niveau est en décibels par rapport à la saturation : 0 est le maximum,
 * -160 le silence absolu. Une pièce calme tourne autour de -45, une voix
 * proche dépasse -25. Le seuil laisse passer une voix basse sans se déclencher
 * sur le bruit d'un marché.
 */
const SILENCE_DB = -38

/** Le temps de silence qui clôt un tour de parole, une fois qu'on a parlé. */
const SILENCE_BEFORE_STOP_MS = 1600

interface AssistantVoiceButtonProps {
  /** Called with the recording's local file once the buyer stops talking. */
  onRecorded: (uri: string) => void
  onError: (message: string) => void
  /** True while the assistant is answering: one cannot talk over it. */
  disabled: boolean
}

/** Du décibel vers une part de 0 à 1, pour ce que l'œil doit voir. */
function loudness(db: number | undefined): number {
  if (db === undefined || !Number.isFinite(db)) {
    return 0
  }
  const floor = -50
  return Math.max(0, Math.min(1, (db - floor) / (0 - floor)))
}

/**
 * Le bouton pour parler.
 *
 * Large et bas dans l'écran : on fait ses courses debout, souvent avec l'autre
 * main occupée, et c'est le pouce qui l'atteint. Un appui démarre ; ensuite,
 * se taire suffit — l'enregistrement se ferme tout seul après un silence, ce
 * qui est la seule façon de commander sans toucher l'écran. Le second appui
 * reste possible pour couper court.
 *
 * L'anneau suit la voix. Ce n'est pas une décoration : c'est la seule preuve
 * que le micro entend, et sans elle on ne sait pas si l'on parle dans le vide.
 */
export function AssistantVoiceButton({ onRecorded, onError, disabled }: AssistantVoiceButtonProps) {
  const recorder = useAudioRecorder(PRESET)
  const state = useAudioRecorderState(recorder, METER_INTERVAL_MS)
  const listening = state.isRecording

  const ring = useRef(new Animated.Value(0)).current
  const [heardSomething, setHeardSomething] = useState(false)
  const silenceSince = useRef<number | null>(null)
  const stopRef = useRef<() => void>(() => {})

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

  // L'anneau suit le niveau mesuré, sans animation d'attente : ce qui bouge
  // ici, c'est la voix, et rien d'autre.
  const level = listening ? loudness(state.metering) : 0
  useEffect(() => {
    Animated.timing(ring, {
      toValue: level,
      duration: METER_INTERVAL_MS,
      useNativeDriver: true,
    }).start()
  }, [level, ring])

  // On a parlé, puis on s'est tu : le tour est fini. Le silence ne compte
  // qu'après avoir entendu quelque chose, sinon l'enregistrement se fermerait
  // avant qu'on ait ouvert la bouche.
  useEffect(() => {
    if (!listening) {
      silenceSince.current = null
      setHeardSomething(false)
      return
    }

    const loud = (state.metering ?? -160) > SILENCE_DB
    if (loud) {
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
    return heardSomething ? 'Je vous entends — taisez-vous pour envoyer' : 'Je vous écoute…'
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
          accessibilityLabel={listening ? 'Arrêter et envoyer' : 'Parler à l\'assistant'}
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
