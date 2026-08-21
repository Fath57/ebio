import Eye from 'lucide-react-native/dist/esm/icons/eye'
import EyeOff from 'lucide-react-native/dist/esm/icons/eye-off'
import Lock from 'lucide-react-native/dist/esm/icons/lock'
import Mail from 'lucide-react-native/dist/esm/icons/mail'
import Phone from 'lucide-react-native/dist/esm/icons/phone'
import UserIcon from 'lucide-react-native/dist/esm/icons/user'
import { useState } from 'react'
import {
  Linking,
  ActivityIndicator,
  Image,
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
import {
  notifyAuthChange,
  registerWithEmailOtp,
  registerWithToken,
  requestEmailOtp,
  requestOtp,
  verifyOtp,
} from '../../../lib/auth-client'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import Check from 'lucide-react-native/dist/esm/icons/check'
import { GoogleSignInButton } from './google-sign-in-button'
import { OtpInput, ResendTimer } from './otp-input'

type Step = 'phone-input' | 'otp' | 'name' | 'email-form' | 'email-otp'

interface RegisterScreenProps {
  onRegisterSuccess: () => void
  onNavigateToLogin: () => void
}

export function RegisterScreen({ onRegisterSuccess, onNavigateToLogin }: RegisterScreenProps) {
  const { semantic } = useTheme()
  const insets = useSafeAreaInsets()

  const [step, setStep] = useState<Step>('phone-input')
  const [phone, setPhone] = useState('+229')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [registrationToken, setRegistrationToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendKey, setResendKey] = useState(0)
  // Store requirement: no account without explicit terms acceptance.
  const [acceptedTerms, setAcceptedTerms] = useState(false)

  const iconColor = semantic.textTertiary
  const inputBg = semantic.bgSurface
  const inputBorder = semantic.borderNormal
  const placeholderColor = semantic.textTertiary

  // ─── Phone flow ─────────────────────────────────────────────────────────────

  async function handleSendOtp() {
    setError(null)
    setLoading(true)
    try {
      const result = await requestOtp(phone)
      if (result.error) {
        setError(result.error)
        return
      }
      setStep('otp')
      setResendKey(k => k + 1)
    }
    catch {
      setError('Une erreur est survenue')
    }
    finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp(code: string) {
    setError(null)
    setLoading(true)
    try {
      const result = await verifyOtp(phone, code)
      if (result.error) {
        setError(result.error)
        return
      }
      if (result.needsRegistration) {
        // New user — save the registration token and ask for name
        setRegistrationToken(result.registrationToken ?? null)
        setStep('name')
      }
      else {
        // Existing user — already logged in via OTP
        notifyAuthChange()
        onRegisterSuccess()
      }
    }
    catch {
      setError('Une erreur est survenue')
    }
    finally {
      setLoading(false)
    }
  }

  async function handleCompletePhoneRegistration() {
    if (!name.trim()) {
      setError('Veuillez entrer votre nom')
      return
    }
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères')
      return
    }
    if (!registrationToken) {
      setError('Session expirée, veuillez recommencer')
      setStep('phone-input')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const result = await registerWithToken(phone, registrationToken, name, password)
      if (result.error) {
        setError(result.error)
        return
      }
      notifyAuthChange()
      onRegisterSuccess()
    }
    catch {
      setError('Une erreur est survenue')
    }
    finally {
      setLoading(false)
    }
  }

  async function handleResendOtp() {
    setError(null)
    const result = await requestOtp(phone)
    if (result.error) {
      setError(result.error)
      return
    }
    setResendKey(k => k + 1)
  }

  // ─── Email flow ─────────────────────────────────────────────────────────────

  async function handleSendEmailOtp() {
    if (!name.trim()) {
      setError('Veuillez entrer votre nom')
      return
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Veuillez entrer un e-mail valide')
      return
    }
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const result = await requestEmailOtp(email)
      if (result.error) {
        setError(result.error)
        return
      }
      setStep('email-otp')
      setResendKey(k => k + 1)
    }
    catch {
      setError('Une erreur est survenue')
    }
    finally {
      setLoading(false)
    }
  }

  async function handleVerifyEmailOtp(code: string) {
    setError(null)
    setLoading(true)
    try {
      const result = await registerWithEmailOtp(email, code, name, password)
      if (result.error) {
        setError(result.error)
        return
      }
      notifyAuthChange()
      onRegisterSuccess()
    }
    catch {
      setError('Une erreur est survenue')
    }
    finally {
      setLoading(false)
    }
  }

  async function handleResendEmailOtp() {
    setError(null)
    const result = await requestEmailOtp(email)
    if (result.error) {
      setError(result.error)
      return
    }
    setResendKey(k => k + 1)
  }

  // ─── Method toggle ──────────────────────────────────────────────────────────

  function switchToEmail() {
    setStep('email-form')
    setError(null)
  }

  function switchToPhone() {
    setStep('phone-input')
    setError(null)
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  const isPhoneValid = /^\+229\d{10}$/.test(phone)

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: semantic.bgPage }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + spacing[5], paddingBottom: insets.bottom + spacing[6] },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Brand */}
        <View style={styles.brandContainer}>
          <Image
            source={require('../../../../assets/logo-transparent.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        {/* Title */}
        <Text style={[styles.title, { color: semantic.textPrimary }]}>
          {(step === 'otp' || step === 'email-otp') ? 'Vérification' : step === 'name' ? 'Finalisez votre compte' : 'Créer un compte'}
        </Text>
        <Text style={[styles.subtitle, { color: semantic.textSecondary }]}>
          {step === 'phone-input' && 'Entrez votre numéro pour recevoir un code'}
          {step === 'otp' && `Code envoyé au ${phone}`}
          {step === 'name' && 'Choisissez un nom et un mot de passe'}
          {step === 'email-form' && 'Rejoignez la communauté eBio'}
          {step === 'email-otp' && `Code envoyé à ${email}`}
        </Text>

        {/* Error */}
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Form */}
        <View style={styles.form}>
          {/* ─── Phone input step ─── */}
          {step === 'phone-input' && (
            <>
              <View style={[styles.inputContainer, { backgroundColor: inputBg, borderColor: inputBorder }]}>
                <Phone size={20} color={iconColor} strokeWidth={1.8} />
                <TextInput
                  style={[styles.input, { color: semantic.textPrimary, fontFamily: fonts.sans }]}
                  placeholder="+229 XX XX XX XX"
                  placeholderTextColor={placeholderColor}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  maxLength={14}
                />
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.submitButton,
                  { backgroundColor: colors.green[400], opacity: pressed ? 0.85 : 1 },
                  (!isPhoneValid || loading || !acceptedTerms) && styles.submitButtonDisabled,
                ]}
                onPress={handleSendOtp}
                disabled={!isPhoneValid || loading || !acceptedTerms}
              >
                {loading
                  ? (
                      <ActivityIndicator color={colors.neutral[0]} size="small" />
                    )
                  : (
                      <Text style={styles.submitButtonText}>Recevoir le code</Text>
                    )}
              </Pressable>

              <Pressable onPress={switchToEmail} hitSlop={8} style={styles.methodSwitch}>
                <Text style={[styles.methodSwitchText, { color: semantic.textPrimaryColor }]}>
                  S'inscrire avec un e-mail
                </Text>
              </Pressable>

              <View style={styles.dividerRow}>
                <View style={[styles.dividerLine, { backgroundColor: semantic.borderLight }]} />
                <Text style={[styles.dividerText, { color: semantic.textTertiary }]}>ou</Text>
                <View style={[styles.dividerLine, { backgroundColor: semantic.borderLight }]} />
              </View>

              <View
                pointerEvents={acceptedTerms ? 'auto' : 'none'}
                style={!acceptedTerms && styles.submitButtonDisabled}
              >
                <GoogleSignInButton
                  label="S'inscrire avec Google"
                  onSuccess={() => {
                    notifyAuthChange()
                    onRegisterSuccess()
                  }}
                  onError={setError}
                />
              </View>
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

          {/* ─── Name + password step (after phone OTP verified, new user) ─── */}
          {step === 'name' && (
            <>
              <View style={[styles.inputContainer, { backgroundColor: inputBg, borderColor: inputBorder }]}>
                <UserIcon size={20} color={iconColor} strokeWidth={1.8} />
                <TextInput
                  style={[styles.input, { color: semantic.textPrimary, fontFamily: fonts.sans }]}
                  placeholder="Nom complet"
                  placeholderTextColor={placeholderColor}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  autoComplete="name"
                  autoFocus
                />
              </View>

              <View style={[styles.inputContainer, { backgroundColor: inputBg, borderColor: inputBorder }]}>
                <Lock size={20} color={iconColor} strokeWidth={1.8} />
                <TextInput
                  style={[styles.input, { color: semantic.textPrimary, fontFamily: fonts.sans }]}
                  placeholder="Mot de passe (min. 8 caractères)"
                  placeholderTextColor={placeholderColor}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="new-password"
                />
                <Pressable onPress={() => setShowPassword(p => !p)} hitSlop={8} style={styles.eyeButton}>
                  {showPassword
                    ? <EyeOff size={20} color={iconColor} strokeWidth={1.8} />
                    : <Eye size={20} color={iconColor} strokeWidth={1.8} />}
                </Pressable>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.submitButton,
                  { backgroundColor: colors.green[400], opacity: pressed ? 0.85 : 1 },
                  loading && styles.submitButtonDisabled,
                ]}
                onPress={handleCompletePhoneRegistration}
                disabled={loading}
              >
                {loading
                  ? (
                      <ActivityIndicator color={colors.neutral[0]} size="small" />
                    )
                  : (
                      <Text style={styles.submitButtonText}>Créer mon compte</Text>
                    )}
              </Pressable>
            </>
          )}

          {/* ─── Email form ─── */}
          {step === 'email-form' && (
            <>
              <View style={[styles.inputContainer, { backgroundColor: inputBg, borderColor: inputBorder }]}>
                <UserIcon size={20} color={iconColor} strokeWidth={1.8} />
                <TextInput
                  style={[styles.input, { color: semantic.textPrimary, fontFamily: fonts.sans }]}
                  placeholder="Nom complet"
                  placeholderTextColor={placeholderColor}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  autoComplete="name"
                />
              </View>

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
                  autoComplete="new-password"
                />
                <Pressable onPress={() => setShowPassword(p => !p)} hitSlop={8} style={styles.eyeButton}>
                  {showPassword
                    ? <EyeOff size={20} color={iconColor} strokeWidth={1.8} />
                    : <Eye size={20} color={iconColor} strokeWidth={1.8} />}
                </Pressable>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.submitButton,
                  { backgroundColor: colors.green[400], opacity: pressed ? 0.85 : 1 },
                  (loading || !acceptedTerms) && styles.submitButtonDisabled,
                ]}
                onPress={handleSendEmailOtp}
                disabled={loading || !acceptedTerms}
              >
                {loading
                  ? (
                      <ActivityIndicator color={colors.neutral[0]} size="small" />
                    )
                  : (
                      <Text style={styles.submitButtonText}>Recevoir le code</Text>
                    )}
              </Pressable>

              <Pressable onPress={switchToPhone} hitSlop={8} style={styles.methodSwitch}>
                <Text style={[styles.methodSwitchText, { color: semantic.textPrimaryColor }]}>
                  S'inscrire avec un téléphone
                </Text>
              </Pressable>
            </>
          )}

          {/* ─── Email OTP step ─── */}
          {step === 'email-otp' && (
            <>
              <OtpInput
                onComplete={handleVerifyEmailOtp}
                error={error}
                loading={loading}
              />
              <ResendTimer
                key={resendKey}
                seconds={60}
                onResend={handleResendEmailOtp}
                loading={loading}
              />
              {loading && (
                <ActivityIndicator color={colors.green[400]} style={{ marginTop: spacing[4] }} />
              )}
            </>
          )}

          {/* Terms gate — required before any of the three signup paths */}
          {(step === 'phone-input' || step === 'email-form') && (
            <Pressable
              style={styles.termsRow}
              onPress={() => setAcceptedTerms(v => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: acceptedTerms }}
            >
              <View style={[
                styles.checkbox,
                { borderColor: acceptedTerms ? colors.green[400] : semantic.borderNormal },
                acceptedTerms && { backgroundColor: colors.green[400] },
              ]}
              >
                {acceptedTerms && <Check size={13} color={colors.neutral[0]} strokeWidth={3} />}
              </View>
              <Text style={[styles.termsText, { color: semantic.textSecondary }]}>
                J'accepte les
                {' '}
                <Text
                  style={[styles.termsLink, { color: semantic.textPrimaryColor }]}
                  onPress={() => Linking.openURL('https://e-bio.org/cgu')}
                >
                  conditions générales
                </Text>
                {' '}
                et la
                {' '}
                <Text
                  style={[styles.termsLink, { color: semantic.textPrimaryColor }]}
                  onPress={() => Linking.openURL('https://e-bio.org/confidentialite')}
                >
                  politique de confidentialité
                </Text>
              </Text>
            </Pressable>
          )}

          {/* Toggle to login */}
          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, { color: semantic.textSecondary }]}>
              Déjà un compte ?
            </Text>
            <Pressable onPress={onNavigateToLogin} hitSlop={8}>
              <Text style={[styles.toggleLink, { color: semantic.textPrimaryColor }]}>
                Se connecter
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    marginTop: spacing[5],
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  termsText: { ...typography.bodyS, flex: 1 },
  termsLink: { fontFamily: fonts.sansSb, textDecorationLine: 'underline' },

  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: spacing[6] },

  brandContainer: { alignItems: 'center', marginBottom: spacing[5] },
  logo: { width: 96, height: 62 },

  title: { ...typography.h1, marginBottom: spacing[1] },
  subtitle: { ...typography.bodyL, marginBottom: spacing[5] },

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
    borderRadius: radius.lg,
    paddingHorizontal: spacing[4],
    height: 52,
    gap: spacing[3],
  },
  input: { flex: 1, fontSize: 15, height: '100%' },
  eyeButton: { padding: spacing[1] },

  submitButton: {
    height: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing[2],
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
