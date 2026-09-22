import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right'
import Star from 'lucide-react-native/dist/esm/icons/star'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { StarRating } from '../../common/components/star-rating'
import { formatRelativeDate } from '../../common/format-date'

interface ReviewRow {
  id: string
  rating: number
  comment: string | null
  authorName: string
  createdAt: string
}

interface Summary {
  average: number | null
  count: number
  distribution: Record<string, number>
}

interface ProductReviewsSectionProps {
  productId: string
  /** Opens the full, paginated list. */
  onSeeAll: () => void
}

/** How many reviews the section shows before handing over to the full list. */
const PREVIEW_COUNT = 3

/** French decimal: 4,6 — never 4.6. */
function formatAverage(value: number): string {
  return value.toFixed(1).replace('.', ',')
}

/**
 * The "Avis" band of a product page.
 *
 * It fetches on mount rather than with the product: the page shows its rating
 * from the product's own fields, so this request never delays anything the
 * buyer is already looking at.
 */
export function ProductReviewsSection({ productId, onSeeAll }: ProductReviewsSectionProps) {
  const { semantic } = useTheme()
  const [summary, setSummary] = useState<Summary | null>(null)
  const [reviews, setReviews] = useState<ReviewRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/products/${productId}/reviews?limit=${PREVIEW_COUNT}`)
      if (res.ok) {
        const data = await res.json() as { summary: Summary, reviews: ReviewRow[] }
        setSummary(data.summary)
        setReviews(data.reviews)
      }
    }
    catch {
      // Offline: the section stays out rather than showing an error where a
      // rating belongs.
    }
    finally {
      setLoading(false)
    }
  }, [productId])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <View style={[styles.band, { backgroundColor: semantic.bgCard }]}>
        <ActivityIndicator color={colors.green[400]} />
      </View>
    )
  }

  if (!summary) {
    return null
  }

  if (summary.count === 0) {
    return (
      <View style={[styles.band, { backgroundColor: semantic.bgCard }]}>
        <Text style={[styles.title, { color: semantic.textPrimary }]}>Avis</Text>
        <Text style={[styles.empty, { color: semantic.textSecondary }]}>
          Soyez le premier à donner votre avis sur ce produit.
        </Text>
      </View>
    )
  }

  const max = Math.max(...[5, 4, 3, 2, 1].map(n => summary.distribution[String(n)] ?? 0), 1)

  return (
    <View style={[styles.band, { backgroundColor: semantic.bgCard }]}>
      <Text style={[styles.title, { color: semantic.textPrimary }]}>Avis</Text>

      <View style={styles.header}>
        <View style={styles.averageBlock}>
          {/* Below three reviews the average stays hidden, as for shops. */}
          {summary.average !== null
            ? <Text style={[styles.average, { color: semantic.textPrimary }]}>{formatAverage(summary.average)}</Text>
            : <Text style={[styles.average, { color: semantic.textTertiary }]}>—</Text>}
          <StarRating value={summary.average ?? 0} size={14} />
          <Text style={[styles.count, { color: semantic.textSecondary }]}>
            {summary.count > 1 ? `${summary.count} avis` : '1 avis'}
          </Text>
        </View>

        <View style={styles.bars}>
          {[5, 4, 3, 2, 1].map((level) => {
            const value = summary.distribution[String(level)] ?? 0
            return (
              <View key={level} style={styles.barRow}>
                <Text style={[styles.barLabel, { color: semantic.textTertiary }]}>{level}</Text>
                <View style={[styles.barTrack, { backgroundColor: semantic.bgSurface }]}>
                  <View style={[styles.barFill, { width: `${(value / max) * 100}%` }]} />
                </View>
              </View>
            )
          })}
        </View>
      </View>

      <View style={styles.reviews}>
        {reviews.map(review => (
          <View key={review.id} style={styles.review}>
            <View style={styles.reviewHead}>
              <StarRating value={review.rating} size={12} />
              <Text style={[styles.reviewMeta, { color: semantic.textTertiary }]}>
                {review.authorName}
                {' · '}
                {formatRelativeDate(review.createdAt)}
              </Text>
            </View>
            {review.comment !== null && (
              <Text style={[styles.reviewComment, { color: semantic.textSecondary }]}>{review.comment}</Text>
            )}
          </View>
        ))}
      </View>

      {summary.count > reviews.length && (
        <Pressable
          style={styles.seeAll}
          onPress={onSeeAll}
          accessibilityRole="button"
          accessibilityLabel={`Voir les ${summary.count} avis`}
        >
          <Text style={[styles.seeAllText, { color: colors.green[600] }]}>
            {`Voir les ${summary.count} avis`}
          </Text>
          <ChevronRight size={16} color={colors.green[600]} strokeWidth={2.2} />
        </Pressable>
      )}
    </View>
  )
}

/**
 * The compact line that sits next to the price. Rendered only once the
 * average is published — a lone enthusiastic review must not pass for one.
 */
export function ProductRatingLine({ average, count }: { average: number | null, count: number }) {
  const { semantic } = useTheme()
  if (average === null) {
    return null
  }
  return (
    <View style={styles.inlineRating}>
      <Star size={13} color={colors.earth[400]} fill={colors.earth[400]} strokeWidth={0} />
      <Text style={[styles.inlineAverage, { color: semantic.textPrimary }]}>{formatAverage(average)}</Text>
      <Text style={[styles.inlineCount, { color: semantic.textTertiary }]}>
        {count > 1 ? `(${count} avis)` : '(1 avis)'}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  band: {
    padding: spacing[4],
    gap: spacing[3],
  },
  title: {
    ...typography.h3,
  },
  empty: {
    ...typography.bodyS,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[5],
  },
  averageBlock: {
    alignItems: 'center',
    gap: spacing[1],
  },
  average: {
    fontFamily: fonts.sansBd,
    fontSize: 30,
    lineHeight: 34,
  },
  count: {
    ...typography.caption,
  },
  bars: {
    flex: 1,
    gap: spacing[1],
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  barLabel: {
    ...typography.caption,
    width: 10,
    textAlign: 'right',
  },
  barTrack: {
    flex: 1,
    height: 6,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.earth[400],
  },
  reviews: {
    gap: spacing[3],
  },
  review: {
    gap: spacing[1],
  },
  reviewHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  reviewMeta: {
    ...typography.caption,
    flex: 1,
  },
  reviewComment: {
    ...typography.bodyS,
  },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    minHeight: 44,
  },
  seeAllText: {
    ...typography.bodyS,
    fontFamily: fonts.sansSb,
  },
  inlineRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  inlineAverage: {
    ...typography.bodyS,
    fontFamily: fonts.sansSb,
  },
  inlineCount: {
    ...typography.caption,
  },
})
