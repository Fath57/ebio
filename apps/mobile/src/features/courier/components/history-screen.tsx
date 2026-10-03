import type { Delivery } from '../types'
import { useFocusEffect } from '@react-navigation/native'
import CheckCircle from 'lucide-react-native/dist/esm/icons/circle-check'
import XCircle from 'lucide-react-native/dist/esm/icons/circle-x'
import { useCallback, useRef } from 'react'
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { colors, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { ListFooterLoader } from '../../common/components/list-footer-loader'
import { StarRating } from '../../common/components/star-rating'
import { hasMoreFromLength, PAGE_SIZE, usePaginatedList } from '../../common/hooks/use-paginated-list'

interface HistoryScreenProps {
  onOpenDetail: (delivery: Delivery) => void
}

/** One page of finished deliveries, newest first. */
async function fetchHistoryPage(page: number) {
  const res = await apiFetch(`/api/deliveries/mine?status=done&page=${page}&limit=${PAGE_SIZE}`)
  if (!res.ok) {
    throw new Error('Historique indisponible')
  }
  const items = await res.json() as Delivery[]
  return { items, hasMore: hasMoreFromLength(items.length, PAGE_SIZE) }
}

function formatDate(iso: string | null): string {
  if (!iso) {
    return ''
  }
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

/** Finished deliveries (delivered and failed) — FR-019. */
export function HistoryScreen({ onOpenDetail }: HistoryScreenProps) {
  const { semantic } = useTheme()
  // A failed page keeps the rows already shown (offline).
  const { items: deliveries, isLoading, isRefreshing, isLoadingMore, refresh, loadMore } = usePaginatedList(fetchHistoryPage)

  // On focus: a delivery finished from the delivery screen did not show up in
  // the history on return. The first focus is the mount, already loading.
  const isFirstFocus = useRef(true)
  useFocusEffect(useCallback(() => {
    if (isFirstFocus.current) {
      isFirstFocus.current = false
      return
    }
    refresh()
  }, [refresh]))

  function renderItem({ item }: { item: Delivery }) {
    const delivered = item.status === 'DELIVERED'
    return (
      <Pressable
        style={[styles.card, { backgroundColor: semantic.bgCard }]}
        onPress={() => onOpenDetail(item)}
        accessibilityRole="button"
        accessibilityLabel={`Détail de la course ${item.orderNumber}`}
      >
        {delivered
          ? <CheckCircle size={20} color={colors.green[400]} strokeWidth={2} />
          : <XCircle size={20} color={colors.coral[400]} strokeWidth={2} />}
        <View style={styles.cardText}>
          <Text style={[styles.orderNumber, { color: semantic.textPrimary }]}>{item.orderNumber}</Text>
          <Text style={[styles.address, { color: semantic.textSecondary }]} numberOfLines={1}>{item.dropoffAddress}</Text>
          {delivered && (item.buyerRating || (item.tipAmount ?? 0) > 0)
            ? (
                <View style={styles.feedbackRow}>
                  {item.buyerRating ? <StarRating value={item.buyerRating.rating} size={12} /> : null}
                  {(item.tipAmount ?? 0) > 0
                    ? (
                        <Text style={[styles.tip, { color: colors.green[600] }]}>
                          {`Pourboire : ${(item.tipAmount ?? 0).toLocaleString('fr-FR')} FCFA`}
                        </Text>
                      )
                    : null}
                </View>
              )
            : null}
        </View>
        <Text style={[styles.date, { color: semantic.textTertiary }]}>
          {formatDate(delivered ? item.deliveredAt : item.failedAt)}
        </Text>
      </Pressable>
    )
  }

  return (
    <FlatList
      style={{ backgroundColor: semantic.bgPage }}
      contentContainerStyle={styles.list}
      data={deliveries}
      keyExtractor={item => item.id}
      renderItem={renderItem}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.green[400]} />}
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      ListFooterComponent={<ListFooterLoader isLoading={isLoadingMore} />}
      ListEmptyComponent={isLoading
        ? null
        : (
            <View style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: semantic.textPrimary }]}>Aucune livraison terminée</Text>
              <Text style={[styles.emptyBody, { color: semantic.textSecondary }]}>
                Vos livraisons livrées ou en échec apparaîtront ici.
              </Text>
            </View>
          )}
    />
  )
}

const styles = StyleSheet.create({
  list: {
    padding: spacing[4],
    paddingBottom: spacing[12],
    flexGrow: 1,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    borderRadius: radius.lg,
    padding: spacing[4],
    marginBottom: spacing[2],
    minHeight: 64,
  },
  cardText: {
    flex: 1,
  },
  orderNumber: {
    ...typography.h3,
    fontSize: 14,
  },
  address: {
    ...typography.bodyS,
    marginTop: 1,
  },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginTop: spacing[1],
  },
  tip: {
    ...typography.caption,
  },
  date: {
    ...typography.caption,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[6],
  },
  emptyTitle: {
    ...typography.h3,
  },
  emptyBody: {
    ...typography.bodyS,
    textAlign: 'center',
    marginTop: spacing[2],
  },
})
