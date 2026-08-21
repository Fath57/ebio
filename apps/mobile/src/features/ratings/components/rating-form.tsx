import * as React from 'react'
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { appAlert } from '../../common/components/app-alert'
import { StarRating } from '../../common/components/star-rating'

interface RatingFormProps {
  supplierId: string
  orderId?: string
  transactionType: 'ORDER' | 'CONTACT'
  onComplete?: () => void
}

const CRITERIA = [
  { key: 'qualityRating', label: 'Qualité du produit' },
  { key: 'delayRating', label: 'Respect des délais' },
  { key: 'communicationRating', label: 'Communication' },
  { key: 'conformityRating', label: 'Conformité à la description' },
] as const

export function RatingForm({ supplierId, orderId, transactionType, onComplete }: RatingFormProps) {
  const { semantic } = useTheme()
  const [ratings, setRatings] = useState<Record<string, number>>({
    qualityRating: 0,
    delayRating: 0,
    communicationRating: 0,
    conformityRating: 0,
  })
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const allRated = Object.values(ratings).every(r => r > 0)

  async function handleSubmit() {
    if (!allRated) {
      appAlert('Notation incomplète', 'Veuillez noter tous les critères.')
      return
    }

    setSubmitting(true)
    try {
      const res = await apiFetch('/api/reviews', {
        method: 'POST',
        body: JSON.stringify({
          supplierId,
          orderId,
          transactionType,
          ...ratings,
          comment: comment.trim() || undefined,
        }),
      })

      if (res.ok) {
        appAlert('Merci !', 'Votre avis a été enregistré.')
        onComplete?.()
      }
      else {
        const data = await res.json()
        appAlert('Erreur', data.message ?? 'Impossible d\'envoyer votre avis.')
      }
    }
    catch {
      appAlert('Erreur', 'Vérifiez votre connexion.')
    }
    finally {
      setSubmitting(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView style={[styles.container, { backgroundColor: semantic.bgPage }]} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: semantic.textPrimary }]}>Notez votre expérience</Text>

        {CRITERIA.map(({ key, label }) => (
          <View key={key} style={[styles.criterionRow, { borderBottomColor: semantic.borderLight }]}>
            <Text style={[styles.criterionLabel, { color: semantic.textPrimary }]}>{label}</Text>
            <StarRating
              value={ratings[key]}
              readOnly={false}
              size={28}
              onChange={val => setRatings(prev => ({ ...prev, [key]: val }))}
            />
          </View>
        ))}

        <Text style={[styles.commentLabel, { color: semantic.textSecondary }]}>Commentaire (optionnel)</Text>
        <TextInput
          style={[styles.commentInput, { borderColor: semantic.borderNormal, color: semantic.textPrimary }]}
          placeholder="Partagez votre expérience..."
          placeholderTextColor={semantic.textTertiary}
          value={comment}
          onChangeText={setComment}
          multiline
          maxLength={500}
          textAlignVertical="top"
        />
        <Text style={[styles.charCount, { color: semantic.textTertiary }]}>
          {comment.length}
          /500
        </Text>

        <TouchableOpacity
          style={[styles.submitButton, !allRated && styles.submitDisabled]}
          onPress={handleSubmit}
          disabled={!allRated || submitting}
          accessibilityLabel="Envoyer mon avis"
          accessibilityRole="button"
        >
          <Text style={styles.submitText}>
            {submitting ? 'Envoi...' : 'Envoyer mon avis'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[0] },
  content: { padding: spacing[4] },
  title: { ...typography.h2, color: colors.neutral[800], marginBottom: spacing[6] },
  criterionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[100],
  },
  criterionLabel: { ...typography.bodyL, color: colors.neutral[800], flex: 1 },
  commentLabel: { ...typography.caption, color: colors.neutral[600], marginTop: spacing[6], marginBottom: spacing[2] },
  commentInput: {
    borderWidth: 1.5,
    borderColor: colors.neutral[200],
    borderRadius: radius.sm,
    padding: spacing[3],
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.neutral[800],
    minHeight: 100,
  },
  charCount: { ...typography.caption, color: colors.neutral[400], textAlign: 'right', marginTop: spacing[1] },
  submitButton: {
    backgroundColor: colors.green[400],
    borderRadius: radius.md,
    paddingVertical: spacing[3],
    alignItems: 'center',
    marginTop: spacing[6],
    minHeight: 44,
    justifyContent: 'center',
  },
  submitDisabled: { opacity: 0.4 },
  submitText: { fontFamily: fonts.sansSb, fontSize: 13, color: colors.neutral[0] },
})
