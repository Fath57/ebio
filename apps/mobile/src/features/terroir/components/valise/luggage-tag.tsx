import type { ReactNode } from 'react'
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native'
import { useId, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Svg, { Circle, ClipPath, Defs, G, Path, Polygon } from 'react-native-svg'
import { airmailStripes } from './valise-art'

const CHAMFER = 12
const CORNER = 8
const EYELET_X = 14
const EYELET_RADIUS = 4.5
/** Room on the left for the chamfer and the eyelet. */
export const TAG_HEAD = 30

interface TagColors {
  fill: string
  stroke: string
  /** Seen through the eyelet: the colour behind the tag. */
  hole: string
  ring: string
  string?: string
  stripeA?: string
  stripeB?: string
}

interface LuggageTagProps {
  colors: TagColors
  /** An airmail band along the bottom edge. */
  stripes?: boolean
  dashed?: boolean
  style?: StyleProp<ViewStyle>
  contentStyle?: StyleProp<ViewStyle>
  children: ReactNode
}

/** The tag's outline: chamfered on the eyelet side, rounded on the other. */
function tagPath(width: number, height: number): string {
  const w = width - 0.75
  const h = height - 0.75
  const o = 0.75
  return [
    `M ${CHAMFER} ${o}`,
    `H ${w - CORNER}`,
    `Q ${w} ${o} ${w} ${CORNER}`,
    `V ${h - CORNER}`,
    `Q ${w} ${h} ${w - CORNER} ${h}`,
    `H ${CHAMFER}`,
    `L ${o} ${h - CHAMFER}`,
    `V ${CHAMFER}`,
    'Z',
  ].join(' ')
}

/**
 * A luggage tag drawn behind its content: chamfered head, reinforced eyelet,
 * the end of its string, and optionally an airmail edge.
 */
export function LuggageTag({ colors, stripes = false, dashed = false, style, contentStyle, children }: LuggageTagProps) {
  const [size, setSize] = useState<{ width: number, height: number } | null>(null)
  const clipId = `tag${useId().replace(/\W/g, '')}`

  const onLayout = (event: LayoutChangeEvent): void => {
    const width = Math.round(event.nativeEvent.layout.width)
    const height = Math.round(event.nativeEvent.layout.height)
    if (!size || size.width !== width || size.height !== height)
      setSize({ width, height })
  }

  const path = size ? tagPath(size.width, size.height) : ''
  const eyeletY = size ? size.height / 2 : 0
  const bandHeight = 5
  return (
    <View style={style} onLayout={onLayout}>
      {size && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none" importantForAccessibility="no-hide-descendants">
          <Svg width={size.width} height={size.height}>
            <Defs>
              <ClipPath id={clipId}>
                <Path d={path} />
              </ClipPath>
            </Defs>
            <Path d={path} fill={colors.fill} />
            {stripes && colors.stripeA && colors.stripeB && (
              <G clipPath={`url(#${clipId})`}>
                {airmailStripes(size.width, bandHeight, size.height - bandHeight).map(stripe => (
                  <Polygon key={stripe.points} points={stripe.points} fill={stripe.odd ? colors.stripeB : colors.stripeA} />
                ))}
              </G>
            )}
            <Path d={path} fill="none" stroke={colors.stroke} strokeWidth={1.5} strokeDasharray={dashed ? '5 4' : undefined} />
            {colors.string && (
              <Path
                d={`M ${EYELET_X} ${eyeletY} C ${EYELET_X - 6} ${eyeletY - 10} ${EYELET_X - 2} ${eyeletY - 18} ${-2} ${Math.max(2, eyeletY - 22)}`}
                stroke={colors.string}
                strokeWidth={1.4}
                strokeLinecap="round"
                fill="none"
              />
            )}
            <Circle cx={EYELET_X} cy={eyeletY} r={EYELET_RADIUS + 2} fill={colors.ring} />
            <Circle cx={EYELET_X} cy={eyeletY} r={EYELET_RADIUS} fill={colors.hole} />
          </Svg>
        </View>
      )}
      <View style={[styles.content, stripes && styles.contentStriped, contentStyle]}>
        {children}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingLeft: TAG_HEAD,
  },
  contentStriped: {
    paddingBottom: 5,
  },
})
