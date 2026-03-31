import { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ArrowLeft from 'lucide-react-native/dist/esm/icons/arrow-left'
import Phone from 'lucide-react-native/dist/esm/icons/phone'
import Mail from 'lucide-react-native/dist/esm/icons/mail'
import Lock from 'lucide-react-native/dist/esm/icons/lock'
import Eye from 'lucide-react-native/dist/esm/icons/eye'
import EyeOff from 'lucide-react-native/dist/esm/icons/eye-off'
import CheckCircle from 'lucide-react-native/dist/esm/icons/circle-check'
import { useTheme } from '../../../theme/theme-context'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import {
  requestPasswordResetOtp,
  resetPasswordWithOtp,
  verifyPasswordResetOtp,
} from '../../../lib/auth-client'
import { OtpInput, ResendTimer } from './otp-input'

type Step = 'identifier' | 'otp' | 'new-password' | 'success'
type Method = 'phone' | 'email'

interface ForgotPasswordScreenProps {
  onGoBack: () => void
  onNavigateToLogin: () => void
}

export function ForgotPasswordScreen({ onGoBack, onNavigateToLogin }: ForgotPasswordScreenProps) {
  const { semantic } = useTheme()
  const insets = useSafeAreaInsets()

  const [method, setMethod] = useState<Method>('phone')
  const [step, setStep] = useState<Step>('identifier')
  const [identifier, setIdentifier] = useState('+229')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendKey, setResendKey] = useState(0)

  const iconColor = semantic.textTertiary
  const inputBg = semantic.bgSurface
  const inputBorder = semantic.borderNormal
  const placeholderColor = semantic.textTertiary

  async function handleRequestOtp() {
    setError(null)
    setLoading(true)
    try {
      const result = await requestPasswordResetOtp(identifier)
      if (result.error) {
        setError(result.error)
        return
      }
      setStep('otp')
      setResendKey(k => k + 1)
    } catch {
      setError('Une erreur est survenue')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp(code: string) {
    setError(null)
    setLoading(true)
    try {
      const result = await verifyPasswordResetOtp(identifier, code)
      if (result.error) {
        setError(result.error)
        return
      }
      if (result.verified) {
        setStep('new-password')
      }
    } catch {
      setError('Une erreur est survenue')
    } finally {
      setLoading(false)
    }
  }

  async function handleResetPassword() {
    if (newPassword.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const result = await resetPasswordWithOtp(identifier, newPassword)
      if (result.error) {
        setError(result.error)
        return
      }
      setStep('success')
    } catch {
      setError('Une erreur est survenue')
    } finally {
      setLoading(false)
    }
  }

  async function handleResendOtp() {
    setError(null)
    const result = await requestPasswordResetOtp(identifier)
    if (result.error) {
      setError(result.error)
      return
    }
    setResendKey(k => k + 1)
  }

  const isPhoneValid = /^\+229\d{10}$/.test(identifier)
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)
  const isIdentifierValid = method === 'phone' ? isPhoneValid : isEmailValid

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: semantic.bgPage }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + spacing[4], paddingBottom: insets.bottom + spacing[8] },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back button */}
        {step !== 'success' && (
          <Pressable onPress={onGoBack} hitSlop={8} style={styles.backButton}>
            <ArrowLeft size={24} color={semantic.textPrimary} strokeWidth={2} />
          </Pressable>
        )}

        {/* Title */}
        <Text style={[styles.title, { color: semantic.textPrimary }]}>
          {step === 'identifier' && 'Mot de passe oublié'}
          {step === 'otp' && 'Vérification'}
          {step === 'new-password' && 'Nouveau mot de passe'}
          {step === 'success' && 'Mot de passe réinitialisé'}
        </Text>
        <Text style={[styles.subtitle, { color: semantic.textSecondary }]}>
          {step === 'identifier' && (method === 'phone'
            ? 'Entrez votre numéro de téléphone pour recevoir un code'
            : 'Entrez votre adresse email pour recevoir un code')}
          {step === 'otp' && `Code envoyé ${method === 'phone' ? 'au' : 'à'} ${identifier}`}
          {step === 'new-password' && 'Choisissez un nouveau mot de passe sécurisé'}
          {step === 'success' && 'Vous pouvez maintenant vous connecter avec votre nouveau mot de passe'}
        </Text>

        {/* Error */}
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.form}>
          {/* ─── Identifier step ─── */}
          {step === 'identifier' && (
            <>
              {/* Method toggle */}
              <View style={styles.methodToggle}>
                <Pressable
                  style={[styles.methodTab, method === 'phone' && { backgroundColor: colors.green[400] }]}
                  onPress={() => { setMethod('phone'); setIdentifier('+229'); setError(null) }}
                >
                  <Phone size={16} color={method === 'phone' ? colors.neutral[0] : semantic.textSecondary} strokeWidth={1.8} />
                  <Text style={[styles.methodTabText, method === 'phone' && { color: colors.neutral[0] }]}>Téléphone</Text>
                </Pressable>
                <Pressable
                  style={[styles.methodTab, method === 'email' && { backgroundColor: colors.green[400] }]}
                  onPress={() => { setMethod('email'); setIdentifier(''); setError(null) }}
                >
                  <Mail size={16} color={method === 'email' ? colors.neutral[0] : semantic.textSecondary} strokeWidth={1.8} />
                  <Text style={[styles.methodTabText, method === 'email' && { color: colors.neutral[0] }]}>Email</Text>
                </Pressable>
              </View>

              {method === 'phone' ? (
                <View style={[styles.inputContainer, { backgroundColor: inputBg, borderColor: inputBorder }]}>
                  <Phone size={20} color={iconColor} strokeWidth={1.8} />
                  <TextInput
                    style={[styles.input, { color: semantic.textPrimary, fontFamily: fonts.sans }]}
                    placeholder="+229 XX XX XX XX"
                    placeholderTextColor={placeholderColor}
                    value={identifier}
                    onChangeText={setIdentifier}
                    keyboardType="phone-pad"
                    autoComplete="tel"
                    maxLength={14}
                  />
                </View>
              ) : (
                <View style={[styles.inputContainer, { backgroundColor: inputBg, borderColor: inputBorder }]}>
                  <Mail size={20} color={iconColor} strokeWidth={1.8} />
                  <TextInput
                    style={[styles.input, { color: semantic.textPrimary, fontFamily: fonts.sans }]}
                    placeholder="votre@email.com"
                    placeholderTextColor={placeholderColor}
                    value={identifier}
                    onChangeText={setIdentifier}
                    keyboardType="email-address"
                    autoComplete="email"
                    autoCapitalize="none"
                  />
                </View>
              )}

              <Pressable
                style={({ pressed }) => [
                  styles.submitButton,
                  { backgroundColor: colors.green[400], opacity: pressed ? 0.85 : 1 },
                  (!isIdentifierValid || loading) && styles.submitButtonDisabled,
                ]}
                onPress={handleRequestOtp}
                disabled={!isIdentifierValid || loading}
              >
                {loading ? (
                  <ActivityIndicator color={colors.neutral[0]} size="small" />
                ) : (
                  <Text style={styles.submitButtonText}>Envoyer le code</Text>
                )}
              </Pressable>
            </>
          )}

          {/* ─── OTP step ─── */}
          {step === 'otp' && (
            <>
              <OtpInput
                onComplete={handleVerifyOtp}
                error={error}
                loading={loading}
              />
              <ResendTimer
                key={resendKey}
                seconds={60}
                onResend={handleResendOtp}
                loading={loading}
              />
              {loading && (
                <ActivityIndicator color={colors.green[400]} style={{ marginTop: spacing[4] }} />
              )}
            </>
          )}

          {/* ─── New password step ─── */}
          {step === 'new-password' && (
            <>
              <View style={[styles.inputContainer, { backgroundColor: inputBg, borderColor: inputBorder }]}>
                <Lock size={20} color={iconColor} strokeWidth={1.8} />
                <TextInput
                  style={[styles.input, { color: semantic.textPrimary, fontFamily: fonts.sans }]}
                  placeholder="Nouveau mot de passe"
                  placeholderTextColor={placeholderColor}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="new-password"
                  autoFocus
                />
                <Pressable onPress={() => setShowPassword(p => !p)} hitSlop={8} style={styles.eyeButton}>
                  {showPassword
                    ? <EyeOff size={20} color={iconColor} strokeWidth={1.8} />
                    : <Eye size={20} color={iconColor} strokeWidth={1.8} />}
                </Pressable>
              </View>

              <View style={[styles.inputContainer, { backgroundColor: inputBg, borderColor: inputBorder }]}>
                <Lock size={20} color={iconColor} strokeWidth={1.8} />
                <TextInput
                  style={[styles.input, { color: semantic.textPrimary, fontFamily: fonts.sans }]}
                  placeholder="Confirmer le mot de passe"
                  placeholderTextColor={placeholderColor}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.submitButton,
                  { backgroundColor: colors.green[400], opacity: pressed ? 0.85 : 1 },
                  loading && styles.submitButtonDisabled,
                ]}
                onPress={handleResetPassword}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={colors.neutral[0]} size="small" />
                ) : (
                  <Text style={styles.submitButtonText}>Réinitialiser</Text>
                )}
              </Pressable>
            </>
          )}

          {/* ─── Success step ─── */}
          {step === 'success' && (
            <>
              <View style={styles.successContainer}>
                <CheckCircle size={64} color={colors.green[400]} strokeWidth={1.5} />
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.submitButton,
                  { backgroundColor: colors.green[400], opacity: pressed ? 0.85 : 1 },
                ]}
                onPress={onNavigateToLogin}
              >
                <Text style={styles.submitButtonText}>Se connecter</Text>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: spacing[6] },

  backButton: { marginBottom: spacing[6] },

  title: { ...typography.h1, marginBottom: spacing[1] },
  subtitle: { ...typography.bodyL, marginBottom: spacing[6] },

  errorBanner: {
    backgroundColor: colors.coral[50], borderWidth: 1, borderColor: colors.coral[200],
    borderRadius: radius.md, paddingHorizontal: spacing[4], paddingVertical: spacing[3],
    marginBottom: spacing[5],
  },
  errorText: { ...typography.bodyS, color: colors.coral[600] },

  methodToggle: {
    flexDirection: 'row', gap: spacing[2], marginBottom: spacing[2],
  },
  methodTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing[2], height: 44, borderRadius: radius.lg,
    backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.neutral[200],
  },
  methodTabText: { ...typography.bodyS, fontFamily: fonts.medium },

  form: { gap: spacing[4] },
  inputContainer: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1,
    borderRadius: radius.lg, paddingHorizontal: spacing[4], height: 52, gap: spacing[3],
  },
  input: { flex: 1, fontSize: 15, height: '100%' },
  eyeButton: { padding: spacing[1] },

  submitButton: {
    height: 52, borderRadius: radius.lg,
    alignItems: 'center', justifyContent: 'center', marginTop: spacing[2],
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { ...typography.h3, color: colors.neutral[0] },

  successContainer: { alignItems: 'center', paddingVertical: spacing[8] },
})
