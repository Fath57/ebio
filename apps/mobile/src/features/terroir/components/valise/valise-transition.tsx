import type { SharedValue } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import Plane from 'lucide-react-native/dist/esm/icons/plane'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { AccessibilityInfo, Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { colors, fonts, spacing } from '../../../../theme/theme'
import { useTerroirMoney } from '../../hooks/use-terroir-money'
import { useTerroirCart } from '../../terroir-cart-context'
import { AirmailBand, CLOSED_RATIO, OPEN_RATIO, RubberStamp, VALISE_IMAGES } from './valise-art'
import { departureHeadline, useValiseDepartures } from './valise-stores'

/**
 * The moment the app turns into « La Valise du pays », and back.
 *
 * Enter (about 1,5 s, a tap skips it): the open suitcase drops in and shuts,
 * the « Valise du pays » stamp lands with a light tick, the plane draws the
 * dotted route from Cotonou, then the sheet slides up on the app already in
 * mode. Exit is the short reverse: the sheet comes down, the stamp lifts, the
 * sheet leaves on the ordinary app.
 *
 * Everything moves on the UI thread (transform and opacity only); the mode
 * itself flips while the sheet covers the screen (`onCovered`), so the heavy
 * re-render happens out of sight. Reduced motion: a plain fade.
 */

type TransitionKind = 'enter' | 'exit'

interface PendingTransition {
  id: number
  kind: TransitionKind
  onCovered: () => void
}

let pending: PendingTransition | null = null
let nextId = 1
const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach(listener => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Plays the effect; `onCovered` runs once the screen is hidden (or right away if replaced). */
export function playValiseTransition(kind: TransitionKind, onCovered: () => void): void {
  // A transition still running gives way: its change happens now.
  pending?.onCovered()
  pending = { id: nextId, kind, onCovered }
  nextId += 1
  emit()
}

function finishTransition(id: number): void {
  if (pending?.id !== id)
    return
  pending = null
  emit()
}

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1)
const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1)
const EASE_SHEET = Easing.bezier(0.32, 0.72, 0, 1)

const DOTS = 20
const ROUTE_HEIGHT = 96
const ROUTE_LIFT = 56

function fireStampHaptic(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined)
}

/** A point on the quadratic route, 0 to 1. */
function routePoint(t: number, width: number): { x: number, y: number, angle: number } {
  'worklet'
  const x0 = spacing[6]
  const x2 = width - spacing[6]
  const y0 = ROUTE_HEIGHT - 12
  const cx = width / 2
  const cy = y0 - ROUTE_LIFT * 2
  const u = 1 - t
  const x = u * u * x0 + 2 * u * t * cx + t * t * x2
  const y = u * u * y0 + 2 * u * t * cy + t * t * y0
  const dx = 2 * u * (cx - x0) + 2 * t * (x2 - cx)
  const dy = 2 * u * (cy - y0) + 2 * t * (y0 - cy)
  return { x, y, angle: Math.atan2(dy, dx) * 180 / Math.PI }
}

interface FlightDotProps {
  index: number
  width: number
  flight: SharedValue<number>
}

function FlightDot({ index, width, flight }: FlightDotProps) {
  const t = (index + 1) / (DOTS + 1)
  const point = routePoint(t, width)
  const style = useAnimatedStyle(() => ({
    opacity: flight.get() >= t ? 1 : 0.18,
  }))
  return <Animated.View style={[styles.dot, { left: point.x - 2, top: point.y - 2 }, style]} />
}

interface FlightPlaneProps {
  width: number
  flight: SharedValue<number>
}

function FlightPlane({ width, flight }: FlightPlaneProps) {
  const style = useAnimatedStyle(() => {
    const point = routePoint(flight.get(), width)
    // The plane glyph points up and to the right (−45°).
    return {
      opacity: flight.get() > 0.01 ? 1 : 0,
      transform: [
        { translateX: point.x - 11 },
        { translateY: point.y - 11 },
        { rotate: `${point.angle + 45}deg` },
      ],
    }
  })
  return (
    <Animated.View style={[styles.plane, style]}>
      <Plane size={22} color={colors.earth[100]} strokeWidth={2} fill={colors.earth[100]} />
    </Animated.View>
  )
}

interface ValiseTransitionProps {
  kind: TransitionKind
  onCovered: () => void
  onDone: () => void
}

