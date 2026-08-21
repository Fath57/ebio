import type { SearchResult } from '../../search/hooks/use-search'
import type { HomeBanner } from '../hooks/use-home-banners'
import BadgeCheck from 'lucide-react-native/dist/esm/icons/badge-check'
import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right'
import MapIcon from 'lucide-react-native/dist/esm/icons/map'
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
import { useSession } from '../../../lib/auth-client'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
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
  onOpenProfile: () => void
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
  onOpenProfile,
}: HomeScreenProps) {
  const { semantic } = useTheme()
  const { data: session } = useSession()
  const userName = session?.user?.name
  const firstName = userName?.split(' ')[0]
  const initials = userName
    ? userName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?'
  const { latitude, longitude, label: locationLabel } = useLocation()
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
        imageUrl: item.product.photo ?? '',
        targetType: 'SUPPLIER' as const,
        targetId: item.supplier.id,
        targetUrl: null,
      }))

  return (
    <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
      <HomeHeader
        locationLabel={locationLabel}
        initials={initials}
        avatarUrl={session?.user?.image}
        onPickLocation={onPickLocation}
        onOpenSearch={onOpenSearch}
        onOpenNotifications={onOpenNotifications}
        onOpenProfile={onOpenProfile}
      />

      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Accroche */}
        <View style={styles.intro}>
          <Text style={[styles.greeting, { color: semantic.textTertiary }]}>
            {firstName ? `Bonjour, ${firstName} 👋` : 'Bonjour 👋'}
          </Text>
          <Text style={[styles.tagline, { color: semantic.textSecondary }]}>
            L'avenir d'une agriculture responsable commence ici.
          </Text>
        </View>

        {/* Accès carte */}
        <Pressable
          style={[styles.mapCta, { backgroundColor: semantic.bgCard, borderColor: semantic.borderLight }]}
          onPress={onOpenMap}
          accessibilityRole="button"
          accessibilityLabel="Rechercher sur la carte"
        >
          <View style={[styles.mapCtaIcon, { backgroundColor: semantic.bgPrimaryLight }]}>
            <MapIcon size={18} color={colors.green[400]} strokeWidth={2.2} />
          </View>
          <Text style={[styles.mapCtaLabel, { color: semantic.textPrimary }]}>
            Rechercher sur la carte
          </Text>
          <ChevronRight size={18} color={semantic.textTertiary} strokeWidth={2.4} />
        </Pressable>

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
                  title="Explorer près de vous"
                  Icon={MapPin}
                  iconColor={colors.coral[400]}
                  data={nearby}
                  onSeeAll={() => onSeeAll('nearby')}
                  onNavigateToSupplier={onNavigateToSupplier}
                  textColor={semantic.textSecondary}
                />
                <HomeSection
                  title="Validé eBio"
                  Icon={BadgeCheck}
                  iconColor={colors.green[400]}
                  data={validated}
                  onSeeAll={() => onSeeAll('validated')}
                  onNavigateToSupplier={onNavigateToSupplier}
                  textColor={semantic.textSecondary}
                />
                <HomeSection
                  title="En promotion"
                  Icon={Tag}
                  iconColor={colors.coral[400]}
                  data={promos}
                  onSeeAll={() => onSeeAll('promo')}
                  onNavigateToSupplier={onNavigateToSupplier}
                  textColor={semantic.textSecondary}
                />
              </>
            )}
      </ScrollView>
    </View>
  )
}

function HomeSection({ title, Icon, iconColor, data, onSeeAll, onNavigateToSupplier, textColor }: {
  title: string
  Icon: typeof MapPin
  iconColor: string
  data: SearchResult[]
  onSeeAll: () => void
  onNavigateToSupplier: (supplierId: string) => void
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
            <SearchResultCard item={item} onPress={onNavigateToSupplier} />
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
    paddingBottom: 96, // clear the floating tab bar (64px) + breathing room
  },
  intro: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    gap: 2,
  },
  greeting: {
    fontFamily: fonts.sansMd,
    fontSize: 13,
  },
  tagline: {
    fontFamily: fonts.display,
    fontSize: 20,
    lineHeight: 20 * 1.25,
  },
  mapCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginHorizontal: spacing[4],
    marginTop: spacing[4],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  mapCtaIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapCtaLabel: {
    flex: 1,
    fontFamily: fonts.sansSb,
    fontSize: 15,
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
