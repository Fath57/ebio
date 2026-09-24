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
import { useCallback, useEffect, useRef } from 'react'
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, fonts, radius, spacing } from '../../../theme/theme'

interface AssistantVoiceButtonProps {
  /** Called with the recording's local file once the buyer stops talking. */
  onRecorded: (uri: string) => void
  onError: (message: string) => void
  /** True while the assistant is answering: one cannot talk over it. */
  disabled: boolean
}

/**
 * Le bouton pour parler.
 *
 * Large et bas dans l'écran : on fait ses courses debout, souvent avec l'autre
 * main occupée, et c'est le pouce qui l'atteint. Un appui démarre, un second
 * arrête — pas de maintien, qui obligerait à garder le téléphone en main
 * pendant qu'on parle.
 */
export function AssistantVoiceButton({ onRecorded, onError, disabled }: AssistantVoiceButtonProps) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const state = useAudioRecorderState(recorder)
  const listening = state.isRecording
  const halo = useRef(new Animated.Value(0)).current

  // Un halo qui respire pendant l'écoute. C'est la seule animation de l'écran,
  // et elle dit quelque chose : le micro est ouvert.
  useEffect(() => {
    if (!listening) {
      halo.setValue(0)
      return
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(halo, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(halo, { toValue: 0, duration: 900, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    )
    loop.start()

    return () => {
      loop.stop()
    }
  }, [halo, listening])

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
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    }
    catch {
      onError('Le micro n\'a pas démarré. Réessayez ?')
    }
  }, [onError, recorder])

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

  return (
    <View style={styles.wrap}>
      <View style={styles.buttonRow}>
        {listening && (
          <Animated.View
            style={[styles.halo, {
              opacity: halo.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0] }),
              transform: [{ scale: halo.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }],
            }]}
            pointerEvents="none"
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

      <Text style={styles.hint}>
        {listening ? 'Je vous écoute — appuyez pour envoyer' : 'Appuyez et parlez'}
      </Text>
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
  halo: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.green[400],
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
