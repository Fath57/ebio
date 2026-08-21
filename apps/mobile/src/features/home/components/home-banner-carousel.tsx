import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native'
import type { HomeBanner } from '../hooks/use-home-banners'
import { LinearGradient } from 'expo-linear-gradient'
import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Image, Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { colors, fonts, radius, shadows, spacing } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'

interface HomeBannerCarouselProps {
  items: HomeBanner[]
  onOpenSupplier: (supplierId: string) => void
  onOpenProduct: (productId: string) => void
}

/** Reading time for one banner before moving to the next. */
const AUTOPLAY_MS = 5000
/** Grace period after a gesture, so autoplay never takes over under the finger. */
const RESUME_AFTER_TOUCH_MS = 8000

/**
 * Banner carousel at the top of the home screen: large image, title and
 * subtitle overlaid. The next card deliberately peeks out to signal that the
 * row scrolls horizontally.
 *
 * Scrolling is automatic but yields to the user: any gesture suspends it, and
 * it only resumes after a delay. It is disabled when the system reports a
 * preference for reduced motion.
 */
export function HomeBannerCarousel({ items, onOpenSupplier, onOpenProduct }: HomeBannerCarouselProps) {
  /** A banner leads where its type says: a screen, the browser, or nowhere. */
  function handleBannerPress(banner: HomeBanner): void {
    if (banner.targetType === 'SUPPLIER' && banner.targetId) {
      onOpenSupplier(banner.targetId)
    }
    else if (banner.targetType === 'PRODUCT' && banner.targetId) {
      onOpenProduct(banner.targetId)
    }
    else if (banner.targetType === 'URL' && banner.targetUrl) {
      Linking.openURL(banner.targetUrl).catch(() => {
        // A malformed link must not crash the home screen.
      })
    }
  }

  const { width } = useWindowDimensions()
  const { semantic } = useTheme()
  const scrollRef = useRef<ScrollView>(null)
  const indexRef = useRef(0)
  const [activeIndex, setActiveIndex] = useState(0)
  const [autoplay, setAutoplay] = useState(true)
  const [reduceMotion, setReduceMotion] = useState(false)

  const cardWidth = width - spacing[4] * 2 - spacing[8]
  const stride = cardWidth + spacing[3]

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => setReduceMotion(false))
  }, [])

  useEffect(() => {
    if (!autoplay || reduceMotion || items.length < 2)
      return

    const timer = setInterval(() => {
      // Wraps around after the last one: looping avoids a dead end.
      const next = (indexRef.current + 1) % items.length
      indexRef.current = next
      setActiveIndex(next)
      scrollRef.current?.scrollTo({ x: next * stride, animated: true })
    }, AUTOPLAY_MS)

    return () => clearInterval(timer)
  }, [autoplay, reduceMotion, items.length, stride])

  /** Suspends scrolling, then restarts it after a delay. */
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function suspendAutoplay() {
    setAutoplay(false)
    if (pauseTimer.current) {
      clearTimeout(pauseTimer.current)
    }
    pauseTimer.current = setTimeout(() => setAutoplay(true), RESUME_AFTER_TOUCH_MS)
  }

  useEffect(() => {
    return () => {
      if (pauseTimer.current) {
        clearTimeout(pauseTimer.current)
      }
    }
  }, [])

  function handleScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    // Resynchronise the index with the real position after a gesture.
    const index = Math.round(event.nativeEvent.contentOffset.x / stride)
    indexRef.current = index
    setActiveIndex(index)
  }

  if (items.length === 0)
    return null

  return (
    <View>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={stride}
        snapToAlignment="start"
        contentContainerStyle={styles.track}
        onScrollBeginDrag={suspendAutoplay}
        onMomentumScrollEnd={handleScrollEnd}
        onScrollEndDrag={handleScrollEnd}
      >
        {items.map(banner => (
          <Pressable
            key={banner.id}
            style={[styles.card, { width: cardWidth, backgroundColor: semantic.bgSurface }]}
            onPress={() => handleBannerPress(banner)}
            accessibilityRole="button"
            accessibilityLabel={banner.subtitle ? `${banner.title} — ${banner.subtitle}` : banner.title}
          >
            <Image source={{ uri: banner.imageUrl }} style={styles.image} resizeMode="cover" />

            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.88)']}
              locations={[0, 0.55, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.scrim}
            />

            <View style={styles.caption}>
              <Text style={styles.title} numberOfLines={1}>{banner.title}</Text>
              {banner.subtitle
                ? <Text style={styles.subtitle} numberOfLines={1}>{banner.subtitle}</Text>
                : null}
            </View>
          </Pressable>
        ))}
      </ScrollView>

      {/* Position marker — pointless with a single banner. Purely indicative,
          so hidden from screen readers: the carousel already announces its
          own content. */}
      {items.length > 1 && (
        <View
          style={styles.dots}
          pointerEvents="none"
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          {items.map((banner, index) => (
            <View
              key={banner.id}
              style={[
                styles.dot,
                index === activeIndex
                  ? styles.dotActive
                  : { backgroundColor: semantic.borderNormal },
              ]}
            />
          ))}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[1],
    marginTop: spacing[3],
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  // The current banner stretches rather than only changing colour: it stays
  // recognisable without fine hue discrimination.
  dotActive: {
    width: 18,
    backgroundColor: colors.green[400],
  },
  track: {
    paddingHorizontal: spacing[4],
    gap: spacing[3],
  },
  card: {
    aspectRatio: 2 / 1,
    borderRadius: radius.xl,
    overflow: 'hidden',
    ...shadows.sm,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
  },
  caption: {
    position: 'absolute',
    left: spacing[4],
    right: spacing[4],
    bottom: spacing[4],
    gap: 2,
  },
  title: {
    fontFamily: fonts.sansBd,
    fontSize: 18,
    color: colors.neutral[0],
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: 'rgba(255,255,255,0.82)',
  },
})
