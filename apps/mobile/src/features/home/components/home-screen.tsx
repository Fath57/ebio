import type { SearchResult } from '../../search/hooks/use-search'
import type { HomeBanner } from '../hooks/use-home-banners'
import type { HomeSectionCriteria } from '../hooks/use-home-sections'
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'
import BadgeCheck from 'lucide-react-native/dist/esm/icons/badge-check'
import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right'
import Clock from 'lucide-react-native/dist/esm/icons/clock'
import Flame from 'lucide-react-native/dist/esm/icons/flame'
import Leaf from 'lucide-react-native/dist/esm/icons/leaf'
import MapPin from 'lucide-react-native/dist/esm/icons/map-pin'
import Sparkles from 'lucide-react-native/dist/esm/icons/sparkles'
import Star from 'lucide-react-native/dist/esm/icons/star'
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
import { useHomeSections } from '../hooks/use-home-sections'
import { CategoryRail } from './category-rail'
import { HomeBannerCarousel } from './home-banner-carousel'
import { HomeHeader } from './home-header'

/**
 * What the app can draw, and what the back-office may choose.
 *
 * A closed list: an unknown name would leave a hole in the rail, whereas a
 * default is barely noticed.
 */
const SECTION_ICONS: Record<string, typeof MapPin> = {
  'map-pin': MapPin,
  'badge-check': BadgeCheck,
  'tag': Tag,
  'sparkles': Sparkles,
  'star': Star,
  'leaf': Leaf,
  'flame': Flame,
  'clock': Clock,
}

/** The icons that call for attention are coloured coral. */
const WARM_ICONS = new Set(['tag', 'flame', 'map-pin'])

interface HomeScreenProps {
  onOpenSearch: () => void
  onSelectCategory: (slug: string) => void
  onOpenMap: () => void
  onNavigateToSupplier: (supplierId: string) => void
  onNavigateToProduct: (productId: string) => void
  /** Reopens the search with the section's criteria. */
  onSeeAll: (title: string, criteria: HomeSectionCriteria, productIds: string[] | null) => void
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
  const { sections, loading } = useHomeSections(latitude, longitude)
  const { banners: editorialBanners } = useHomeBanners()

  useEffect(() => {
    loadCategories()
  }, [loadCategories])

  // Les bannières pilotées depuis le back-office priment. Sans aucune bannière
  // publiée, on retombe sur une sélection automatique — promotions, à défaut
  // fournisseurs validés, à défaut les plus proches — pour ne jamais laisser
  // la section vide.
  // With no published banner, we draw from what the sections already
  // returned rather than firing another search for nothing.
  const fallbackSource = sections.flatMap(section => section.results)
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
                {sections.map(section => (
                  <HomeSection
                    key={section.id}
                    title={section.title === 'Près de vous' && positionIsAssumed ? 'À découvrir' : section.title}
                    subtitle={section.subtitle}
                    Icon={SECTION_ICONS[section.icon ?? ''] ?? Sparkles}
                    iconColor={WARM_ICONS.has(section.icon ?? '') ? colors.coral[400] : colors.green[400]}
                    data={section.results}
                    onSeeAll={() => onSeeAll(section.title, section.criteria ?? {}, section.productIds)}
                    onNavigateToProduct={onNavigateToProduct}
                    textColor={semantic.textSecondary}
                  />
                ))}
              </>
            )}
      </ScrollView>
    </View>
  )
}

function HomeSection({ title, subtitle, Icon, iconColor, data, onSeeAll, onNavigateToProduct, textColor }: {
  title: string
  subtitle?: string | null
  Icon: typeof MapPin
  iconColor: string
  data: SearchResult[]
  /** Null for a section that already shows everything. */
  onSeeAll: (() => void) | null
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
        {onSeeAll !== null && (
          <Pressable
            style={styles.seeAll}
            onPress={onSeeAll}
            accessibilityRole="button"
            accessibilityLabel={`Tout voir : ${title}`}
          >
            <Text style={styles.seeAllText}>Tout voir</Text>
            <ChevronRight size={15} color={colors.green[600]} strokeWidth={2.4} />
          </Pressable>
        )}
      </View>

      {subtitle !== null && subtitle !== undefined && subtitle.length > 0 && (
        <Text style={[styles.sectionSubtitle, { color: textColor }]}>{subtitle}</Text>
      )}

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
  sectionSubtitle: {
    ...typography.bodyS,
    paddingHorizontal: spacing[4],
    marginTop: -spacing[2],
    marginBottom: spacing[3],
  },
  carousel: {
    paddingHorizontal: spacing[4],
    gap: spacing[3],
  },
  carouselCard: {
    width: 264,
  },
})
