import Eye from 'lucide-react-native/dist/esm/icons/eye'
import EyeOff from 'lucide-react-native/dist/esm/icons/eye-off'
import Lock from 'lucide-react-native/dist/esm/icons/lock'
import { useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { changePassword } from '../../../lib/auth-client'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { appAlert } from '../../common/components/app-alert'
import { KeyboardAwareView } from '../../common/components/keyboard-aware-view'

interface ChangePasswordScreenProps {
  /** Called once the password is changed and the user dismissed the alert. */
  onDone: () => void
}

const MIN_LENGTH = 8

/** Logged-in password change, shared by the three app variants. */
export function ChangePasswordScreen({ onDone }: ChangePasswordScreenProps) {
  const { semantic } = useTheme()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPasswords, setShowPasswords] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const iconColor = semantic.textTertiary
  const fieldStyle = [styles.inputContainer, { backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }]
  const textStyle = [styles.input, { color: semantic.textPrimary, fontFamily: fonts.sans }]

  const canSubmit = currentPassword.length > 0
    && newPassword.length >= MIN_LENGTH
    && confirmPassword.length > 0
    && !loading

  async function handleSubmit() {
    setError(null)
    if (newPassword.length < MIN_LENGTH) {
      setError(`Le nouveau mot de passe doit contenir au moins ${MIN_LENGTH} caractères`)
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Les deux mots de passe ne correspondent pas')
      return
    }
    setLoading(true)
    const result = await changePassword(currentPassword, newPassword)
    setLoading(false)
    if (result.error) {
      setError(result.error)
      return
    }
    appAlert('Mot de passe modifié', 'Votre nouveau mot de passe est actif dès maintenant.', [
      { text: 'OK', onPress: onDone },
    ])
  }

  return (
    <KeyboardAwareView style={[styles.flex, { backgroundColor: semantic.bgPage }]}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={[styles.hint, { color: semantic.textSecondary }]}>
          Saisissez votre mot de passe actuel puis choisissez-en un nouveau d’au moins
          {' '}
          {MIN_LENGTH}
          {' '}
          caractères.
        </Text>

        <Text style={[styles.label, { color: semantic.textTertiary }]}>Mot de passe actuel</Text>
        <View style={fieldStyle}>
          <Lock size={20} color={iconColor} strokeWidth={1.8} />
          <TextInput
            style={textStyle}
            placeholder="Mot de passe actuel"
            placeholderTextColor={semantic.textTertiary}
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry={!showPasswords}
            autoCapitalize="none"
            autoComplete="current-password"
            accessibilityLabel="Mot de passe actuel"
          />
          <Pressable
            onPress={() => setShowPasswords(p => !p)}
            hitSlop={8}
            style={styles.eyeButton}
            accessibilityRole="button"
            accessibilityLabel={showPasswords ? 'Masquer les mots de passe' : 'Afficher les mots de passe'}
          >
            {showPasswords
              ? <EyeOff size={20} color={iconColor} strokeWidth={1.8} />
              : <Eye size={20} color={iconColor} strokeWidth={1.8} />}
          </Pressable>
        </View>

        <Text style={[styles.label, { color: semantic.textTertiary }]}>Nouveau mot de passe</Text>
        <View style={fieldStyle}>
          <Lock size={20} color={iconColor} strokeWidth={1.8} />
          <TextInput
            style={textStyle}
            placeholder="Nouveau mot de passe"
            placeholderTextColor={semantic.textTertiary}
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry={!showPasswords}
            autoCapitalize="none"
            autoComplete="new-password"
            accessibilityLabel="Nouveau mot de passe"
          />
        </View>

        <View style={fieldStyle}>
          <Lock size={20} color={iconColor} strokeWidth={1.8} />
          <TextInput
            style={textStyle}
            placeholder="Confirmer le nouveau mot de passe"
            placeholderTextColor={semantic.textTertiary}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showPasswords}
            autoCapitalize="none"
            autoComplete="new-password"
            accessibilityLabel="Confirmer le nouveau mot de passe"
            onSubmitEditing={handleSubmit}
          />
        </View>

        {error && (
          <View style={[styles.errorBox, { backgroundColor: colors.coral[50] }]}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.submitButton,
            { backgroundColor: colors.green[400], opacity: pressed ? 0.85 : 1 },
            !canSubmit && styles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel="Enregistrer le nouveau mot de passe"
        >
          {loading
            ? <ActivityIndicator color={colors.neutral[0]} size="small" />
            : <Text style={styles.submitButtonText}>Enregistrer</Text>}
        </Pressable>

        <Text style={[styles.footnote, { color: semantic.textTertiary }]}>
          Compte créé avec Google sans mot de passe ? Utilisez « Mot de passe oublié » depuis l’écran de connexion pour en définir un.
        </Text>
      </ScrollView>
    </KeyboardAwareView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    padding: spacing[4],
    paddingBottom: spacing[12],
  },
  hint: {
    ...typography.bodyS,
    marginBottom: spacing[4],
  },
  label: {
    ...typography.overline,
    marginBottom: spacing[1],
    marginTop: spacing[2],
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    height: 52,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    marginBottom: spacing[3],
  },
  input: { flex: 1, fontSize: 15, height: '100%' },
  eyeButton: { padding: spacing[1] },
  errorBox: {
    borderRadius: radius.md,
    padding: spacing[3],
    marginBottom: spacing[3],
  },
  errorText: { ...typography.bodyS, color: colors.coral[600] },
  submitButton: {
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing[2],
  },
  submitButtonDisabled: { opacity: 0.5 },
  submitButtonText: {
    ...typography.bodyL,
    fontFamily: fonts.sansSb,
    color: colors.neutral[0],
  },
  footnote: {
    ...typography.caption,
    marginTop: spacing[4],
    textAlign: 'center',
  },
})
