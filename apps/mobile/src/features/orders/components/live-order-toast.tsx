import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right'
import Package from 'lucide-react-native/dist/esm/icons/package'
import { useEffect, useRef, useState } from 'react'
import { AppState, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, fonts, radius, spacing } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { liveOrderLabel, useLiveOrder } from '../live-order-context'

/** Long enough to read one line, short enough not to annoy. */
const VISIBLE_MS = 5000

interface LiveOrderToastProps {
  onOpen: (orderId: string) => void
  /**
   * True where the notice would duplicate or intrude: on the orders tab,
   * which already says it, and on the screens that hide the tab bar
   * (checkout, conversation, sign-in, assistant).
   */
  hidden: boolean
}

/**
 * Where the order has got to, said once and then put away.
 *
 * A permanent bar would have held the bottom of the screen for a whole
 * delivery and fought the floating basket. This behaves like a notification:
 * it comes down from the top when the app opens and on every change of
 * state, it reads in one line, and it leaves on its own after five seconds.
 * What remains afterwards is the dot on the orders tab — the information is
 * there without demanding anything.
 */
export function LiveOrderToast({ onOpen, hidden }: LiveOrderToastProps) {
  const { order } = useLiveOrder()
  const { semantic } = useTheme()
  const insets = useSafeAreaInsets()
  const [visible, setVisible] = useState(false)
  // What has already been announced: without this the poll would replay the
  // same sentence every forty-five seconds.
  const announced = useRef<string | null>(null)

  const signature = order ? `${order.id}:${order.status}:${order.deliveryStatus}` : null

  // Coming back to the app is when the news is worth most: a fresh
  // announcement is allowed even when the state has not changed.
  useEffect(() => {
    const watch = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        announced.current = null
      }
    })
    return () => {
      watch.remove()
    }
  }, [])

  useEffect(() => {
    if (!signature) {
      announced.current = null
      setVisible(false)
      return
    }
    if (announced.current === signature) {
      return
    }
    announced.current = signature
    setVisible(true)
    const timer = setTimeout(() => setVisible(false), VISIBLE_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [signature])

  if (!order || !visible || hidden) {
    return null
  }

  return (
    <Animated.View
      entering={FadeInDown.duration(240)}
      exiting={FadeOutUp.duration(200)}
      style={[styles.wrapper, { top: insets.top + spacing[2] }]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        style={[styles.card, { backgroundColor: semantic.bgCard }]}
        activeOpacity={0.9}
        onPress={() => {
          setVisible(false)
          onOpen(order.id)
        }}
        accessibilityRole="button"
        accessibilityLabel={`${liveOrderLabel(order)}. Appuyez pour suivre la commande ${order.orderNumber}`}
      >
        <View style={styles.icon}>
          <Package size={16} color={colors.neutral[0]} strokeWidth={2.4} />
        </View>
        <View style={styles.texts}>
          <Text style={[styles.label, { color: semantic.textPrimary }]} numberOfLines={1}>
            {liveOrderLabel(order)}
          </Text>
          <Text style={[styles.hint, { color: semantic.textSecondary }]} numberOfLines={1}>
            Appuyez pour suivre
          </Text>
        </View>
        <ChevronRight size={18} color={colors.neutral[400]} strokeWidth={2.4} />
      </TouchableOpacity>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: spacing[4],
    right: spacing[4],
    // Below the connectivity banner (999): a dropped line comes first.
    zIndex: 900,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: 54,
    paddingHorizontal: spacing[3],
    borderRadius: radius.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 10,
  },
  icon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green[600],
  },
  texts: {
    flex: 1,
  },
  label: {
    fontFamily: fonts.sansSb,
    fontSize: 14,
  },
  hint: {
    fontFamily: fonts.sansMd,
    fontSize: 11,
  },
})
