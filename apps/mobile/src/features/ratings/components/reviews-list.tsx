import * as React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { FlatList, StyleSheet, Text, View } from 'react-native'
import { colors, fonts, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { StarRating } from '../../common/components/star-rating'
import { formatRelativeDate } from '../../common/format-date'

/** What the list renders, whichever endpoint it came from. */
interface ListedReview {
  id: string
  authorName: string
  rating: number
  comment: string | null
  createdAt: string
}

interface ListedSummary {
  average: number
  total: number
}

export type ReviewTarget = 'supplier' | 'product'

interface ReviewsListProps {
  /** Which side of the marketplace is being read. */
  target: ReviewTarget
  /** Id of the shop or of the product, depending on `target`. */
  id: string
}

interface RawSupplierReview {
  id: string
  buyer: { name: string }
  qualityRating: number
  delayRating: number
  communicationRating: number
  conformityRating: number
  comment: string | null
  createdAt: string
}

interface RawProductReview {
  id: string
  rating: number
  comment: string | null
  authorName: string
  createdAt: string
}

/**
 * The two endpoints answer in different shapes — a shop review carries four
 * criteria and a buyer object, a product review one rating and a name. They
 * are normalised here rather than duplicating the list and its rendering.
 */
function normalise(target: ReviewTarget, data: Record<string, unknown>): {
  reviews: ListedReview[]
  summary: ListedSummary | null
  hasMore: boolean
} {
  if (target === 'supplier') {
    const raw = (data.reviews ?? []) as RawSupplierReview[]
    const summary = data.summary as { averageRating: number, totalReviews: number } | null
    return {
      reviews: raw.map(r => ({
        id: r.id,
        authorName: r.buyer.name,
        rating: (r.qualityRating + r.delayRating + r.communicationRating + r.conformityRating) / 4,
        comment: r.comment,
        createdAt: r.createdAt,
      })),
      summary: summary ? { average: summary.averageRating, total: summary.totalReviews } : null,
      hasMore: Boolean(data.hasMore),
    }
  }

  const raw = (data.reviews ?? []) as RawProductReview[]
  const summary = data.summary as { average: number | null, count: number } | null
  const pagination = data.pagination as { hasMore: boolean } | undefined
  return {
    reviews: raw.map(r => ({
      id: r.id,
      authorName: r.authorName,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
    })),
    // A product average stays null below three reviews; the card is then
    // hidden, exactly as the shop one is under the same threshold.
    summary: summary && summary.average !== null ? { average: summary.average, total: summary.count } : null,
    hasMore: Boolean(pagination?.hasMore),
  }
}

export function ReviewsList({ target, id }: ReviewsListProps) {
  const { semantic } = useTheme()
  const [reviews, setReviews] = useState<ListedReview[]>([])
  const [summary, setSummary] = useState<ListedSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)

  const loadReviews = useCallback(async (p: number) => {
    const path = target === 'supplier'
      ? `/api/suppliers/${id}/reviews?page=${p}&limit=10`
      : `/api/products/${id}/reviews?page=${p}&limit=10`
    try {
      const res = await apiFetch(path)
      if (res.ok) {
        const data = normalise(target, await res.json() as Record<string, unknown>)
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
  }, [target, id])

  useEffect(() => {
    loadReviews(1)
  }, [loadReviews])

  return (
    <View style={styles.container}>
      {summary !== null && (
        <View style={[styles.summaryCard, { backgroundColor: semantic.bgCard, borderBottomColor: semantic.borderNormal }]}>
          <View style={styles.summaryTop}>
            <Text style={[styles.avgNumber, { color: semantic.textPrimaryColor }]}>{summary.average.toFixed(1).replace('.', ',')}</Text>
            <View style={{ marginLeft: spacing[2] }}>
              <StarRating value={summary.average} size={16} />
              <Text style={[styles.totalText, { color: semantic.textSecondary }]}>
                {summary.total}
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
                <Text style={[styles.avatarText, { color: semantic.textPrimaryColor }]}>{item.authorName.charAt(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.buyerName, { color: semantic.textPrimary }]}>{item.authorName}</Text>
                <Text style={[styles.date, { color: semantic.textTertiary }]}>{formatRelativeDate(item.createdAt)}</Text>
              </View>
              <StarRating value={item.rating} size={14} />
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
