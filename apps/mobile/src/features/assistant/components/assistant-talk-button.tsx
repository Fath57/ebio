import type { LineState } from '../live-voice'
import * as Haptics from 'expo-haptics'
import Mic from 'lucide-react-native/dist/esm/icons/mic'
import MicOff from 'lucide-react-native/dist/esm/icons/mic-off'
import Square from 'lucide-react-native/dist/esm/icons/square'
import { useEffect, useRef } from 'react'
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, fonts, radius, spacing } from '../../../theme/theme'

/** What the button says it is doing, in the buyer's words. */
const LABEL: Record<LineState, string> = {
  off: 'Appuyez et parlez',
  opening: 'Un instant…',
  listening: 'Elle vous écoute — parlez',
  thinking: 'Elle cherche…',
  answering: 'Elle répond — coupez-la si besoin',
}

interface AssistantTalkButtonProps {
  state: LineState
  /** Open the line: the microphone stays on until it is closed. */
  onOpen: () => void
  /** Close it, and let go of the microphone. */
  onClose: () => void
  /** Make her stop talking without closing the line. */
  onHush: () => void
}

/**
 * One button for a whole conversation.
 *
 * Not push-to-talk: the line opens once and stays open, because a conversation
 * in which one holds a button down is not a conversation. While she talks the
 * button becomes the way to cut her off — the thing one actually wants at that
 * moment — and closing the line is the second, quieter action.
 */
export function AssistantTalkButton({ state, onOpen, onClose, onHush }: AssistantTalkButtonProps) {
  const open = state !== 'off'
  const pulse = useRef(new Animated.Value(1)).current

  // A microphone one cannot see hearing is a microphone one speaks into for
  // nothing, so the button breathes for as long as the line is open.
  useEffect(() => {
    if (!open) {
      pulse.setValue(1)
      return
    }
    const beat = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    )
    beat.start()
    return () => {
      beat.stop()
    }
  }, [open, pulse])

  const press = (): void => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    if (state === 'off') {
      onOpen()
      return
    }
    if (state === 'answering') {
      onHush()
      return
    }
    onClose()
  }

  return (
    <View style={styles.wrap}>
      <Animated.View style={{ transform: [{ scale: pulse }] }}>
        <Pressable
          style={[styles.button, open && styles.buttonOpen, state === 'answering' && styles.buttonAnswering]}
          onPress={press}
          accessibilityRole="button"
          accessibilityLabel={LABEL[state]}
        >
          {state === 'opening' && <ActivityIndicator size="small" color={colors.neutral[0]} />}
          {state === 'off' && <Mic size={30} color={colors.neutral[0]} strokeWidth={2.4} />}
          {state === 'answering' && <Square size={24} color={colors.neutral[0]} strokeWidth={2.6} />}
          {(state === 'listening' || state === 'thinking') && (
            <Mic size={30} color={colors.neutral[0]} strokeWidth={2.4} />
          )}
        </Pressable>
      </Animated.View>

      <Text style={styles.label}>{LABEL[state]}</Text>

      {/* Hanging up is deliberately the small action: the one people reach for
        * mid-sentence is « stop talking », not « end the conversation ». */}
      {open && (
        <Pressable style={styles.hangUp} onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Fermer le micro">
          <MicOff size={16} color={colors.neutral[600]} strokeWidth={2.2} />
          <Text style={styles.hangUpText}>Fermer le micro</Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[2],
  },
  button: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.green[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonOpen: {
    backgroundColor: colors.green[800],
  },
  buttonAnswering: {
    backgroundColor: colors.coral[600],
  },
  label: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.neutral[600],
  },
  hangUp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  hangUpText: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.neutral[600],
  },
})