function ValiseTransition({ kind, onCovered, onDone }: ValiseTransitionProps) {
  const reduced = useReducedMotion()
  const { width, height } = useWindowDimensions()
  const { countryInfo } = useTerroirCart()
  const { displayCurrency } = useTerroirMoney()
  const departures = useValiseDepartures(countryInfo?.code ?? null, displayCurrency)
  const headline = departureHeadline(departures)

  const enter = kind === 'enter'
  // 0 hidden, 1 shown: the backdrop and its content.
  const veil = useSharedValue(enter || reduced ? 0 : 1)
  const drop = useSharedValue(enter ? 0 : 1)
  const shut = useSharedValue(enter ? 0 : 1)
  const stamp = useSharedValue(enter ? 0 : 1)
  const flight = useSharedValue(enter ? 0 : 1)
  // 0 covers the screen, 1 has left upward. Exit starts above the screen.
  const wipe = useSharedValue(enter || reduced ? 0 : 1)
  const coveredRef = useRef(false)
  const doneRef = useRef(false)

  const cover = (): void => {
    if (coveredRef.current)
      return
    coveredRef.current = true
    onCovered()
  }
  const done = (): void => {
    if (doneRef.current)
      return
    doneRef.current = true
    cover()
    onDone()
  }
  // Read through refs by the worklet callbacks, which keep the first closure.
  const coverRef = useRef(cover)
  coverRef.current = cover
  const doneFnRef = useRef(done)
  doneFnRef.current = done
  const callCover = (): void => coverRef.current()
  const callDone = (): void => doneFnRef.current()

  useEffect(() => {
    if (reduced) {
      // Fewer and gentler: a fade, the final picture, a fade.
      veil.set(withTiming(1, { duration: 160 }, (finished) => {
        if (finished)
          scheduleOnRN(callCover)
      }))
      drop.set(1)
      shut.set(1)
      stamp.set(1)
      flight.set(1)
      wipe.set(withDelay(enter ? 900 : 500, withTiming(1, { duration: 200 }, (finished) => {
        if (finished)
          scheduleOnRN(callDone)
      })))
      return
    }
    if (enter) {
      veil.set(withTiming(1, { duration: 160, easing: EASE_OUT }, (finished) => {
        if (finished)
          scheduleOnRN(callCover)
      }))
      drop.set(withDelay(60, withTiming(1, { duration: 420, easing: EASE_OUT })))
      shut.set(withDelay(500, withTiming(1, { duration: 140, easing: EASE_IN_OUT })))
      stamp.set(withDelay(660, withTiming(1, { duration: 170, easing: EASE_OUT }, (finished) => {
        if (finished)
          scheduleOnRN(fireStampHaptic)
      })))
      flight.set(withDelay(700, withTiming(1, { duration: 520, easing: EASE_IN_OUT })))
      wipe.set(withDelay(1260, withTiming(1, { duration: 320, easing: EASE_SHEET }, (finished) => {
        if (finished)
          scheduleOnRN(callDone)
      })))
      return
    }
    // Exit: the sheet comes down, the stamp lifts, the sheet leaves.
    wipe.set(withSequence(
      withTiming(0, { duration: 260, easing: EASE_SHEET }, (finished) => {
        if (finished)
          scheduleOnRN(callCover)
      }),
      withDelay(380, withTiming(1, { duration: 280, easing: EASE_SHEET }, (finished) => {
        if (finished)
          scheduleOnRN(callDone)
      })),
    ))
    stamp.set(withDelay(320, withTiming(0, { duration: 200, easing: EASE_OUT })))
    drop.set(withDelay(380, withTiming(0, { duration: 260, easing: EASE_IN_OUT })))
    flight.set(withDelay(300, withTiming(0, { duration: 260 })))
  }, [])

  // A transition cut short (unmounted) still applies its change.
  useEffect(() => () => {
    if (!coveredRef.current)
      coverRef.current()
  }, [])

  useEffect(() => {
    if (enter)
      AccessibilityInfo.announceForAccessibility(countryInfo ? `Valise du pays, valise ${countryInfo.toPhrase}` : 'Valise du pays')
    else
      AccessibilityInfo.announceForAccessibility('Vous avez quitté la Valise du pays')
  }, [])

  const skip = (): void => {
    if (!coveredRef.current)
      return
    drop.set(1)
    shut.set(1)
    stamp.set(enter ? 1 : 0)
    flight.set(1)
    wipe.set(withTiming(1, { duration: reduced ? 150 : 220, easing: EASE_SHEET }, (finished) => {
      if (finished)
        scheduleOnRN(callDone)
    }))
  }

  const sheetStyle = useAnimatedStyle(() => reduced
    ? { opacity: veil.get() * (1 - wipe.get()) }
    : { opacity: veil.get(), transform: [{ translateY: -wipe.get() * height }] })

  const suitcaseWidth = Math.min(260, Math.round(width * 0.64))
  const openHeight = Math.round(suitcaseWidth * OPEN_RATIO)
  const closedHeight = Math.round(suitcaseWidth * CLOSED_RATIO)

  const dropStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, drop.get() * 3),
    transform: [
      { translateY: (1 - drop.get()) * -height * 0.45 },
      { rotate: `${(1 - drop.get()) * -9}deg` },
    ],
  }))
  // The lid shuts: the open suitcase squashes down as the closed one lands on it.
  const openStyle = useAnimatedStyle(() => ({
    opacity: 1 - shut.get(),
    transform: [{ scaleY: 1 - shut.get() * 0.3 }],
  }))
  const closedStyle = useAnimatedStyle(() => ({
    opacity: shut.get(),
    transform: [{ scaleY: 1.08 - shut.get() * 0.08 }],
  }))
  const stampStyle = useAnimatedStyle(() => ({
    opacity: stamp.get(),
    transform: enter
      ? [{ scale: 1.9 - stamp.get() * 0.9 }]
      : [{ translateY: (1 - stamp.get()) * -28 }, { scale: 1.35 - stamp.get() * 0.35 }],
  }))

  const destinationCode = countryInfo?.code ?? ''
  const destinationName = headline?.city ?? countryInfo?.name ?? ''
  const postmark = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <Animated.View style={[styles.sheet, sheetStyle]} accessibilityViewIsModal>
      <Pressable
        style={styles.fill}
        onPress={skip}
        accessibilityRole="button"
        accessibilityLabel={enter ? 'Passer l’animation' : 'Fermer'}
      >
        <View style={[styles.route, { height: ROUTE_HEIGHT, marginTop: Math.round(height * 0.1) }]}>
          {Array.from({ length: DOTS }, (_, index) => (
            <FlightDot key={index} index={index} width={width} flight={flight} />
          ))}
          <FlightPlane width={width} flight={flight} />
          <View style={[styles.airport, styles.airportLeft]}>
            <Text style={styles.code} maxFontSizeMultiplier={1.2}>COO</Text>
            <Text style={styles.city} numberOfLines={1} maxFontSizeMultiplier={1.2}>Cotonou</Text>
          </View>
          {destinationCode !== '' && (
            <View style={[styles.airport, styles.airportRight]}>
              <Text style={[styles.code, styles.right]} maxFontSizeMultiplier={1.2}>{destinationCode}</Text>
              <Text style={[styles.city, styles.right]} numberOfLines={1} maxFontSizeMultiplier={1.2}>{destinationName}</Text>
            </View>
          )}
        </View>

        <View style={styles.center}>
          <Animated.View style={[{ width: suitcaseWidth, height: openHeight }, dropStyle]}>
            <Animated.View style={[styles.image, styles.bottomOrigin, openStyle]}>
              <Image source={VALISE_IMAGES.open} style={{ width: suitcaseWidth, height: openHeight }} resizeMode="contain" accessibilityIgnoresInvertColors />
            </Animated.View>
            <Animated.View style={[styles.image, styles.bottomOrigin, closedStyle]}>
              <Image source={VALISE_IMAGES.closed} style={{ width: suitcaseWidth, height: closedHeight }} resizeMode="contain" accessibilityIgnoresInvertColors />
            </Animated.View>
            <Animated.View style={[styles.stamp, stampStyle]}>
              <RubberStamp
                lines={['Valise du pays', `Cotonou ${postmark}`]}
                ink={colors.blue[600]}
                paper={colors.earth[50]}
                tilt={-8}
                size="lg"
              />
            </Animated.View>
          </Animated.View>

          <Text style={styles.title} maxFontSizeMultiplier={1.3}>La Valise du pays</Text>
          <Text style={styles.subtitle} maxFontSizeMultiplier={1.3}>
            {enter
              ? countryInfo ? `Votre valise ${countryInfo.toPhrase}` : 'Le goût du pays, livré à l’étranger'
              : 'Votre valise vous attend pour le prochain départ'}
          </Text>
        </View>
      </Pressable>
      <AirmailBand height={10} colorA={colors.earth[400]} colorB={colors.blue[600]} background={colors.earth[50]} />
    </Animated.View>
  )
}

