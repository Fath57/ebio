import type { LayoutChangeEvent } from 'react-native'
import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated'
import Svg, { Path, Rect } from 'react-native-svg'
import { colors, fonts, radius, spacing } from '../../../../theme/theme'
import { formatKg } from '../../terroir-api'
import { DottedLine } from './valise-art'
import { useValisePalette } from './valise-palette'

const BODY_HEIGHT = 112
const LID_HEIGHT = 34
const MAX_MARKS = 6
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1)

interface LidProps {
  width: number
  leather: string
  lining: string
  motif: string
}

/** The open lid seen from the front: leather rim, indigo lining with a woven motif. */
function Lid({ width, leather, lining, motif }: LidProps) {
  const inset = 10
  const crosses: string[] = []
  for (let x = inset + 14; x < width - inset - 8; x += 22)
    crosses.push(`M ${x - 4} 13 L ${x + 4} 21 M ${x + 4} 13 L ${x - 4} 21`)
  return (
    <Svg width={width} height={LID_HEIGHT}>
      <Path d={`M ${inset} ${LID_HEIGHT} L ${inset + 8} 2 H ${width - inset - 8} L ${width - inset} ${LID_HEIGHT} Z`} fill={leather} />
      <Path d={`M ${inset + 6} ${LID_HEIGHT} L ${inset + 12} 7 H ${width - inset - 12} L ${width - inset - 6} ${LID_HEIGHT} Z`} fill={lining} />
      <Path d={crosses.join(' ')} stroke={motif} strokeWidth={1.4} strokeLinecap="round" />
      <Rect x={width / 2 - 14} y={LID_HEIGHT - 4} width={28} height={4} rx={1} fill={leather} />
    </Svg>
  )
}

interface SuitcaseGaugeProps {
  weightKg: number
  billedKg: number
}

/**
 * « 3,2 kg sur 5 kg payés »: an open suitcase whose contents rise with the
 * kilos, a mark for each billed kilo. Past what is paid, the contents turn
 * to leather and stop at the rim.
 */
export function SuitcaseGauge({ weightKg, billedKg }: SuitcaseGaugeProps) {
  const palette = useValisePalette()
  const reduced = useReducedMotion()
  const [width, setWidth] = useState(0)
  const ratio = billedKg > 0 ? Math.min(1, weightKg / billedKg) : 0
  const within = weightKg <= billedKg
  const percent = Math.round(ratio * 100)
  const level = useSharedValue(0)

  useEffect(() => {
    level.set(withTiming(ratio, { duration: reduced ? 0 : 650, easing: EASE_OUT }))
  }, [ratio, reduced, level])

  const contentsStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - level.get()) * BODY_HEIGHT }],
  }))

  const onLayout = (event: LayoutChangeEvent): void => {
    const next = Math.round(event.nativeEvent.layout.width)
    if (next !== width)
      setWidth(next)
  }

  // One mark per kilo, thinned out on a large parcel.
  const step = Math.max(1, Math.ceil(billedKg / MAX_MARKS))
  const marks: number[] = []
  for (let kg = step; kg < billedKg; kg += step)
    marks.push(kg)

  return (
    <View style={styles.gauge}>
      <Text style={[styles.figure, { color: palette.ink }]}>
        {`${formatKg(weightKg)} sur ${formatKg(billedKg)} payés`}
      </Text>
      <View
        style={styles.suitcase}
        onLayout={onLayout}
        accessibilityRole="progressbar"
        accessibilityLabel="Remplissage de votre valise"
        accessibilityValue={{ min: 0, max: 100, now: percent, text: `${formatKg(weightKg)} sur ${formatKg(billedKg)} payés` }}
      >
        {width > 0 && <Lid width={width} leather={palette.leather} lining={colors.blue[600]} motif={colors.blue[200]} />}
        <View style={[styles.body, { borderColor: palette.leather, backgroundColor: palette.paper }]}>
          <Animated.View style={[styles.contents, contentsStyle]}>
            <View style={[styles.contentsTop, { backgroundColor: within ? palette.paperEdge : palette.leather, borderColor: palette.ink }]} />
            <View style={[styles.contentsFill, { backgroundColor: within ? palette.paperEdge : palette.leather }]} />
          </Animated.View>
          {marks.map(kg => (
            <View key={kg} style={[styles.mark, { bottom: (kg / billedKg) * BODY_HEIGHT }]}>
              <Text style={[styles.markLabel, { color: palette.ink }]}>{`${kg} kg`}</Text>
              <DottedLine color={palette.ink} variant="dashes" style={styles.markLine} />
            </View>
          ))}
          <View style={[styles.strap, styles.strapLeft, { backgroundColor: palette.leather }]} />
          <View style={[styles.strap, styles.strapRight, { backgroundColor: palette.leather }]} />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  gauge: {
    gap: spacing[3],
  },
  figure: {
    fontFamily: fonts.mono,
    fontSize: 18,
    lineHeight: 24,
  },
  suitcase: {
    width: '100%',
  },
  body: {
    height: BODY_HEIGHT + 6,
    borderWidth: 3,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  contents: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: BODY_HEIGHT,
  },
  contentsTop: {
    height: 10,
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.sm,
    borderTopWidth: 1,
    marginHorizontal: spacing[1],
  },
  contentsFill: {
    flex: 1,
  },
  mark: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingLeft: spacing[2],
  },
  markLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
  },
  markLine: {
    flex: 1,
    opacity: 0.55,
    marginRight: spacing[2],
  },
  strap: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 8,
    opacity: 0.85,
  },
  strapLeft: {
    left: '22%',
  },
  strapRight: {
    right: '22%',
  },
})
