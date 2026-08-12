import type { SearchResult } from '../../search/hooks/use-search'
import { LinearGradient } from 'expo-linear-gradient'
import { Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { colors, fonts, radius, shadows, spacing } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { formatPrice } from '../../search/components/search-result-card'

interface HomeBannerCarouselProps {
  items: SearchResult[]
  onPress: (supplierId: string) => void
}

/** Nombre maximum de bannières affichées — au-delà, le carrousel devient une liste. */
const MAX_BANNERS = 5

/**
 * Carrousel de bannières en tête d'accueil : grande image, titre produit et
 * fournisseur en surimpression. La carte suivante dépasse volontairement
 * (« peek ») pour signaler le défilement horizontal.
 */
export function HomeBannerCarousel({ items, onPress }: HomeBannerCarouselProps) {
  const { width } = useWindowDimensions()
  const { semantic } = useTheme()

  if (items.length === 0)
    return null

  const cardWidth = width - spacing[4] * 2 - spacing[8]
  const banners = items.slice(0, MAX_BANNERS)

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={cardWidth + spacing[3]}
      snapToAlignment="start"
      contentContainerStyle={styles.track}
    >
      {banners.map((item) => {
        const { supplier, product } = item
        const hasPromo = product.promotionalPrice !== null
        return (
          <Pressable
            key={`${supplier.id}-${product.id}`}
            style={[styles.card, { width: cardWidth, backgroundColor: semantic.bgSurface }]}
            onPress={() => onPress(supplier.id)}
            accessibilityRole="button"
            accessibilityLabel={`${product.name} chez ${supplier.shopName}`}
          >
            {product.photo
              ? <Image source={{ uri: product.photo }} style={styles.image} resizeMode="cover" />
              : (
                  <View style={[styles.image, styles.imagePlaceholder]}>
                    <Text style={styles.placeholderLetter}>{product.name.charAt(0).toUpperCase()}</Text>
                  </View>
                )}

            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.88)']}
              locations={[0, 0.55, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.scrim}
            />

            {hasPromo && (
              <View style={styles.promoTag}>
                <Text style={styles.promoTagText}>
                  {formatPrice(product.promotionalPrice!)}
                  {' '}
                  FCFA
                </Text>
              </View>
            )}

            <View style={styles.caption}>
              <Text style={styles.title} numberOfLines={1}>{product.name}</Text>
              <Text style={styles.subtitle} numberOfLines={1}>{supplier.shopName}</Text>
            </View>
          </Pressable>
        )
      })}
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
  imagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.green[50],
  },
  placeholderLetter: {
    fontFamily: fonts.display,
    fontSize: 48,
    color: colors.green[200],
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
  },
  promoTag: {
    position: 'absolute',
    top: spacing[3],
    left: spacing[3],
    backgroundColor: colors.coral[400],
    paddingHorizontal: spacing[3],
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  promoTagText: {
    fontFamily: fonts.sansBd,
    fontSize: 11,
    color: colors.neutral[0],
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
