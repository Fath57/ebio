import type { LiveValise } from '../../terroir/live-valise-context'
import type { LiveOrder } from '../live-order-context'
import Bike from 'lucide-react-native/dist/esm/icons/bike'
import ChefHat from 'lucide-react-native/dist/esm/icons/chef-hat'
import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right'
import Luggage from 'lucide-react-native/dist/esm/icons/luggage'
import MapPin from 'lucide-react-native/dist/esm/icons/map-pin'
import Package from 'lucide-react-native/dist/esm/icons/package'
import PackageCheck from 'lucide-react-native/dist/esm/icons/package-check'
import Plane from 'lucide-react-native/dist/esm/icons/plane'
import Store from 'lucide-react-native/dist/esm/icons/store'
import Truck from 'lucide-react-native/dist/esm/icons/truck'
import Wallet from 'lucide-react-native/dist/esm/icons/wallet'
import { useEffect, useState } from 'react'
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
import { AirmailBand } from '../../terroir/components/valise/valise-art'
import { useValisePalette } from '../../terroir/components/valise/valise-palette'
import { liveValiseLabel, liveValiseSubtitle, useLiveValise, valiseStep } from '../../terroir/live-valise-context'
import { liveOrderLabel, useLiveOrder } from '../live-order-context'

interface LiveOrderFabProps {
  onOpenOrder: (orderId: string) => void
  /** Opens « Ma valise envoyée » for that shipment. */
  onOpenValise: (shipmentId: string) => void
  /** Distance from the bottom of the screen: the tab bar's height. */
  bottomOffset: number
  /**
   * True where the card would duplicate or intrude: the orders tab, which
   * already shows the order, screens without a tab bar (checkout,
   * conversation, sign-in), and screens where the basket bar takes the spot.
   */
  hidden: boolean
}

type Entry
  = | { kind: 'order', key: string, rank: number, order: LiveOrder }
    | { kind: 'valise', key: string, rank: number, valise: LiveValise }

/**
 * The most urgent first: a supplement to pay, then a valise waiting at the
 * agency, then a local order on its way, then the rest.
 */
function orderRank(order: LiveOrder): number {
  return order.status === 'IN_DELIVERY' ? 2 : 1
}

function valiseRank(valise: LiveValise): number {
  if (valise.supplementDue)
    return 4
  if (valise.status === 'READY_FOR_PICKUP' || valise.status === 'OUT_FOR_DELIVERY')
    return 3
  return 0
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

const ICON_PROPS = { size: 20, color: colors.neutral[0], strokeWidth: 2.2 }

function StepIcon({ order }: { order: LiveOrder }) {
  const step = stepOf(order)
  if (step === 3) {
    return <Bike {...ICON_PROPS} />
  }
  if (step === 2) {
    return order.isPickup ? <Store {...ICON_PROPS} /> : <PackageCheck {...ICON_PROPS} />
  }
  if (step === 1) {
    return <ChefHat {...ICON_PROPS} />
  }
  return <Store {...ICON_PROPS} />
}

/** Paid, collected, left, arrived, to collect (or on its way home). */
function ValiseIcon({ valise }: { valise: LiveValise }) {
  if (valise.supplementDue) {
    return <Wallet {...ICON_PROPS} />
  }
  const step = valiseStep(valise)
  if (step === 4) {
    return valise.status === 'OUT_FOR_DELIVERY' ? <Truck {...ICON_PROPS} /> : <Luggage {...ICON_PROPS} />
  }
  if (step === 3) {
    return <MapPin {...ICON_PROPS} />
  }
  if (step === 2) {
    return <Plane {...ICON_PROPS} />
  }
  if (step === 1) {
    return <PackageCheck {...ICON_PROPS} />
  }
  return <Package {...ICON_PROPS} />
}

interface ProgressTrackProps {
  steps: number
  current: number
  idleColor: string
  doneColor: string
}

/** Done segments filled, the current one breathing, the rest waiting. */
function ProgressTrack({ steps, current, idleColor, doneColor }: ProgressTrackProps) {
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
          return <Animated.View key={index} style={[styles.segment, { backgroundColor: doneColor }, pulsing]} />
        }
        return (
          <View
            key={index}
            style={[styles.segment, { backgroundColor: index < current ? doneColor : idleColor }]}
          />
        )
      })}
    </View>
  )
}

interface MoreButtonProps {
  more: number
  color: string
  background: string
  onPress: () => void
}

/** « +1 »: the next thing in progress, in the same spot. */
function MoreButton({ more, color, background, onPress }: MoreButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={[styles.more, { backgroundColor: background }]}
      accessibilityRole="button"
      accessibilityLabel={`Voir ${more > 1 ? `les ${more} autres suivis` : 'l’autre suivi'}`}
    >
      <Text style={[styles.moreText, { color }]}>{`+${more}`}</Text>
    </Pressable>
  )
}

/**
 * The order in progress, kept within reach for as long as it moves.
 *
 * A card floating above the tabs, the way delivery apps do it: one line on
 * where it stands, the shop, and a track that fills step by step. One tap
 * opens the tracking screen. A valise sent abroad shares the spot, with its
 * own five steps and its airmail edge; when both move, the most urgent shows
 * and « +1 » turns to the other.
 */