/** Mounted once, beside the app: plays whatever `playValiseTransition` asked. */
export function ValiseTransitionHost() {
  const current = useSyncExternalStore(subscribe, () => pending)
  if (!current)
    return null
  return (
    <ValiseTransition
      key={current.id}
      kind={current.kind}
      onCovered={current.onCovered}
      onDone={() => finishTransition(current.id)}
    />
  )
}

const styles = StyleSheet.create({
  sheet: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.blue[800],
    zIndex: 1000,
    elevation: 1000,
  },
  fill: {
    flex: 1,
  },
  route: {
    width: '100%',
  },
  dot: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.blue[100],
  },
  plane: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 22,
    height: 22,
  },
  airport: {
    position: 'absolute',
    bottom: -40,
    maxWidth: '45%',
  },
  airportLeft: {
    left: spacing[4],
  },
  airportRight: {
    right: spacing[4],
    alignItems: 'flex-end',
  },
  code: {
    fontFamily: fonts.sansBd,
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: 1,
    color: colors.neutral[0],
  },
  city: {
    fontFamily: fonts.sansMd,
    fontSize: 12,
    color: colors.blue[100],
  },
  right: {
    textAlign: 'right',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[6],
    paddingBottom: spacing[10],
  },
  image: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  bottomOrigin: {
    transformOrigin: 'bottom',
  },
  stamp: {
    position: 'absolute',
    right: -spacing[4],
    bottom: -spacing[3],
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 34,
    lineHeight: 40,
    color: colors.earth[50],
    textAlign: 'center',
    marginTop: spacing[6],
  },
  subtitle: {
    fontFamily: fonts.sansMd,
    fontSize: 15,
    lineHeight: 22,
    color: colors.blue[100],
    textAlign: 'center',
  },
})
