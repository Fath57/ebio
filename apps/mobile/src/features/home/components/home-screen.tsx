import type { SearchResult } from '../../search/hooks/use-search'
import type { HomeBanner } from '../hooks/use-home-banners'
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'
import BadgeCheck from 'lucide-react-native/dist/esm/icons/badge-check'
import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right'
import MapPin from 'lucide-react-native/dist/esm/icons/map-pin'
import Tag from 'lucide-react-native/dist/esm/icons/tag'
import { useEffect } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { colors, fonts, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { useLocation } from '../../common/location-context'
import { SearchResultCard } from '../../search/components/search-result-card'
import { useCategories } from '../../search/hooks/use-search'
import { useHomeBanners } from '../hooks/use-home-banners'
import { useHomeFeed } from '../hooks/use-home-feed'
import { CategoryRail } from './category-rail'
import { HomeBannerCarousel } from './home-banner-carousel'
import { HomeHeader } from './home-header'

export type HomePreset = 'nearby' | 'validated' | 'promo'

interface HomeScreenProps {
  onOpenSearch: () => void
  onSelectCategory: (slug: string) => void
  onOpenMap: () => void
  onNavigateToSupplier: (supplierId: string) => void
  onNavigateToProduct: (productId: string) => void
  onSeeAll: (preset: HomePreset) => void
  onPickLocation: () => void
  onOpenNotifications: () => void
  onOpenWallet: () => void
  onOpenAssistant: () => void
}

export function HomeScreen({
  onOpenSearch,
  onSelectCategory,
  onOpenMap,
  onNavigateToSupplier,
  onNavigateToProduct,
  onSeeAll,
  onPickLocation,
  onOpenNotifications,
  onOpenWallet,
  onOpenAssistant,
}: HomeScreenProps) {
  const { semantic } = useTheme()
  // The tab bar floats over the content: without its height the last
  // row sits underneath it.
  const tabBarHeight = useBottomTabBarHeight()
  const { latitude, longitude, label: locationLabel, source: locationSource } = useLocation()
  // Permission refused or position unavailable: the app falls back to a
  // default city. Saying "near you" about someone else's city is a lie, and
  // the one thing that would fix it — choosing a position — is one tap away.
  const positionIsAssumed = locationSource === 'default'
  const { categories, loadCategories } = useCategories()
  const { nearby, validated, promos, loading } = useHomeFeed(latitude, longitude)
  const { banners: editorialBanners } = useHomeBanners()

  useEffect(() => {
    loadCategories()
  }, [loadCategories])

  // Les bannières pilotées depuis le back-office priment. Sans aucune bannière
  // publiée, on retombe sur une sélection automatique — promotions, à défaut
  // fournisseurs validés, à défaut les plus proches — pour ne jamais laisser
  // la section vide.
  const fallbackSource = promos.length > 0 ? promos : validated.length > 0 ? validated : nearby
  const banners: HomeBanner[] = editorialBanners.length > 0
    ? editorialBanners
    : fallbackSource.slice(0, 5).map(item => ({
        id: `${item.supplier.id}-${item.product.id}`,
        title: item.product.name,
        subtitle: item.supplier.shopName,
        imageUrl: item.product.thumbnail ?? item.product.photo ?? '',
        targetType: 'SUPPLIER' as const,
        targetId: item.supplier.id,
        targetUrl: null,
      }))

  return (
    <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
      <HomeHeader
        locationLabel={locationLabel}
        locationIsAssumed={positionIsAssumed}
        onPickLocation={onPickLocation}
        onOpenSearch={onOpenSearch}
        onOpenMap={onOpenMap}
        onOpenNotifications={onOpenNotifications}
        onOpenWallet={onOpenWallet}
        onOpenAssistant={onOpenAssistant}
      />

      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + spacing[6] }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Bannières */}
        <View style={styles.bannersBlock}>
          <HomeBannerCarousel
            items={banners}
            onOpenSupplier={onNavigateToSupplier}
            onOpenProduct={onNavigateToProduct}
          />
        </View>

        {/* Catégories */}
        <View style={styles.categoriesBlock}>
          <Text style={[styles.blockTitle, { color: semantic.textTertiary }]}>
            Catégories de produits
          </Text>
          <CategoryRail categories={categories} onSelect={onSelectCategory} />
        </View>

        {loading
          ? (
              <View style={styles.loading}>
                <ActivityIndicator size="large" color={colors.green[400]} />
              </View>
            )
          : (
              <>
                <HomeSection
                  title={positionIsAssumed ? 'À découvrir' : 'Explorer près de vous'}
                  Icon={MapPin}
                  iconColor={colors.coral[400]}
                  data={nearby}
                  onSeeAll={() => onSeeAll('nearby')}
                  onNavigateToProduct={onNavigateToProduct}
                  textColor={semantic.textSecondary}
                />
                <HomeSection
                  title="Validé eBio"
                  Icon={BadgeCheck}
                  iconColor={colors.green[400]}
                  data={validated}
                  onSeeAll={() => onSeeAll('validated')}
                  onNavigateToProduct={onNavigateToProduct}
                  textColor={semantic.textSecondary}
                />
                <HomeSection
                  title="En promotion"
                  Icon={Tag}
                  iconColor={colors.coral[400]}
                  data={promos}
                  onSeeAll={() => onSeeAll('promo')}
                  onNavigateToProduct={onNavigateToProduct}
                  textColor={semantic.textSecondary}
                />
              </>
            )}
      </ScrollView>
    </View>
  )
}

function HomeSection({ title, Icon, iconColor, data, onSeeAll, onNavigateToProduct, textColor }: {
  title: string
  Icon: typeof MapPin
  iconColor: string
  data: SearchResult[]
  onSeeAll: () => void
  onNavigateToProduct: (productId: string) => void
  textColor: string
}) {
  if (data.length === 0)
    return null

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Icon size={14} color={iconColor} strokeWidth={2.4} />
          <Text style={[styles.overline, { color: textColor }]}>{title}</Text>
        </View>
        <Pressable
          style={styles.seeAll}
          onPress={onSeeAll}
          accessibilityRole="button"
          accessibilityLabel={`Tout voir : ${title}`}
        >
          <Text style={styles.seeAllText}>Tout voir</Text>
          <ChevronRight size={15} color={colors.green[600]} strokeWidth={2.4} />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.carousel}
      >
        {data.slice(0, 10).map(item => (
          <View key={`${item.supplier.id}-${item.product.id}`} style={styles.carouselCard}>
            <SearchResultCard item={item} onPress={productId => onNavigateToProduct(productId)} />
          </View>
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
  },
  bannersBlock: {
    marginTop: spacing[5],
  },
  categoriesBlock: {
    marginTop: spacing[6],
  },
  overline: {
    ...typography.overline,
  },
  blockTitle: {
    ...typography.overline,
    paddingHorizontal: spacing[4],
    marginBottom: spacing[3],
  },
  loading: {
    paddingTop: spacing[10],
    alignItems: 'center',
  },
  section: {
    marginTop: spacing[6],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    marginBottom: spacing[3],
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 32,
    paddingLeft: spacing[2],
  },
  seeAllText: {
    fontFamily: fonts.sansSb,
    fontSize: 13,
    color: colors.green[600],
  },
  carousel: {
    paddingHorizontal: spacing[4],
    gap: spacing[3],
  },
  carouselCard: {
    width: 264,
  },
})
