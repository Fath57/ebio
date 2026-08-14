import type { HomeBanner } from '../hooks/use-home-banners'
import { LinearGradient } from 'expo-linear-gradient'
import { Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { colors, fonts, radius, shadows, spacing } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'

interface HomeBannerCarouselProps {
  items: HomeBanner[]
  onOpenSupplier: (supplierId: string) => void
  onOpenProduct: (productId: string) => void
}

/**
 * Carrousel de bannières en tête d'accueil : grande image, titre et sous-titre
 * en surimpression. La carte suivante dépasse volontairement (« peek ») pour
 * signaler le défilement horizontal.
 */
export function HomeBannerCarousel({ items, onOpenSupplier, onOpenProduct }: HomeBannerCarouselProps) {
  const { width } = useWindowDimensions()
  const { semantic } = useTheme()

  if (items.length === 0)
    return null

  const cardWidth = width - spacing[4] * 2 - spacing[8]

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={cardWidth + spacing[3]}
      snapToAlignment="start"
      contentContainerStyle={styles.track}
    >
      {items.map(banner => (
        <Pressable
          key={banner.id}
          style={[styles.card, { width: cardWidth, backgroundColor: semantic.bgSurface }]}
          onPress={() => banner.targetType === 'SUPPLIER'
            ? onOpenSupplier(banner.targetId)
            : onOpenProduct(banner.targetId)}
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
  )
}

const styles = StyleSheet.create({
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
