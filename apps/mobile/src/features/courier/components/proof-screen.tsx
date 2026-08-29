import Camera from 'lucide-react-native/dist/esm/icons/camera'
import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { colors, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { appAlert } from '../../common/components/app-alert'
import { KeyboardAwareView } from '../../common/components/keyboard-aware-view'
import { useMediaUpload } from '../../media/hooks/use-media-upload'

interface ProofScreenProps {
  onComplete: (body: Record<string, unknown>) => Promise<{ ok: boolean, queued: boolean, errorMessage?: string }>
  onDone: () => void
}

/**
 * Proof of delivery. Nominal path: the 4-digit code the buyer received at
 * pickup. Fallback: a photo of the handed-over package (absent customer, etc.).
 */
export function ProofScreen({ onComplete, onDone }: ProofScreenProps) {
  const { semantic } = useTheme()
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { takePhotoAndUpload, uploading } = useMediaUpload({ context: 'DELIVERY_PROOF' })

  async function submitCode() {
    if (!/^\d{4}$/.test(code)) {
      appAlert('Code incomplet', 'Saisissez les 4 chiffres communiqués au client.')
      return
    }
    setSubmitting(true)
    const result = await onComplete({ proofType: 'CODE', code })
    setSubmitting(false)
    if (result.ok) {
      onDone()
    }
    else if (result.queued) {
      appAlert('Hors connexion', 'La livraison sera confirmée dès le retour du réseau.')
      onDone()
    }
    else {
      appAlert('Code invalide', result.errorMessage ?? 'Le code saisi ne correspond pas. Vérifiez avec le client.')
    }
  }

  async function submitPhoto() {
    const uploaded = await takePhotoAndUpload()
    if (!uploaded) {
      return
    }
    setSubmitting(true)
    const result = await onComplete({ proofType: 'PHOTO', mediaId: uploaded.mediaId })
    setSubmitting(false)
    if (result.ok || result.queued) {
      onDone()
    }
    else {
      appAlert('Erreur', result.errorMessage ?? 'La confirmation a échoué. Réessayez.')
    }
  }

  return (
    <KeyboardAwareView style={{ flex: 1, backgroundColor: semantic.bgPage }}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: semantic.textPrimary }]}>Preuve de livraison</Text>
        <Text style={[styles.subtitle, { color: semantic.textSecondary }]}>
          Demandez au client le code à 4 chiffres reçu dans son application.
        </Text>

        <TextInput
          style={[styles.codeInput, { backgroundColor: semantic.bgCard, color: semantic.textPrimary, borderColor: semantic.borderNormal }]}
          value={code}
          onChangeText={value => setCode(value.replace(/\D/g, '').slice(0, 4))}
          keyboardType="number-pad"
          maxLength={4}
          placeholder="0000"
          placeholderTextColor={semantic.textTertiary}
          accessibilityLabel="Code de confirmation à 4 chiffres"
        />

        <Pressable
          style={[styles.primary, (submitting || uploading) && styles.disabled]}
          onPress={submitCode}
          disabled={submitting || uploading}
          accessibilityRole="button"
          accessibilityLabel="Valider le code de confirmation"
        >
          {submitting
            ? <ActivityIndicator size="small" color={colors.neutral[0]} />
            : <Text style={styles.primaryText}>Valider le code</Text>}
        </Pressable>

        <View style={styles.separator}>
          <View style={[styles.separatorLine, { backgroundColor: semantic.borderLight }]} />
          <Text style={[styles.separatorText, { color: semantic.textTertiary }]}>ou</Text>
          <View style={[styles.separatorLine, { backgroundColor: semantic.borderLight }]} />
        </View>

        <Pressable
          style={[styles.secondary, { borderColor: semantic.borderNormal }, (submitting || uploading) && styles.disabled]}
          onPress={submitPhoto}
          disabled={submitting || uploading}
          accessibilityRole="button"
          accessibilityLabel="Prendre une photo comme preuve de livraison"
        >
          {uploading
            ? <ActivityIndicator size="small" color={colors.green[400]} />
            : (
                <View style={styles.secondaryContent}>
                  <Camera size={18} color={semantic.textPrimary} strokeWidth={2} />
                  <Text style={[styles.secondaryText, { color: semantic.textPrimary }]}>Photo de la remise</Text>
                </View>
              )}
        </Pressable>
        <Text style={[styles.note, { color: semantic.textTertiary }]}>
          La photo sert de preuve quand le client ne peut pas donner le code.
        </Text>
      </ScrollView>
    </KeyboardAwareView>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: spacing[5],
    paddingBottom: spacing[10],
  },
  title: {
    ...typography.h2,
    marginTop: spacing[4],
  },
  subtitle: {
    ...typography.bodyL,
    marginTop: spacing[2],
    marginBottom: spacing[5],
  },
  codeInput: {
    height: 64,
    borderRadius: radius.md,
    borderWidth: 1,
    textAlign: 'center',
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 28,
    letterSpacing: 12,
  },
  primary: {
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.green[400],
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing[4],
  },
  primaryText: {
    ...typography.caption,
    fontSize: 13,
    color: colors.neutral[0],
  },
  disabled: {
    opacity: 0.6,
  },
  separator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginVertical: spacing[5],
  },
  separatorLine: {
    flex: 1,
    height: 1,
  },
  separatorText: {
    ...typography.caption,
  },
  secondary: {
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  secondaryText: {
    ...typography.caption,
    fontSize: 13,
  },
  note: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing[3],
  },
})
