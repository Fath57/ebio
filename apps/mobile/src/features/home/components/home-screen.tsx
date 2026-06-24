import type { CategoryItem } from '../../../utils/category-icons'
import type { SearchResult } from '../../search/hooks/use-search'
import { LinearGradient } from 'expo-linear-gradient'
import BadgeCheck from 'lucide-react-native/dist/esm/icons/badge-check'
import ChevronDown from 'lucide-react-native/dist/esm/icons/chevron-down'
import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right'
import MapIcon from 'lucide-react-native/dist/esm/icons/map'
import MapPin from 'lucide-react-native/dist/esm/icons/map-pin'
import Search from 'lucide-react-native/dist/esm/icons/search'
import Tag from 'lucide-react-native/dist/esm/icons/tag'
import { useEffect } from 'react'
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSession } from '../../../lib/auth-client'
import { colors, fonts, radius, shadows, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { useLocation } from '../../common/location-context'
import { SearchResultCard } from '../../search/components/search-result-card'
import { useCategories } from '../../search/hooks/use-search'
import { useHomeFeed } from '../hooks/use-home-feed'

export type HomePreset = 'nearby' | 'validated' | 'promo'

interface HomeScreenProps {
  onOpenSearch: () => void
  onSelectCategory: (slug: string) => void
  onOpenMap: () => void
  onNavigateToSupplier: (supplierId: string) => void
  onSeeAll: (preset: HomePreset) => void
  onPickLocation: () => void
}

export function HomeScreen({ onOpenSearch, onSelectCategory, onOpenMap, onNavigateToSupplier, onSeeAll, onPickLocation }: HomeScreenProps) {
  const { semantic } = useTheme()
  const { data: session } = useSession()
  const firstName = session?.user?.name?.split(' ')[0]
  const { latitude, longitude, label: locationLabel } = useLocation()
  const { categories, loadCategories } = useCategories()
  const { nearby, validated, promos, loading } = useHomeFeed(latitude, longitude)

  useEffect(() => {
    loadCategories()
  }, [loadCategories])

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: semantic.bgPage }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <LinearGradient
        colors={[colors.green[600], colors.green[400]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <Pressable
          style={styles.locationChip}
          onPress={onPickLocation}
          accessibilityRole="button"
          accessibilityLabel="Changer ma position"
        >
          <MapPin size={13} color={colors.neutral[0]} strokeWidth={2.4} />
          <Text style={styles.locationText} numberOfLines={1}>{locationLabel}</Text>
          <ChevronDown size={13} color={colors.neutral[0]} strokeWidth={2.4} />
        </Pressable>

        <Text style={styles.greeting}>
          {firstName ? `Bonjour, ${firstName} 👋` : 'Bienvenue sur eBio 👋'}
        </Text>
        <Text style={styles.slogan}>Trouvez du bio près de vous</Text>

        <Pressable
          style={styles.searchBar}
          onPress={onOpenSearch}
          accessibilityRole="search"
          accessibilityLabel="Rechercher un produit ou un fournisseur"
        >
          <Search size={20} color={colors.green[600]} strokeWidth={2.2} />
          <Text style={styles.searchPlaceholder}>Rechercher un produit, fournisseur...</Text>
        </Pressable>

        <Pressable
          style={styles.mapButton}
          onPress={onOpenMap}
          accessibilityRole="button"
          accessibilityLabel="Explorer la carte"
        >
          <MapIcon size={16} color={colors.neutral[0]} strokeWidth={2.2} />
          <Text style={styles.mapButtonText}>Explorer la carte</Text>
        </Pressable>
      </LinearGradient>

      {/* Categories */}
      <View style={styles.categoriesBlock}>
        <Text style={[styles.sectionTitle, { color: semantic.textTertiary }]}>CATÉGORIES</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriesRow}
        >
          {categories.map(cat => (
            <CategoryTile
              key={cat.id}
              category={cat}
              onPress={() => onSelectCategory(cat.slug)}
              textColor={semantic.textSecondary}
              tileBg={colors.green[50]}
            />
          ))}
        </ScrollView>
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
                title="Près de vous"
                Icon={MapPin}
                iconColor={colors.green[600]}
                data={nearby}
                onSeeAll={() => onSeeAll('nearby')}
                onNavigateToSupplier={onNavigateToSupplier}
                textColor={semantic.textPrimary}
              />
              <HomeSection
                title="Validé eBio"
                Icon={BadgeCheck}
                iconColor={colors.green[600]}
                data={validated}
                onSeeAll={() => onSeeAll('validated')}
                onNavigateToSupplier={onNavigateToSupplier}
                textColor={semantic.textPrimary}
              />
              <HomeSection
                title="En promotion"
                Icon={Tag}
                iconColor={colors.coral[400]}
                data={promos}
                onSeeAll={() => onSeeAll('promo')}
                onNavigateToSupplier={onNavigateToSupplier}
                textColor={semantic.textPrimary}
              />
            </>
          )}
    </ScrollView>
  )
}

