import Eye from 'lucide-react-native/dist/esm/icons/eye'
import EyeOff from 'lucide-react-native/dist/esm/icons/eye-off'
import Lock from 'lucide-react-native/dist/esm/icons/lock'
import Mail from 'lucide-react-native/dist/esm/icons/mail'
import PhoneIcon from 'lucide-react-native/dist/esm/icons/phone'
import { useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { notifyAuthChange, signInWithEmail } from '../../../lib/auth-client'
import { colors, fonts, radius, shadows, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { BRAND_LOGO } from '../../../utils/app-variant'
import { KeyboardAwareView } from '../../common/components/keyboard-aware-view'
import { GoogleSignInButton } from './google-sign-in-button'

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
    }
    catch {
      setError('Une erreur est survenue. Veuillez réessayer.')
    }
    finally {
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
    }
    catch {
      setError('Une erreur est survenue. Veuillez réessayer.')
    }
    finally {
      setLoading(false)
    }
  }

  // ─── Method toggle ──────────────────────────────────────────────────────────

  function switchMethod() {
    setError(null)
    setMethod(m => m === 'phone' ? 'email' : 'phone')
  }

  return (
    <KeyboardAwareView style={[styles.flex, { backgroundColor: semantic.bgPage }]}>
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
          <Image
            source={BRAND_LOGO}
            style={styles.logo}
            resizeMode="contain"
          />
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
                {loading
                  ? (
                      <ActivityIndicator color={colors.neutral[0]} size="small" />
                    )
                  : (
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
                {loading
                  ? (
                      <ActivityIndicator color={colors.neutral[0]} size="small" />
                    )
                  : (
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

          {/* ─── Google ─── */}
          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: semantic.borderLight }]} />
            <Text style={[styles.dividerText, { color: semantic.textTertiary }]}>ou</Text>
            <View style={[styles.dividerLine, { backgroundColor: semantic.borderLight }]} />
          </View>

          <GoogleSignInButton
            onSuccess={() => {
              notifyAuthChange()
              onLoginSuccess()
            }}
            onError={setError}
          />

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
    </KeyboardAwareView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: spacing[6] },

  brandContainer: { alignItems: 'center', marginBottom: spacing[12] },
  logo: { width: 140, height: 90, marginBottom: spacing[2] },
  brandSubtitle: { ...typography.bodyS, marginTop: spacing[1] },

  title: { ...typography.h1, marginBottom: spacing[1] },
  subtitle: { ...typography.bodyL, marginBottom: spacing[6] },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { ...typography.caption },

  errorBanner: {
    backgroundColor: colors.coral[50],
    borderWidth: 1,
    borderColor: colors.coral[200],
    borderRadius: radius.md,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    marginBottom: spacing[5],
  },
  errorText: { ...typography.bodyS, color: colors.coral[600] },

  form: { gap: spacing[4] },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.xl,
    paddingHorizontal: spacing[4],
    height: 56,
    gap: spacing[3],
  },
  input: { flex: 1, fontSize: 15, height: '100%' },
  eyeButton: { padding: spacing[1] },

  forgotRow: { alignSelf: 'flex-end', marginTop: -spacing[2] },
  forgotText: { ...typography.bodyS, fontFamily: fonts.sansMd },

  submitButton: {
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing[2],
    ...shadows.md,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { ...typography.h3, color: colors.neutral[0] },

  methodSwitch: { alignSelf: 'center', marginTop: spacing[1] },
  methodSwitchText: { ...typography.bodyS, fontFamily: fonts.sansSb },

  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing[1],
    marginTop: spacing[2],
  },
  toggleLabel: { ...typography.bodyS },
  toggleLink: { ...typography.bodyS, fontFamily: fonts.sansSb },
})
