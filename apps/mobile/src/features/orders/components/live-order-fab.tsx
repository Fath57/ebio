import type { LiveOrder } from '../live-order-context'
import Bike from 'lucide-react-native/dist/esm/icons/bike'
import ChefHat from 'lucide-react-native/dist/esm/icons/chef-hat'
import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right'
import PackageCheck from 'lucide-react-native/dist/esm/icons/package-check'
import Store from 'lucide-react-native/dist/esm/icons/store'
import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  cancelAnimation,
  FadeInDown,
  FadeOutDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { colors, fonts, radius, spacing } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { liveOrderLabel, useLiveOrder } from '../live-order-context'

interface LiveOrderFabProps {
  onOpen: (orderId: string) => void
  /** Distance from the bottom of the screen: the tab bar's height. */
  bottomOffset: number
  /**
   * True where the card would duplicate or intrude: the orders tab, which
   * already shows the order, screens without a tab bar (checkout,
   * conversation, sign-in), and screens where the basket bar takes the spot.
   */
  hidden: boolean
}

/**
 * Where the order stands, as a step index on the progress track.
 *
 * Delivery: accepted → preparing → ready (a courier heading to the shop
 * still counts as ready) → on its way. Collection at the shop stops at
 * « ready »: that is the moment the buyer has to move.
 */
function stepOf(order: LiveOrder): number {
  if (order.status === 'ACCEPTED') {
    return 0
  }
  if (order.status === 'PREPARING') {
    return 1
  }
  if (order.status === 'IN_DELIVERY' && (order.deliveryStatus === 'PICKED_UP' || order.deliveryStatus === 'IN_TRANSIT')) {
    return 3
  }
  return 2
}

function StepIcon({ order }: { order: LiveOrder }) {
  const props = { size: 20, color: colors.neutral[0], strokeWidth: 2.2 }
  const step = stepOf(order)
  if (step === 3) {
    return <Bike {...props} />
  }
  if (step === 2) {
    return order.isPickup ? <Store {...props} /> : <PackageCheck {...props} />
  }
  if (step === 1) {
    return <ChefHat {...props} />
  }
  return <Store {...props} />
}

interface ProgressTrackProps {
  steps: number
  current: number
  idleColor: string
}

/** Done segments filled, the current one breathing, the rest waiting. */
function ProgressTrack({ steps, current, idleColor }: ProgressTrackProps) {
  const pulse = useSharedValue(1)

  useEffect(() => {
    pulse.value = withRepeat(withTiming(0.35, { duration: 900 }), -1, true)
    return () => {
      cancelAnimation(pulse)
    }
  }, [pulse])

  const pulsing = useAnimatedStyle(() => ({ opacity: pulse.value }))

  return (
    <View style={styles.track} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: steps }, (_, index) => {
        if (index === current) {
          return <Animated.View key={index} style={[styles.segment, styles.segmentDone, pulsing]} />
        }
        return (
          <View
            key={index}
            style={[styles.segment, index < current ? styles.segmentDone : { backgroundColor: idleColor }]}
          />
        )
      })}
    </View>
  )
}

/**
 * The order in progress, kept within reach for as long as it moves.
 *
 * A card floating above the tabs, the way delivery apps do it: one line on
 * where it stands, the shop, and a track that fills step by step. One tap
 * opens the tracking screen. It replaces the five-second notice, which left
 * the buyer hunting for the order once it had gone.
 */
export function LiveOrderFab({ onOpen, bottomOffset, hidden }: LiveOrderFabProps) {
  const { order, count } = useLiveOrder()
  const { semantic, isDark } = useTheme()

  if (!order || hidden) {
    return null
  }

  const steps = order.isPickup ? 3 : 4
  const current = Math.min(stepOf(order), steps - 1)
  const others = count - 1
  const label = liveOrderLabel(order)

  return (
    <Animated.View
      entering={FadeInDown.duration(260)}
      exiting={FadeOutDown.duration(200)}
      style={[styles.wrapper, { bottom: bottomOffset + spacing[3] }]}
      pointerEvents="box-none"
    >
      <Pressable
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: semantic.bgCard, transform: [{ scale: pressed ? 0.985 : 1 }] },
        ]}
        onPress={() => onOpen(order.id)}
        accessibilityRole="button"
        accessibilityLabel={`${label}, commande ${order.orderNumber}${others > 0 ? `, et ${others} autre${others > 1 ? 's' : ''} en cours` : ''}. Suivre la commande`}
      >
        <View style={styles.row}>
          <View style={styles.icon}>
            <StepIcon order={order} />
          </View>
          <View style={styles.texts}>
            <Text style={[styles.title, { color: semantic.textPrimary }]} numberOfLines={1}>{label}</Text>
            <Text style={[styles.subtitle, { color: semantic.textSecondary }]} numberOfLines={1}>
              {others > 0
                ? `${order.shopName} · +${others} autre${others > 1 ? 's' : ''} en cours`
                : `${order.shopName} · ${order.orderNumber}`}
            </Text>
          </View>
          <ChevronRight size={20} color={semantic.textTertiary} strokeWidth={2.4} />
        </View>
        <ProgressTrack
          steps={steps}
          current={current}
          idleColor={isDark ? colors.neutral[600] : colors.neutral[100]}
        />
      </Pressable>
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
    borderRadius: radius.xl,
    paddingHorizontal: spacing[3],
    paddingTop: spacing[3],
    paddingBottom: spacing[3],
    gap: spacing[3],
    // Floats over the content it covers: the one place a shadow belongs.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green[600],
  },
  texts: {
    flex: 1,
  },
  title: {
    fontFamily: fonts.sansSb,
    fontSize: 15,
  },
  subtitle: {
    fontFamily: fonts.sansMd,
    fontSize: 12,
    marginTop: 2,
  },
  track: {
    flexDirection: 'row',
    gap: spacing[1],
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: radius.pill,
  },
  segmentDone: {
    backgroundColor: colors.green[400],
  },
})
