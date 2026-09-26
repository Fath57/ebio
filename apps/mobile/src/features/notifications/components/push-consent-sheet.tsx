import Bell from 'lucide-react-native/dist/esm/icons/bell'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Animated, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { askForPush } from '../hooks/use-notifications'
import { recordAsk, shouldAskForPush } from '../push-consent'

/** Far enough to read as coming from off-screen, short enough not to wait. */
const SHEET_TRAVEL = 280

interface PushConsentSheetProps {
  /**
   * The moment worth spending the ask on.
   *
   * Set it true when the buyer has just shown intent — a first basket, a first
   * favourite. Before that the question means nothing; after a refusal it
   * cannot be asked again.
   */
  when: boolean
}

/**
 * Asks in our own words before Android asks in its.
 *
 * On Android 13 and later a refusal of the system dialog is final — there is
 * no second chance, ever. So the system is only opened once the buyer has said
 * yes here; saying no here costs nothing and can be asked again a fortnight
 * later. That is what lets us ask everyone early, including those who have
 * never ordered — the very people worth bringing back.
 */
export function PushConsentSheet({ when }: PushConsentSheetProps) {
  const { semantic } = useTheme()
  const [isVisible, setIsVisible] = useState(false)
  const rise = useRef(new Animated.Value(SHEET_TRAVEL)).current

  useEffect(() => {
    if (!isVisible) {
      rise.setValue(SHEET_TRAVEL)
      return
    }
    Animated.spring(rise, {
      toValue: 0,
      useNativeDriver: true,
      speed: 14,
      bounciness: 4,
    }).start()
  }, [isVisible, rise])

  useEffect(() => {
    if (!when) {
      return
    }
    let cancelled = false
    async function check(): Promise<void> {
      const worth = await shouldAskForPush()
      if (!cancelled && worth) {
        setIsVisible(true)
      }
    }
    check()
    return () => {
      cancelled = true
    }
  }, [when])

  const accept = useCallback(async (): Promise<void> => {
    setIsVisible(false)
    await recordAsk(true)
    await askForPush()
  }, [])

  const decline = useCallback(async (): Promise<void> => {
    setIsVisible(false)
    await recordAsk(false)
  }, [])

  return (
    <Modal visible={isVisible} transparent animationType="fade" onRequestClose={() => void decline()}>
      <View style={styles.backdrop}>
        {/* Elle monte au ressort plutôt que d'apparaître : une feuille qui
          * glisse depuis le bas se lit comme une chose qu'on a tirée, un
          * fondu comme une chose qui s'est imposée. */}
        <Animated.View style={[styles.sheet, { backgroundColor: semantic.bgCard, transform: [{ translateY: rise }] }]}>
          <View style={[styles.icon, { backgroundColor: semantic.bgPrimaryLight }]}>
            <Bell size={30} color={colors.green[400]} />
          </View>
          <Text style={[styles.title, { color: semantic.textPrimary }]}>
            Rester au courant ?
          </Text>
          <Text style={[styles.body, { color: semantic.textTertiary }]}>
            On vous prévient quand votre commande avance, quand le livreur
            arrive, et quand une boutique près de chez vous fait une promotion.
            Rien d'autre.
          </Text>

          <TouchableOpacity style={styles.accept} onPress={() => void accept()} accessibilityRole="button">
            <Text style={styles.acceptText}>Me prévenir</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.decline} onPress={() => void decline()} accessibilityRole="button">
            <Text style={[styles.declineText, { color: semantic.textTertiary }]}>Plus tard</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    padding: spacing[6],
    alignItems: 'center',
    gap: spacing[3],
  },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fonts.sansBd,
    fontSize: typography.h3.fontSize,
    textAlign: 'center',
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: typography.bodyL.fontSize,
    textAlign: 'center',
    lineHeight: 22,
  },
  accept: {
    marginTop: spacing[2],
    alignSelf: 'stretch',
    backgroundColor: colors.green[600],
    minHeight: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptText: {
    fontFamily: fonts.sansSb,
    fontSize: typography.bodyL.fontSize,
    color: colors.neutral[0],
  },
  decline: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineText: {
    fontFamily: fonts.sans,
    fontSize: typography.bodyL.fontSize,
  },
})
