import * as React from 'react'
import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { apiFetch } from '../../../utils/api-client'

interface DisputeFormProps {
  orderId: string
  onSuccess: () => void
  onCancel: () => void
}

const MIN_REASON_LENGTH = 10

export function DisputeForm({ orderId, onSuccess, onCancel }: DisputeFormProps) {
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isValid = reason.trim().length >= MIN_REASON_LENGTH

  function handleSubmit(): void {
    if (!isValid) {
      Alert.alert(
        'Raison trop courte',
        `Veuillez décrire la raison du litige (minimum ${MIN_REASON_LENGTH} caractères).`,
      )
      return
    }

    Alert.alert(
      'Confirmer le litige',
      'Êtes-vous sûr de vouloir ouvrir un litige pour cette commande ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Ouvrir le litige',
          style: 'destructive',
          onPress: submitDispute,
        },
      ],
    )
  }

  async function submitDispute(): Promise<void> {
    setIsSubmitting(true)
    try {
      const res = await apiFetch(`/api/orders/${orderId}/dispute`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() }),
      })

      if (res.ok) {
        Alert.alert('Litige ouvert', 'Votre litige a été enregistré. Nous vous recontacterons rapidement.')
        onSuccess()
      }
      else {
        Alert.alert('Erreur', 'Impossible d\u2019ouvrir le litige.')
      }
    }
    catch {
      Alert.alert('Erreur', 'Une erreur est survenue.')
    }
    finally {
      setIsSubmitting(false)
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.title}>Ouvrir un litige</Text>

        <View style={styles.warningBox}>
          <Text style={styles.warningIcon}>{'\u26A0\uFE0F'}</Text>
          <Text style={styles.warningText}>
            Vous avez 48h après la confirmation de livraison pour ouvrir un litige.
          </Text>
        </View>

        <Text style={styles.label}>
          Raison du litige * (minimum
          {' '}
          {MIN_REASON_LENGTH}
          {' '}
          caractères)
        </Text>
        <TextInput
          style={styles.textArea}
          placeholder="Décrivez le problème rencontré..."
          placeholderTextColor={colors.neutral[400]}
          value={reason}
          onChangeText={setReason}
          multiline
          textAlignVertical="top"
          maxLength={1000}
          accessibilityLabel="Raison du litige"
        />
        <Text style={styles.charCount}>
          {reason.trim().length}
          {' '}
          /
          {MIN_REASON_LENGTH}
          {' '}
          min
        </Text>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="Annuler"
          >
            <Text style={styles.cancelButtonText}>Annuler</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.submitButton,
              (!isValid || isSubmitting) && styles.buttonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={!isValid || isSubmitting}
            accessibilityRole="button"
            accessibilityLabel="Ouvrir un litige"
          >
            {isSubmitting
              ? (
                  <ActivityIndicator size="small" color={colors.neutral[0]} />
                )
              : (
                  <Text style={styles.submitButtonText}>Ouvrir un litige</Text>
                )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.neutral[0],
  },
  content: {
    flex: 1,
    paddingTop: spacing[4],
    paddingHorizontal: spacing[4],
    gap: spacing[3],
  },
  title: {
    ...typography.h1,
    color: colors.neutral[800],
  },
  warningBox: {
    flexDirection: 'row',
    gap: spacing[2],
    padding: spacing[3],
    backgroundColor: colors.earth[50],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.earth[200],
  },
  warningIcon: {
    fontSize: 18,
  },
  warningText: {
    ...typography.bodyS,
    color: colors.earth[800],
    flex: 1,
  },
  label: {
    ...typography.caption,
    color: colors.neutral[600],
  },
  textArea: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.neutral[800],
    backgroundColor: colors.neutral[50],
  },
  charCount: {
    ...typography.caption,
    color: colors.neutral[400],
    textAlign: 'right',
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[4],
  },
  cancelButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontFamily: fonts.sansMd,
    fontSize: 16,
    color: colors.neutral[600],
  },
  submitButton: {
    flex: 2,
    minHeight: 44,
    backgroundColor: colors.coral[400],
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitButtonText: {
    fontFamily: fonts.sansSb,
    fontSize: 16,
    color: colors.neutral[0],
  },
  buttonDisabled: {
    opacity: 0.5,
  },
})
