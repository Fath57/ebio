import type { ImageSourcePropType, LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Svg, { Line, Path, Polygon, Rect } from 'react-native-svg'
import { fonts, radius, spacing } from '../../../../theme/theme'

// ---------------------------------------------------------------------------
// Illustrations (flat editorial style, transparent background)

export const VALISE_IMAGES: Record<'open' | 'closed' | 'waiting', ImageSourcePropType> = {
  /** 680 × 720: open, full of home products. */
  open: require('../../../../../assets/valise/valise-open.webp'),
  /** 720 × 621: closed, with stickers and a tag. */
  closed: require('../../../../../assets/valise/valise-closed.webp'),
  /** 702 × 720: round vignette on the tarmac. */
  waiting: require('../../../../../assets/valise/valise-waiting.webp'),
}

export const OPEN_RATIO = 720 / 680
export const CLOSED_RATIO = 621 / 720
export const WAITING_RATIO = 720 / 702

/** Reads a view's width once it is laid out: the SVG parts below draw to it. */
function useMeasuredWidth(): [number, (event: LayoutChangeEvent) => void] {
  const [width, setWidth] = useState(0)
  const onLayout = (event: LayoutChangeEvent): void => {
    const next = Math.round(event.nativeEvent.layout.width)
    if (next !== width)
      setWidth(next)
  }
  return [width, onLayout]
}

// ---------------------------------------------------------------------------
// Airmail border

const STRIPE_WIDTH = 7
const STRIPE_PERIOD = 14

/** The slanted stripes of an airmail envelope, for a band of the given size. */
export function airmailStripes(width: number, height: number, top = 0): Array<{ points: string, odd: boolean }> {
  const stripes: Array<{ points: string, odd: boolean }> = []
  let index = 0
  for (let x = -height; x < width + height; x += STRIPE_PERIOD) {
    stripes.push({
      points: `${x},${top + height} ${x + height},${top} ${x + height + STRIPE_WIDTH},${top} ${x + STRIPE_WIDTH},${top + height}`,
      odd: index % 2 === 1,
    })
    index += 1
  }
  return stripes
}

interface AirmailBandProps {
  height?: number
  colorA: string
  colorB: string
  /** The paper between the stripes; transparent shows what is behind. */
  background?: string
  style?: StyleProp<ViewStyle>
}

/** A full-width band of airmail stripes. */
export function AirmailBand({ height = 6, colorA, colorB, background = 'transparent', style }: AirmailBandProps) {
  const [width, onLayout] = useMeasuredWidth()
  return (
    <View style={[{ height, backgroundColor: background }, style]} onLayout={onLayout} importantForAccessibility="no-hide-descendants">
      {width > 0 && (
        <Svg width={width} height={height}>
          {airmailStripes(width, height).map(stripe => (
            <Polygon key={stripe.points} points={stripe.points} fill={stripe.odd ? colorB : colorA} />
          ))}
        </Svg>
      )}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Dotted flight line and tear line

interface DottedLineProps {
  color: string
  /** Dots (round caps) or dashes (a perforation). */
  variant?: 'dots' | 'dashes'
  style?: StyleProp<ViewStyle>
}

/** A horizontal dotted line that fills its row. */
export function DottedLine({ color, variant = 'dots', style }: DottedLineProps) {
  const [width, onLayout] = useMeasuredWidth()
  const dots = variant === 'dots'
  return (
    <View style={[styles.dotted, style]} onLayout={onLayout} importantForAccessibility="no-hide-descendants">
      {width > 0 && (
        <Svg width={width} height={4}>
          <Line
            x1={2}
            y1={2}
            x2={width - 2}
            y2={2}
            stroke={color}
            strokeWidth={dots ? 2.2 : 1.4}
            strokeLinecap={dots ? 'round' : 'butt'}
            strokeDasharray={dots ? '0.1 7' : '6 5'}
          />
        </Svg>
      )}
    </View>
  )
}

interface TearLineProps {
  /** The colour behind the card, seen through the punched notches. */
  notchColor: string
  edgeColor: string
}

/** The perforated line of a ticket, with its two half-moon notches. */
export function TearLine({ notchColor, edgeColor }: TearLineProps) {
  return (
    <View style={styles.tear} importantForAccessibility="no-hide-descendants">
      <View style={[styles.notch, styles.notchLeft, { backgroundColor: notchColor, borderColor: edgeColor }]} />
      <DottedLine color={edgeColor} variant="dashes" style={styles.tearLine} />
      <View style={[styles.notch, styles.notchRight, { backgroundColor: notchColor, borderColor: edgeColor }]} />
    </View>
  )
}

// ---------------------------------------------------------------------------
// Rubber stamp

interface RubberStampProps {
  lines: string[]
  ink: string
  paper: string
  /** Degrees; a stamp is never quite straight. */
  tilt?: number
  size?: 'sm' | 'lg'
  style?: StyleProp<ViewStyle>
}

/** A rubber stamp: double border, inked capitals, slightly askew. */
export function RubberStamp({ lines, ink, paper, tilt = -4, size = 'sm', style }: RubberStampProps) {
  const large = size === 'lg'
  return (
    <View
      style={[
        styles.stampOuter,
        large && styles.stampOuterLarge,
        { borderColor: ink, backgroundColor: paper, transform: [{ rotate: `${tilt}deg` }] },
        style,
      ]}
    >
      <View style={[styles.stampInner, large && styles.stampInnerLarge, { borderColor: ink }]}>
        {lines.map((line, index) => (
          <Text
            key={line}
            style={[
              index === 0 ? styles.stampMain : styles.stampSub,
              large && (index === 0 ? styles.stampMainLarge : styles.stampSubLarge),
              { color: ink },
            ]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}
          >
            {line}
          </Text>
        ))}
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Mini suitcase (fill indicator)

interface MiniSuitcaseProps {
  /** 0 to 1: how full; null draws it empty. */
  ratio: number | null
  stroke: string
  fill: string
  size?: number
}

/** A small suitcase outline that fills from the bottom. */
export function MiniSuitcase({ ratio, stroke, fill, size = 28 }: MiniSuitcaseProps) {
  const height = Math.round(size * 0.86)
  const bodyTop = 6
  const bodyHeight = 18
  const level = Math.max(0, Math.min(1, ratio ?? 0))
  const fillHeight = Math.round((bodyHeight - 3) * level)
  return (
    <Svg width={size} height={height} viewBox="0 0 28 24">
      <Path d="M10 6 V3.5 Q10 2 11.5 2 H16.5 Q18 2 18 3.5 V6" stroke={stroke} strokeWidth={1.8} fill="none" />
      {fillHeight > 0 && (
        <Rect x={3.5} y={bodyTop + bodyHeight - 1.5 - fillHeight} width={21} height={fillHeight} rx={1.5} fill={fill} />
      )}
      <Rect x={2} y={bodyTop} width={24} height={bodyHeight - 0.5} rx={3} stroke={stroke} strokeWidth={1.8} fill="none" />
      <Line x1={8} y1={bodyTop} x2={8} y2={bodyTop + bodyHeight - 0.5} stroke={stroke} strokeWidth={1.4} />
      <Line x1={20} y1={bodyTop} x2={20} y2={bodyTop + bodyHeight - 0.5} stroke={stroke} strokeWidth={1.4} />
    </Svg>
  )
}

const styles = StyleSheet.create({
  dotted: {
    height: 4,
    justifyContent: 'center',
  },
  tear: {
    height: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tearLine: {
    flex: 1,
    marginHorizontal: spacing[2],
  },
  notch: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
  },
  notchLeft: {
    marginLeft: -9,
  },
  notchRight: {
    marginRight: -9,
  },
  stampOuter: {
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderRadius: radius.xs,
    padding: 2,
  },
  stampOuterLarge: {
    borderWidth: 2.5,
    borderRadius: radius.sm,
    padding: 3,
  },
  stampInner: {
    borderWidth: 1,
    borderRadius: 2,
    paddingHorizontal: spacing[1],
    paddingVertical: 1,
    alignItems: 'center',
  },
  stampInnerLarge: {
    borderWidth: 1.5,
    borderRadius: radius.xs,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  stampMain: {
    fontFamily: fonts.sansBd,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  stampMainLarge: {
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: 1.2,
  },
  stampSub: {
    fontFamily: fonts.sansSb,
    fontSize: 8,
    lineHeight: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  stampSubLarge: {
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 1,
  },
})
