import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native'
import type { CategoryItem } from '../../../utils/category-icons'
import ChevronLeft from 'lucide-react-native/dist/esm/icons/chevron-left'
import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right'
import { useRef, useState } from 'react'
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { colors, fonts, radius, shadows, spacing } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'

interface CategoryRailProps {
  categories: CategoryItem[]
  onSelect: (slug: string) => void
}

const TILE_WIDTH = 72
const TILE_GAP = spacing[4]
/** Un « saut » de flèche = 3 pastilles, soit environ un écran de rail. */
const SCROLL_STEP = (TILE_WIDTH + TILE_GAP) * 3
/** Marge de tolérance avant de masquer une flèche en bout de course. */
const EDGE_EPSILON = 4

/**
 * Rail horizontal des catégories, avec flèches de navigation affichées
 * uniquement lorsqu'il reste du contenu à découvrir dans cette direction.
 */
export function CategoryRail({ categories, onSelect }: CategoryRailProps) {
  const { semantic } = useTheme()
  const scrollRef = useRef<ScrollView>(null)
  const [scrollX, setScrollX] = useState(0)
  const [viewWidth, setViewWidth] = useState(0)
  const [contentWidth, setContentWidth] = useState(0)

  const canScrollLeft = scrollX > EDGE_EPSILON
  const canScrollRight = scrollX + viewWidth < contentWidth - EDGE_EPSILON

  const scrollBy = (delta: number) => {
    const maxOffset = Math.max(0, contentWidth - viewWidth)
    const next = Math.min(Math.max(0, scrollX + delta), maxOffset)
    scrollRef.current?.scrollTo({ x: next, animated: true })
  }

  return (
    <View style={styles.wrapper}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        contentContainerStyle={styles.row}
        onLayout={e => setViewWidth(e.nativeEvent.layout.width)}
        onContentSizeChange={w => setContentWidth(w)}
        onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => setScrollX(e.nativeEvent.contentOffset.x)}
      >
        {categories.map(cat => (
          <CategoryTile
            key={cat.id}
            category={cat}
            onPress={() => onSelect(cat.slug)}
            textColor={semantic.textSecondary}
          />
        ))}
      </ScrollView>

      {canScrollLeft && (
        <RailArrow
          side="left"
          background={semantic.bgCard}
          borderColor={semantic.borderLight}
          iconColor={semantic.textSecondary}
          onPress={() => scrollBy(-SCROLL_STEP)}
        />
      )}
      {canScrollRight && (
        <RailArrow
          side="right"
          background={semantic.bgCard}
          borderColor={semantic.borderLight}
          iconColor={semantic.textSecondary}
          onPress={() => scrollBy(SCROLL_STEP)}
        />
      )}
    </View>
  )
}

function RailArrow({ side, background, borderColor, iconColor, onPress }: {
  side: 'left' | 'right'
  background: string
  borderColor: string
  iconColor: string
  onPress: () => void
}) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight
  return (
    <Pressable
      style={[
        styles.arrow,
        side === 'left' ? styles.arrowLeft : styles.arrowRight,
        { backgroundColor: background, borderColor },
      ]}
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={side === 'left' ? 'Catégories précédentes' : 'Catégories suivantes'}
    >
      <Icon size={18} color={iconColor} strokeWidth={2.4} />
    </Pressable>
  )
}

function CategoryTile({ category, onPress, textColor }: {
  category: CategoryItem
  onPress: () => void
  textColor: string
}) {
  return (
    <Pressable
      style={styles.tile}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={category.label}
    >
      <View style={styles.circle}>
        {category.imageUrl
          ? <Image source={{ uri: category.imageUrl }} style={styles.circleImage} />
          : <category.fallbackIcon size={24} color={colors.green[600]} strokeWidth={2} />}
      </View>
      <Text style={[styles.label, { color: textColor }]} numberOfLines={2}>
        {category.label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  row: {
    paddingHorizontal: spacing[4],
    gap: TILE_GAP,
  },
  tile: {
    alignItems: 'center',
    width: TILE_WIDTH,
    gap: spacing[1],
  },
  circle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.green[50],
    ...shadows.sm,
  },
  circleImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  label: {
    fontFamily: fonts.sansMd,
    fontSize: 12,
    lineHeight: 12 * 1.3,
    textAlign: 'center',
  },
  arrow: {
    position: 'absolute',
    top: 14,
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.sm,
  },
  arrowLeft: {
    left: spacing[2],
  },
  arrowRight: {
    right: spacing[2],
  },
})
