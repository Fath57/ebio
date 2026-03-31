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
import Mail from 'lucide-react-native/dist/esm/icons/mail'
import Lock from 'lucide-react-native/dist/esm/icons/lock'
import Eye from 'lucide-react-native/dist/esm/icons/eye'
import EyeOff from 'lucide-react-native/dist/esm/icons/eye-off'
import PhoneIcon from 'lucide-react-native/dist/esm/icons/phone'
import Leaf from 'lucide-react-native/dist/esm/icons/leaf'
import { useTheme } from '../../../theme/theme-context'
import { colors, fonts, radius, shadows, spacing, typography } from '../../../theme/theme'
import { signInWithEmail, notifyAuthChange } from '../../../lib/auth-client'
import { apiFetch } from '../../../utils/api-client'

interface LoginScreenProps {
  onLoginSuccess: () => void
  onNavigateToRegister?: () => void
  onNavigateToForgotPassword?: () => void
}

type Method = 'phone' | 'email'

export function LoginScreen({ onLoginSuccess, onNavigateToRegister, onNavigateToForgotPassword }: LoginScreenProps) {
  const { semantic } = useTheme()
  const insets = useSafeAreaInsets()

  const [method, setMethod] = useState<Method>('phone')
  const [phone, setPhone] = useState('+229')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const iconColor = semantic.textTertiary
  const inputBg = semantic.bgSurface
  const inputBorder = semantic.borderNormal
  const placeholderColor = semantic.textTertiary

  const isPhoneValid = /^\+229\d{10}$/.test(phone)

  // ─── Phone + password login ─────────────────────────────────────────────────

  async function handlePhoneLogin() {
    if (!password) {
      setError('Veuillez entrer votre mot de passe')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const res = await apiFetch('/api/otp-auth/login', {
        method: 'POST',
        body: JSON.stringify({ phone, password }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.message ?? 'Téléphone ou mot de passe incorrect')
        return
      }
      const data = await res.json()
      if (data.accessToken) {
        const { setSessionToken } = await import('../../../utils/api-client')
        await setSessionToken(data.accessToken)
      }
      notifyAuthChange()
      onLoginSuccess()
    } catch {
      setError('Une erreur est survenue. Veuillez réessayer.')
    } finally {
      setLoading(false)
    }
  }

  // ─── Email + password login ─────────────────────────────────────────────────

  async function handleEmailLogin() {
    setError(null)
    setLoading(true)
    try {
      const result = await signInWithEmail(email, password)
      if (result.error) {
        setError(result.error)
        return
      }
      notifyAuthChange()
      onLoginSuccess()
    } catch {
      setError('Une erreur est survenue. Veuillez réessayer.')
    } finally {
      setLoading(false)
    }
  }

  // ─── Method toggle ──────────────────────────────────────────────────────────

  function switchMethod() {
    setError(null)
    setMethod(m => m === 'phone' ? 'email' : 'phone')
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: semantic.bgPage }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + spacing[12], paddingBottom: insets.bottom + spacing[8] },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Brand */}
        <View style={styles.brandContainer}>
          <View style={styles.logoRow}>
            <Leaf size={32} color={colors.green[400]} strokeWidth={2.5} />
          </View>
          <Text style={[styles.brandName, { color: colors.green[400] }]}>eBio</Text>
          <Text style={[styles.brandSubtitle, { color: semantic.textSecondary }]}>
            Produits bio, près de chez vous
          </Text>
        </View>

        {/* Title */}
        <Text style={[styles.title, { color: semantic.textPrimary }]}>Bon retour !</Text>
        <Text style={[styles.subtitle, { color: semantic.textSecondary }]}>
          Connectez-vous pour continuer
        </Text>

        {/* Error banner */}
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Form */}
        <View style={styles.form}>

          {/* ─── Phone login ─── */}
          {method === 'phone' && (
            <>
              <View style={[styles.inputContainer, { backgroundColor: inputBg, borderColor: inputBorder }]}>
                <PhoneIcon size={20} color={iconColor} strokeWidth={1.8} />
                <TextInput
                  style={[styles.input, { color: semantic.textPrimary, fontFamily: fonts.sans }]}
                  placeholder="+229 XX XX XX XX XX"
                  placeholderTextColor={placeholderColor}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  maxLength={14}
                />
              </View>

              <View style={[styles.inputContainer, { backgroundColor: inputBg, borderColor: inputBorder }]}>
                <Lock size={20} color={iconColor} strokeWidth={1.8} />
                <TextInput
                  style={[styles.input, { color: semantic.textPrimary, fontFamily: fonts.sans }]}
                  placeholder="Mot de passe"
                  placeholderTextColor={placeholderColor}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="current-password"
                />
                <Pressable
                  onPress={() => setShowPassword(prev => !prev)}
                  hitSlop={8}
                  style={styles.eyeButton}
                >
                  {showPassword
                    ? <EyeOff size={20} color={iconColor} strokeWidth={1.8} />
                    : <Eye size={20} color={iconColor} strokeWidth={1.8} />}
                </Pressable>
              </View>

              {onNavigateToForgotPassword && (
                <Pressable style={styles.forgotRow} onPress={onNavigateToForgotPassword}>
                  <Text style={[styles.forgotText, { color: semantic.textPrimaryColor }]}>
                    Mot de passe oublié ?
                  </Text>
                </Pressable>
              )}

              <Pressable
                style={({ pressed }) => [
                  styles.submitButton,
                  { backgroundColor: colors.green[400], opacity: pressed ? 0.85 : 1 },
                  (!isPhoneValid || !password || loading) && styles.submitButtonDisabled,
                ]}
                onPress={handlePhoneLogin}
                disabled={!isPhoneValid || !password || loading}
              >
                {loading ? (
                  <ActivityIndicator color={colors.neutral[0]} size="small" />
                ) : (
                  <Text style={styles.submitButtonText}>Se connecter</Text>
                )}
              </Pressable>

              <Pressable onPress={switchMethod} hitSlop={8} style={styles.methodSwitch}>
                <Text style={[styles.methodSwitchText, { color: semantic.textPrimaryColor }]}>
                  Se connecter avec un e-mail
                </Text>
              </Pressable>
            </>
          )}

          {/* ─── Email login ─── */}
          {method === 'email' && (
            <>
              <View style={[styles.inputContainer, { backgroundColor: inputBg, borderColor: inputBorder }]}>
                <Mail size={20} color={iconColor} strokeWidth={1.8} />
                <TextInput
                  style={[styles.input, { color: semantic.textPrimary, fontFamily: fonts.sans }]}
                  placeholder="Adresse e-mail"
                  placeholderTextColor={placeholderColor}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                />
              </View>

              <View style={[styles.inputContainer, { backgroundColor: inputBg, borderColor: inputBorder }]}>
                <Lock size={20} color={iconColor} strokeWidth={1.8} />
                <TextInput
                  style={[styles.input, { color: semantic.textPrimary, fontFamily: fonts.sans }]}
                  placeholder="Mot de passe"
                  placeholderTextColor={placeholderColor}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="current-password"
                />
                <Pressable
                  onPress={() => setShowPassword(prev => !prev)}
                  hitSlop={8}
                  style={styles.eyeButton}
                >
                  {showPassword
                    ? <EyeOff size={20} color={iconColor} strokeWidth={1.8} />
                    : <Eye size={20} color={iconColor} strokeWidth={1.8} />}
                </Pressable>
              </View>

              {onNavigateToForgotPassword && (
                <Pressable style={styles.forgotRow} onPress={onNavigateToForgotPassword}>
                  <Text style={[styles.forgotText, { color: semantic.textPrimaryColor }]}>
                    Mot de passe oublié ?
                  </Text>
                </Pressable>
              )}

              <Pressable
                style={({ pressed }) => [
                  styles.submitButton,
                  { backgroundColor: colors.green[400], opacity: pressed ? 0.85 : 1 },
                  loading && styles.submitButtonDisabled,
                ]}
                onPress={handleEmailLogin}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={colors.neutral[0]} size="small" />
                ) : (
                  <Text style={styles.submitButtonText}>Se connecter</Text>
                )}
              </Pressable>

              <Pressable onPress={switchMethod} hitSlop={8} style={styles.methodSwitch}>
                <Text style={[styles.methodSwitchText, { color: semantic.textPrimaryColor }]}>
                  Se connecter avec un téléphone
                </Text>
              </Pressable>
            </>
          )}

          {/* Toggle to register */}
          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, { color: semantic.textSecondary }]}>
              Pas encore de compte ?
            </Text>
            <Pressable onPress={onNavigateToRegister} hitSlop={8}>
              <Text style={[styles.toggleLink, { color: semantic.textPrimaryColor }]}>
                Créer un compte
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: spacing[6] },

  brandContainer: { alignItems: 'center', marginBottom: spacing[10] },
  logoRow: {
    width: 64, height: 64, borderRadius: radius.xl,
    backgroundColor: colors.green[50],
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing[3],
  },
  brandName: { ...typography.display, fontSize: 42, lineHeight: 48 },
  brandSubtitle: { ...typography.bodyS, marginTop: spacing[1] },

  title: { ...typography.h1, marginBottom: spacing[1] },
  subtitle: { ...typography.bodyL, marginBottom: spacing[6] },

  errorBanner: {
    backgroundColor: colors.coral[50], borderWidth: 1, borderColor: colors.coral[200],
    borderRadius: radius.md, paddingHorizontal: spacing[4], paddingVertical: spacing[3],
    marginBottom: spacing[5],
  },
  errorText: { ...typography.bodyS, color: colors.coral[600] },

  form: { gap: spacing[4] },
  inputContainer: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1,
    borderRadius: radius.lg, paddingHorizontal: spacing[4], height: 52, gap: spacing[3],
  },
  input: { flex: 1, fontSize: 15, height: '100%' },
  eyeButton: { padding: spacing[1] },

  forgotRow: { alignSelf: 'flex-end', marginTop: -spacing[2] },
  forgotText: { ...typography.bodyS, fontFamily: fonts.sansMd },

  submitButton: {
    height: 52, borderRadius: radius.lg,
    alignItems: 'center', justifyContent: 'center', marginTop: spacing[2],
    ...shadows.md,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { ...typography.h3, color: colors.neutral[0] },

  methodSwitch: { alignSelf: 'center', marginTop: spacing[1] },
  methodSwitchText: { ...typography.bodyS, fontFamily: fonts.sansSb },

  toggleRow: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    gap: spacing[1], marginTop: spacing[2],
  },
  toggleLabel: { ...typography.bodyS },
  toggleLink: { ...typography.bodyS, fontFamily: fonts.sansSb },
})
