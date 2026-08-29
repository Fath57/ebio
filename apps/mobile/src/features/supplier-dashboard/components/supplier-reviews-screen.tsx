import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'
import Star from 'lucide-react-native/dist/esm/icons/star'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { ScreenHeader } from '../../common/components/screen-header'

interface Review {
  id: string
  buyerName: string
  rating: number
  comment: string | null
  transactionType: string
  createdAt: string
}

interface SupplierReviewsScreenProps {
  onGoBack: () => void
}

function averageOf(r: Record<string, unknown>): number {
  const dims = [r.qualityRating, r.delayRating, r.communicationRating, r.conformityRating]
    .map(v => (typeof v === 'number' ? v : 0))
  const sum = dims.reduce((a, b) => a + b, 0)
  return Math.round((sum / dims.length) * 10) / 10
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
  }
  catch {
    return ''
  }
}

function StarRow({ rating }: { rating: number }) {
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          size={14}
          color={colors.earth[400]}
          fill={i <= Math.round(rating) ? colors.earth[400] : 'transparent'}
        />
      ))}
    </View>
  )
}

export function SupplierReviewsScreen({ onGoBack }: SupplierReviewsScreenProps) {
  const { semantic } = useTheme()
  const tabBarHeight = useBottomTabBarHeight()
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      try {
        const statusRes = await apiFetch('/api/suppliers/me/status')
        const status = await statusRes.json() as Record<string, unknown>
        const supplierId = status.supplierId as string | undefined
        if (!supplierId)
          return
        const res = await apiFetch(`/api/suppliers/${supplierId}/reviews`)
        if (res.ok) {
          const data = await res.json() as Record<string, unknown>
          const list = (data.reviews as Array<Record<string, unknown>>) ?? []
          if (cancelled)
            return
          setReviews(list.map(r => ({
            id: r.id as string,
            buyerName: ((r.buyer as Record<string, unknown>)?.name as string) ?? 'Client',
            rating: averageOf(r),
            comment: (r.comment as string) ?? null,
            transactionType: (r.transactionType as string) ?? '',
            createdAt: (r.createdAt as string) ?? '',
          })))
        }
      }
      catch {
        // ignore
      }
      finally {
        if (!cancelled)
          setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  function renderReview({ item }: { item: Review }): React.JSX.Element {
    return (
      <View style={[styles.card, { backgroundColor: semantic.bgCard, borderColor: semantic.borderLight }]}>
        <View style={styles.cardHeader}>
          <Text style={[styles.buyerName, { color: semantic.textPrimary }]}>{item.buyerName}</Text>
          <Text style={[styles.date, { color: semantic.textTertiary }]}>{formatDate(item.createdAt)}</Text>
        </View>
        <StarRow rating={item.rating} />
        {item.comment != null && item.comment !== '' && (
          <Text style={[styles.comment, { color: semantic.textSecondary }]}>{item.comment}</Text>
        )}
      </View>
    )
  }

  return (
    <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader title="Avis clients" onBack={onGoBack} />

      {loading
        ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.green[400]} />
            </View>
          )
        : (
            <FlatList
              data={reviews}
              keyExtractor={item => item.id}
              renderItem={renderReview}
              contentContainerStyle={[styles.listContent, { paddingBottom: tabBarHeight + spacing[6] }]}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={(
                <View style={styles.center}>
                  <Text style={[styles.emptyText, { color: semantic.textTertiary }]}>Aucun avis pour le moment</Text>
                </View>
              )}
            />
          )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: spacing[12] },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
  },
  headerTitle: { ...typography.h2 },
  listContent: { paddingHorizontal: spacing[4], paddingTop: spacing[3], gap: spacing[3] },
  card: {
    padding: spacing[4],
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing[2],
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  buyerName: { ...typography.bodyL, fontFamily: fonts.sansSb },
  date: { ...typography.caption },
  starRow: { flexDirection: 'row', gap: 2 },
  comment: { ...typography.bodyS },
  emptyText: { ...typography.bodyL },
})
