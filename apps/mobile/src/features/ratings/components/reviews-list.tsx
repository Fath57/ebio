import * as React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { FlatList, StyleSheet, Text, View } from 'react-native'
import { colors, fonts, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { StarRating } from '../../common/components/star-rating'

interface Review {
  id: string
  buyer: { id: string, name: string, image: string | null }
  qualityRating: number
  delayRating: number
  communicationRating: number
  conformityRating: number
  comment: string | null
  createdAt: string
}

interface ReviewSummary {
  averageRating: number
  totalReviews: number
  qualityAvg: number
  delayAvg: number
  communicationAvg: number
  conformityAvg: number
  distribution: Record<number, number>
}

interface ReviewsListProps {
  supplierId: string
}

export function ReviewsList({ supplierId }: ReviewsListProps) {
  const { semantic } = useTheme()
  const [reviews, setReviews] = useState<Review[]>([])
  const [summary, setSummary] = useState<ReviewSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)

  const loadReviews = useCallback(async (p: number) => {
    try {
      const res = await apiFetch(`/api/suppliers/${supplierId}/reviews?page=${p}&limit=10`)
      if (res.ok) {
        const data = await res.json()
        if (p === 1) {
          setReviews(data.reviews)
          setSummary(data.summary)
        }
        else {
          setReviews(prev => [...prev, ...data.reviews])
        }
        setHasMore(data.hasMore)
      }
    }
    catch { /* offline */ }
    finally { setLoading(false) }
  }, [supplierId])

  useEffect(() => {
    loadReviews(1)
  }, [loadReviews])

  function getAvgRating(review: Review) {
    return (review.qualityRating + review.delayRating + review.communicationRating + review.conformityRating) / 4
  }

  function formatRelativeDate(iso: string) {
    const diff = Date.now() - new Date(iso).getTime()
    const hours = Math.floor(diff / 3600000)
    if (hours < 1)
      return 'il y a quelques minutes'
    if (hours < 24)
      return `il y a ${hours} h`
    const days = Math.floor(hours / 24)
    if (days === 1)
      return 'hier'
    if (days < 30)
      return `il y a ${days} jours`
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  }

  return (
    <View style={styles.container}>
      {summary && summary.totalReviews >= 3 && (
        <View style={[styles.summaryCard, { backgroundColor: semantic.bgCard, borderBottomColor: semantic.borderNormal }]}>
          <View style={styles.summaryTop}>
            <Text style={[styles.avgNumber, { color: semantic.textPrimaryColor }]}>{summary.averageRating.toFixed(1)}</Text>
            <View style={{ marginLeft: spacing[2] }}>
              <StarRating value={summary.averageRating} size={16} />
              <Text style={[styles.totalText, { color: semantic.textSecondary }]}>
                {summary.totalReviews}
                {' '}
                avis
              </Text>
            </View>
          </View>
        </View>
      )}

      <FlatList
        data={reviews}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={[styles.reviewCard, { borderBottomColor: semantic.borderLight }]}>
            <View style={styles.reviewHeader}>
              <View style={[styles.avatar, { backgroundColor: semantic.bgPrimaryLight }]}>
                <Text style={[styles.avatarText, { color: semantic.textPrimaryColor }]}>{item.buyer.name.charAt(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.buyerName, { color: semantic.textPrimary }]}>{item.buyer.name}</Text>
                <Text style={[styles.date, { color: semantic.textTertiary }]}>{formatRelativeDate(item.createdAt)}</Text>
              </View>
              <StarRating value={getAvgRating(item)} size={14} />
            </View>
            {item.comment && <Text style={[styles.comment, { color: semantic.textSecondary }]}>{item.comment}</Text>}
          </View>
        )}
        onEndReached={() => {
          if (hasMore) {
            const next = page + 1
            setPage(next)
            loadReviews(next)
          }
        }}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          !loading
            ? (
                <Text style={[styles.emptyText, { color: semantic.textTertiary }]}>Aucun avis pour le moment</Text>
              )
            : null
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  summaryCard: {
    backgroundColor: colors.neutral[0],
    padding: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[200],
  },
  summaryTop: { flexDirection: 'row', alignItems: 'center' },
  avgNumber: { fontFamily: fonts.mono, fontSize: 36, color: colors.green[600] },
  totalText: { ...typography.caption, color: colors.neutral[600], marginTop: 2 },
  reviewCard: {
    padding: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[100],
  },
  reviewHeader: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.green[50],
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing[3],
  },
  avatarText: { fontFamily: fonts.sansSb, fontSize: 14, color: colors.green[600] },
  buyerName: { ...typography.bodyS, fontFamily: fonts.sansSb, color: colors.neutral[800] },
  date: { ...typography.caption, color: colors.neutral[400] },
  comment: { ...typography.bodyS, color: colors.neutral[600], marginTop: spacing[2] },
  emptyText: { ...typography.bodyL, color: colors.neutral[400], textAlign: 'center', marginTop: spacing[8] },
})