export function LiveOrderFab({ onOpenOrder, onOpenValise, bottomOffset, hidden }: LiveOrderFabProps) {
  const { order, count } = useLiveOrder()
  const { valises } = useLiveValise()
  const { semantic, isDark } = useTheme()
  const palette = useValisePalette()
  const [turn, setTurn] = useState(0)

  const entries: Entry[] = [
    ...valises.map((valise): Entry => ({ kind: 'valise', key: `v${valise.id}`, rank: valiseRank(valise), valise })),
    ...(order ? [{ kind: 'order', key: `o${order.id}`, rank: orderRank(order), order } satisfies Entry] : []),
  ].sort((a, b) => b.rank - a.rank)

  if (entries.length === 0 || hidden) {
    return null
  }

  const entry = entries[turn % entries.length]
  const more = entries.length - 1
  const idleColor = isDark ? colors.neutral[600] : colors.neutral[100]
  const handleMore = (): void => {
    setTurn(value => value + 1)
  }

  if (entry.kind === 'valise') {
    const valise = entry.valise
    const label = liveValiseLabel(valise)
    const subtitle = liveValiseSubtitle(valise)
    const accent = valise.supplementDue ? colors.earth[600] : colors.blue[600]
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
          onPress={() => onOpenValise(valise.id)}
          accessibilityRole="button"
          accessibilityLabel={`${label}, ${subtitle}. Ouvrir ma valise envoyée`}
        >
          <View style={[styles.inner, { borderColor: palette.paperEdge }]}>
            <AirmailBand height={4} colorA={palette.stripeA} colorB={palette.stripeB} />
            <View style={styles.body}>
              <View style={styles.row}>
                <View style={[styles.icon, { backgroundColor: accent }]}>
                  <ValiseIcon valise={valise} />
                </View>
                <View style={styles.texts}>
                  <Text
                    style={[styles.title, { color: valise.supplementDue ? colors.earth[isDark ? 400 : 800] : semantic.textPrimary }]}
                    numberOfLines={1}
                  >
                    {label}
                  </Text>
                  <Text style={[styles.subtitle, { color: semantic.textSecondary }]} numberOfLines={1}>
                    {subtitle}
                  </Text>
                </View>
                {more > 0 && <MoreButton more={more} color={palette.skyInk} background={palette.skyPaper} onPress={handleMore} />}
                <ChevronRight size={20} color={semantic.textTertiary} strokeWidth={2.4} />
              </View>
              <ProgressTrack
                steps={5}
                current={valiseStep(valise)}
                idleColor={idleColor}
                doneColor={valise.supplementDue ? colors.earth[400] : colors.blue[400]}
              />
            </View>
          </View>
        </Pressable>
      </Animated.View>
    )
  }

  const localOrder = entry.order
  const steps = localOrder.isPickup ? 3 : 4
  const current = Math.min(stepOf(localOrder), steps - 1)
  const others = count - 1
  const label = liveOrderLabel(localOrder)

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
        onPress={() => onOpenOrder(localOrder.id)}
        accessibilityRole="button"
        accessibilityLabel={`${label}, commande ${localOrder.orderNumber}${others > 0 ? `, et ${others} autre${others > 1 ? 's' : ''} en cours` : ''}. Suivre la commande`}
      >
        <View style={[styles.body, styles.bodyPlain]}>
          <View style={styles.row}>
            <View style={[styles.icon, { backgroundColor: colors.green[600] }]}>
              <StepIcon order={localOrder} />
            </View>
            <View style={styles.texts}>
              <Text style={[styles.title, { color: semantic.textPrimary }]} numberOfLines={1}>{label}</Text>
              <Text style={[styles.subtitle, { color: semantic.textSecondary }]} numberOfLines={1}>
                {others > 0
                  ? `${localOrder.shopName} · +${others} autre${others > 1 ? 's' : ''} en cours`
                  : `${localOrder.shopName} · ${localOrder.orderNumber}`}
              </Text>
            </View>
            {more > 0 && <MoreButton more={more} color={semantic.textPrimaryColor} background={semantic.bgPrimaryLight} onPress={handleMore} />}
            <ChevronRight size={20} color={semantic.textTertiary} strokeWidth={2.4} />
          </View>
          <ProgressTrack steps={steps} current={current} idleColor={idleColor} doneColor={colors.green[400]} />
        </View>
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
    // Floats over the content it covers: the one place a shadow belongs.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 10,
  },
  /** Clips the airmail edge to the card's corners without clipping its shadow. */
  inner: {
    borderRadius: radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  body: {
    paddingHorizontal: spacing[3],
    paddingTop: spacing[3],
    paddingBottom: spacing[3],
    gap: spacing[3],
  },
  bodyPlain: {
    borderRadius: radius.xl,
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
  more: {
    minWidth: 32,
    height: 24,
    borderRadius: radius.pill,
    paddingHorizontal: spacing[2],
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: {
    fontFamily: fonts.sansSb,
    fontSize: 12,
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
})
