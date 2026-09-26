import type { FavoriteItem } from '../favorites'
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'
import { useFocusEffect } from '@react-navigation/native'
import Heart from 'lucide-react-native/dist/esm/icons/heart'
import { useCallback, useState } from 'react'
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { colors, fonts, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { StaggerItem } from '../../../utils/animations'
import { ScreenHeader } from '../../common/components/screen-header'
import { ProductCardSkeletonList } from '../../common/components/skeleton'
import { useLocation } from '../../common/location-context'
import { SearchResultCard } from '../../search/components/search-result-card'
import { fetchFavorites } from '../favorites'

interface FavoritesScreenProps {
  onGoBack: () => void
  onOpenProduct: (productId: string, supplierId: string) => void
  /** Sends an empty shelf somewhere worth going. */
  onExplore: () => void
}

/**
 * The products someone kept aside.
 *
 * Kept in the order they were kept, not by distance: the buyer put them there
 * in a sequence and looks for them in it. A product gone out of stock stays
 * on the shelf — it is often the very reason one comes back — and its card
 * says so on its own.
 */
export function FavoritesScreen({ onGoBack, onOpenProduct, onExplore }: FavoritesScreenProps) {
  const { semantic } = useTheme()
  const tabBarHeight = useBottomTabBarHeight()
  const { latitude, longitude } = useLocation()
  const [items, setItems] = useState<FavoriteItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    try {
      setError(null)
      setItems(await fetchFavorites({ latitude, longitude }))
    }
    catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible de charger vos favoris.')
    }
    finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [latitude, longitude])

  // Reloaded on every focus: a heart emptied on a product page must not leave
  // its card behind on the shelf.
  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  if (isLoading) {
    return (
      <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
        <ScreenHeader title="Mes favoris" onBack={onGoBack} />
        <View style={styles.list}>
          <ProductCardSkeletonList count={3} />
        </View>
      </View>
    )
  }

  return (
    <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader
        title="Mes favoris"
        subtitle={items.length > 0 ? `${items.length} produit${items.length > 1 ? 's' : ''}` : undefined}
        onBack={onGoBack}
      />
      <FlatList
        data={items}
        keyExtractor={item => item.product.id}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: tabBarHeight + spacing[6] },
          items.length === 0 && styles.listEmpty,
        ]}
        refreshControl={(
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              setIsRefreshing(true)
              load()
            }}
            tintColor={colors.green[400]}
          />
        )}
        renderItem={({ item, index }) => (
          // Les cartes se posent l'une après l'autre plutôt que d'apparaître
          // d'un bloc : l'œil suit une arrivée, il subit une apparition.
          <StaggerItem index={index}>
            <SearchResultCard
              item={item}
              onPress={(productId, supplierId) => onOpenProduct(productId, supplierId)}
            />
          </StaggerItem>
        )}
        ListEmptyComponent={(
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: semantic.bgPrimaryLight }]}>
              <Heart size={36} color={colors.green[400]} />
            </View>
            <Text style={[styles.emptyTitle, { color: semantic.textPrimary }]}>
              Rien de côté pour l'instant
            </Text>
            <Text style={[styles.emptyBody, { color: semantic.textTertiary }]}>
              Touchez le cœur sur un produit pour le retrouver ici, sans avoir à
              le rechercher.
            </Text>
            <TouchableOpacity style={styles.emptyButton} onPress={onExplore} accessibilityRole="button">
              <Text style={styles.emptyButtonText}>Découvrir des produits</Text>
            </TouchableOpacity>
          </View>
        )}
      />
      {error !== null && (
        <Text style={styles.error} accessibilityRole="alert">{error}</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    gap: spacing[3],
  },
  listEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  empty: {
    alignItems: 'center',
    paddingHorizontal: spacing[6],
    gap: spacing[3],
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontFamily: fonts.sansBd,
    fontSize: typography.h3.fontSize,
    textAlign: 'center',
  },
  emptyBody: {
    fontFamily: fonts.sans,
    fontSize: typography.bodyL.fontSize,
    textAlign: 'center',
    lineHeight: 22,
  },
  emptyButton: {
    marginTop: spacing[2],
    backgroundColor: colors.green[600],
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[3],
    borderRadius: 99,
    minHeight: 44,
    justifyContent: 'center',
  },
  emptyButtonText: {
    fontFamily: fonts.sansSb,
    fontSize: typography.bodyL.fontSize,
    color: colors.neutral[0],
  },
  error: {
    fontFamily: fonts.sans,
    fontSize: typography.bodyS.fontSize,
    color: colors.coral[600],
    textAlign: 'center',
    paddingBottom: spacing[4],
  },
})
