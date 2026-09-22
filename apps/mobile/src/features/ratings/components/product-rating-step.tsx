import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { appAlert } from '../../common/components/app-alert'
import { KeyboardAwareView } from '../../common/components/keyboard-aware-view'
import { StarRating } from '../../common/components/star-rating'

interface RateableProduct {
  orderItemId: string
  productId: string
  productName: string
  thumbnail: string | null
  existingReview: { rating: number, comment: string | null } | null
}

interface ProductRatingStepProps {
  orderId: string
  /** Called once the step is over, whether anything was rated or not. */
  onComplete: () => void
}

interface Draft {
  rating: number
  comment: string
}

/**
 * Third step of the rating journey: the products actually received.
 *
 * One row per product, five stars, and nothing else until a star is touched —
 * a page opening with five comment fields is a page nobody finishes. Rating
 * nothing and validating is a normal outcome, not an error.
 */
export function ProductRatingStep({ orderId, onComplete }: ProductRatingStepProps) {
  const { semantic } = useTheme()
  const [items, setItems] = useState<RateableProduct[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await apiFetch(`/api/orders/${orderId}/rateable-products`)
        if (res.ok && !cancelled) {
          const data = await res.json() as { items: RateableProduct[] }
          setItems(data.items)
          // Nothing to rate — an order delivered by the shop itself, or one
          // already fully reviewed. Leave without showing an empty screen.
          if (data.items.length === 0) {
            onComplete()
            return
          }
        }
      }
      catch {
        // Offline: the step is skipped rather than blocking the journey.
        if (!cancelled) {
          onComplete()
          return
        }
      }
      if (!cancelled) {
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [orderId, onComplete])

  const setRating = useCallback((orderItemId: string, rating: number) => {
    setDrafts(prev => ({
      ...prev,
      [orderItemId]: { rating, comment: prev[orderItemId]?.comment ?? '' },
    }))
  }, [])

  const setComment = useCallback((orderItemId: string, comment: string) => {
    setDrafts((prev) => {
      const current = prev[orderItemId]
      if (!current) {
        return prev
      }
      return { ...prev, [orderItemId]: { ...current, comment } }
    })
  }, [])

  const handleSubmit = useCallback(async () => {
    const reviews = Object.entries(drafts).map(([orderItemId, draft]) => ({
      orderItemId,
      rating: draft.rating,
      ...(draft.comment.trim() ? { comment: draft.comment.trim() } : {}),
    }))

    // Validating without rating anything is allowed, and costs no request.
    if (reviews.length === 0) {
      onComplete()
      return
    }

    setSaving(true)
    try {
      // The whole step in one call: three sequential requests on a mobile
      // network are three chances to half-fail.
      const res = await apiFetch(`/api/orders/${orderId}/product-reviews`, {
        method: 'POST',
        body: JSON.stringify({ reviews }),
      })
      if (!res.ok) {
        appAlert('Envoi impossible', 'Vos notes n\'ont pas pu être enregistrées. Réessayez.')
        return
      }
      onComplete()
    }
    catch {
      appAlert('Hors connexion', 'Vérifiez votre connexion et réessayez.')
    }
    finally {
      setSaving(false)
    }
  }, [drafts, orderId, onComplete])

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: semantic.bgPage }]}>
        <ActivityIndicator size="large" color={colors.green[400]} />
      </View>
    )
  }

  return (
    <KeyboardAwareView style={[styles.flex, { backgroundColor: semantic.bgPage }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: semantic.textPrimary }]}>
          Notez les produits reçus
        </Text>
        <Text style={[styles.subtitle, { color: semantic.textSecondary }]}>
          Votre avis aide les autres acheteurs. Vous pouvez n'en noter aucun.
        </Text>

        <View style={styles.list}>
          {items.map((item) => {
            const draft = drafts[item.orderItemId]
            const done = item.existingReview !== null
            return (
              <View key={item.orderItemId} style={[styles.row, { backgroundColor: semantic.bgCard }]}>
                <View style={styles.rowHead}>
                  {item.thumbnail
                    ? <Image source={{ uri: item.thumbnail }} style={styles.thumb} />
                    : <View style={[styles.thumb, { backgroundColor: semantic.bgSurface }]} />}
                  <Text style={[styles.name, { color: semantic.textPrimary }]} numberOfLines={2}>
                    {item.productName}
                  </Text>
                </View>

                <StarRating
                  value={done ? item.existingReview!.rating : draft?.rating ?? 0}
                  size={26}
                  readOnly={done}
                  onChange={rating => setRating(item.orderItemId, rating)}
                />

                {done && (
                  <Text style={[styles.alreadyRated, { color: semantic.textTertiary }]}>
                    Vous avez déjà noté ce produit.
                  </Text>
                )}

                {/* The comment only exists once a star has been touched. */}
                {!done && draft !== undefined && (
                  <View>
                    <Text style={[styles.label, { color: semantic.textSecondary }]}>
                      Votre commentaire (facultatif)
                    </Text>
                    <TextInput
                      style={[styles.input, {
                        backgroundColor: semantic.bgSurface,
                        borderColor: semantic.borderNormal,
                        color: semantic.textPrimary,
                        fontFamily: fonts.sans,
                      }]}
                      placeholder="Ce que vous en avez pensé"
                      placeholderTextColor={semantic.textTertiary}
                      value={draft.comment}
                      onChangeText={text => setComment(item.orderItemId, text)}
                      multiline
                      maxLength={500}
                    />
                  </View>
                )}
              </View>
            )
          })}
        </View>

        <TouchableOpacity
          style={[styles.submit, saving && styles.submitDisabled]}
          onPress={handleSubmit}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Valider mes notes"
        >
          {saving
            ? <ActivityIndicator size="small" color={colors.neutral[0]} />
            : <Text style={styles.submitText}>Valider</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAwareView>
  )
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: spacing[4],
    paddingBottom: spacing[10],
  },
  title: {
    ...typography.h2,
  },
  subtitle: {
    ...typography.bodyS,
    marginTop: spacing[1],
  },
  list: {
    marginTop: spacing[5],
    gap: spacing[3],
  },
  row: {
    padding: spacing[4],
    borderRadius: radius.lg,
    gap: spacing[3],
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
  },
  name: {
    ...typography.bodyL,
    fontFamily: fonts.sansMd,
    flex: 1,
  },
  alreadyRated: {
    ...typography.caption,
  },
  label: {
    ...typography.caption,
    marginBottom: spacing[1],
  },
  input: {
    minHeight: 72,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing[3],
    fontSize: 14,
    textAlignVertical: 'top',
  },
  submit: {
    marginTop: spacing[6],
    minHeight: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.green[400],
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitDisabled: {
    opacity: 0.6,
  },
  submitText: {
    fontFamily: fonts.sansBd,
    fontSize: 16,
    color: colors.neutral[0],
  },
})