function CategoryTile({ category, onPress, textColor, tileBg }: {
  category: CategoryItem
  onPress: () => void
  textColor: string
  tileBg: string
}) {
  return (
    <Pressable
      style={styles.catTile}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={category.label}
    >
      <View style={[styles.catCircle, { backgroundColor: tileBg }]}>
        {category.imageUrl
          ? <Image source={{ uri: category.imageUrl }} style={styles.catImage} />
          : <category.fallbackIcon size={24} color={colors.green[600]} strokeWidth={2} />}
      </View>
      <Text style={[styles.catLabel, { color: textColor }]} numberOfLines={1}>
        {category.label}
      </Text>
    </Pressable>
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
          <Icon size={16} color={iconColor} strokeWidth={2.2} />
          <Text style={[styles.sectionHeading, { color: textColor }]}>{title}</Text>
        </View>
        <Pressable
          style={styles.seeAll}
          onPress={onSeeAll}
          accessibilityRole="button"
          accessibilityLabel={`Voir tout : ${title}`}
        >
          <Text style={styles.seeAllText}>Voir tout</Text>
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
  hero: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[6],
    borderBottomLeftRadius: radius.xxl,
    borderBottomRightRadius: radius.xxl,
  },
  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing[1],
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: spacing[3],
    paddingVertical: 6,
    borderRadius: radius.pill,
    minHeight: 32,
  },
  locationText: {
    fontFamily: fonts.sansSb,
    fontSize: 13,
    color: colors.neutral[0],
  },
  greeting: {
    fontFamily: fonts.sansMd,
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    marginTop: spacing[4],
  },
  slogan: {
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 28 * 1.15,
    color: colors.neutral[0],
    marginTop: spacing[1],
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    backgroundColor: colors.neutral[0],
    borderRadius: radius.lg,
    paddingHorizontal: spacing[4],
    minHeight: 56,
    marginTop: spacing[5],
    ...shadows.md,
  },
  searchPlaceholder: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.neutral[400],
  },
  mapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    alignSelf: 'flex-start',
    marginTop: spacing[3],
    paddingHorizontal: spacing[4],
    minHeight: 40,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  mapButtonText: {
    fontFamily: fonts.sansSb,
    fontSize: 13,
    color: colors.neutral[0],
  },
  categoriesBlock: {
    marginTop: spacing[5],
  },
  sectionTitle: {
    ...typography.overline,
    paddingHorizontal: spacing[4],
    marginBottom: spacing[3],
  },
  categoriesRow: {
    paddingHorizontal: spacing[4],
    gap: spacing[4],
  },
  catTile: {
    alignItems: 'center',
    width: 72,
    gap: spacing[1],
  },
  catCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.sm,
  },
  catImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  catLabel: {
    fontFamily: fonts.sansMd,
    fontSize: 12,
    textAlign: 'center',
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
  sectionHeading: {
    fontFamily: fonts.sansBd,
    fontSize: 18,
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
  loading: {
    paddingTop: spacing[10],
    alignItems: 'center',
  },
})
