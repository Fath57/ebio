import type { Delivery } from '../types'
import CheckCircle from 'lucide-react-native/dist/esm/icons/circle-check'
import XCircle from 'lucide-react-native/dist/esm/icons/circle-x'
import { useCallback, useEffect, useState } from 'react'
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { colors, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'

interface HistoryScreenProps {
  onOpenDetail: (delivery: Delivery) => void
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
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/deliveries/mine?status=done')
      if (res.ok) {
        setDeliveries(await res.json() as Delivery[])
      }
    }
    catch {
      // Offline: keep the last list.
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.green[400]} />}
      ListEmptyComponent={(
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
