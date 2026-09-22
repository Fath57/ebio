import Camera from 'lucide-react-native/dist/esm/icons/camera'
import Check from 'lucide-react-native/dist/esm/icons/check'
import CircleCheck from 'lucide-react-native/dist/esm/icons/circle-check'
import Mail from 'lucide-react-native/dist/esm/icons/mail'
import PhoneIcon from 'lucide-react-native/dist/esm/icons/phone'
import UserIcon from 'lucide-react-native/dist/esm/icons/user'
import { useEffect, useState } from 'react'
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
import { notifyAuthChange } from '../../../lib/auth-client'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { ConfirmModal } from '../../common/components/confirm-modal'
import { KeyboardAwareView } from '../../common/components/keyboard-aware-view'
import { ScreenHeader } from '../../common/components/screen-header'
import { useMediaUpload } from '../../media/hooks/use-media-upload'

interface EditProfileScreenProps {
  onGoBack: () => void
}

interface UserProfile {
  id: string
  name: string
  email: string | null
  phone: string | null
  role: string
  image: string | null
}

export function EditProfileScreen({ onGoBack }: EditProfileScreenProps) {
  const { semantic } = useTheme()
  const insets = useSafeAreaInsets()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [imageUri, setImageUri] = useState<string | null>(null)
  /** Set once a new photo has reached the storage; null means unchanged. */
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)

  const { pickAndUpload, uploading } = useMediaUpload({ context: 'SUPPLIER_PROFILE' })

  const iconColor = semantic.textTertiary
  const inputBg = semantic.bgSurface
  const inputBorder = semantic.borderNormal
  const placeholderColor = semantic.textTertiary

  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await apiFetch('/api/users/me')
        if (res.ok) {
          const data: UserProfile = await res.json()
          setName(data.name ?? '')
          // Filter out placeholder emails generated for phone registrations
          const isPlaceholderEmail = data.email?.endsWith('@phone.ebio.app')
          setEmail(isPlaceholderEmail ? '' : (data.email ?? ''))
          setPhone(data.phone ?? '')
          setImageUri(data.image ?? null)
        }
      }
      catch {
        setError('Impossible de charger le profil')
      }
      finally {
        setLoading(false)
      }
    }
    loadProfile()
  }, [])

  // The photo goes up as soon as it is picked, so a failure is said at the
  // moment it happens instead of being swallowed by the save.
  async function handlePickImage() {
    const uploaded = await pickAndUpload()
    if (uploaded?.publicUrl) {
      setUploadedImageUrl(uploaded.publicUrl)
      setImageUri(uploaded.publicUrl)
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      setError('Le nom est requis')
      return
    }
    setError(null)
    setSaving(true)
    try {
      const body: Record<string, string> = { name: name.trim() }
      if (email.trim())
        body.email = email.trim()
      if (phone.trim())
        body.phone = phone.trim()

      if (uploadedImageUrl) {
        body.image = uploadedImageUrl
      }

      const res = await apiFetch('/api/users/me', {
        method: 'PUT',
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.message ?? 'Erreur lors de la sauvegarde')
        return
      }

      notifyAuthChange()
      setShowSuccess(true)
    }
    catch {
      setError('Une erreur est survenue')
    }
    finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: semantic.bgPage }]}>
        <ActivityIndicator size="large" color={colors.green[400]} />
      </View>
    )
  }

  return (
    <KeyboardAwareView style={[styles.flex, { backgroundColor: semantic.bgPage }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + spacing[4], paddingBottom: insets.bottom + spacing[8] },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <ScreenHeader
          title="Modifier le profil"
          onBack={onGoBack}
          rightSlot={(
            <Pressable onPress={handleSave} disabled={saving} hitSlop={8}>
              {saving
                ? <ActivityIndicator size="small" color={colors.green[400]} />
                : <Check size={24} color={colors.green[400]} strokeWidth={2.5} />}
            </Pressable>
          )}
        />

        {/* Error */}
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Avatar */}
        <Pressable onPress={handlePickImage} disabled={uploading} style={styles.avatarSection}>
          <View style={styles.avatarWrapper}>
            {imageUri
              ? (
                  <Image source={{ uri: imageUri }} style={styles.avatar} />
                )
              : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarText}>
                      {name ? name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() : '?'}
                    </Text>
                  </View>
                )}
            <View style={styles.cameraButton}>
              {uploading
                ? <ActivityIndicator size="small" color={colors.neutral[0]} />
                : <Camera size={14} color={colors.neutral[0]} />}
            </View>
          </View>
          <Text style={[styles.avatarHint, { color: semantic.textPrimaryColor }]}>
            {uploading ? 'Envoi de la photo…' : 'Changer la photo'}
          </Text>
        </Pressable>

        {/* Form */}
        <View style={styles.form}>
          <Text style={[styles.label, { color: semantic.textSecondary }]}>Nom complet</Text>
          <View style={[styles.inputContainer, { backgroundColor: inputBg, borderColor: inputBorder }]}>
            <UserIcon size={20} color={iconColor} strokeWidth={1.8} />
            <TextInput
              style={[styles.input, { color: semantic.textPrimary, fontFamily: fonts.sans }]}
              placeholder="Votre nom"
              placeholderTextColor={placeholderColor}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoComplete="name"
            />
          </View>

          <Text style={[styles.label, { color: semantic.textSecondary }]}>Adresse e-mail</Text>
          <View style={[styles.inputContainer, { backgroundColor: inputBg, borderColor: inputBorder }]}>
            <Mail size={20} color={iconColor} strokeWidth={1.8} />
            <TextInput
              style={[styles.input, { color: semantic.textPrimary, fontFamily: fonts.sans }]}
              placeholder="nom@exemple.com"
              placeholderTextColor={placeholderColor}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
            />
          </View>

          <Text style={[styles.label, { color: semantic.textSecondary }]}>Téléphone</Text>
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
            />
          </View>
        </View>

        {/* Save button */}
        <Pressable
          style={({ pressed }) => [
            styles.saveButton,
            { opacity: pressed ? 0.85 : 1 },
            saving && styles.saveButtonDisabled,
          ]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? (
                <ActivityIndicator color={colors.neutral[0]} size="small" />
              )
            : (
                <Text style={styles.saveButtonText}>Enregistrer</Text>
              )}
        </Pressable>
      </ScrollView>

      <ConfirmModal
        visible={showSuccess}
        icon={CircleCheck}
        iconColor={colors.green[400]}
        iconBg={colors.green[50]}
        title="Profil mis à jour"
        message="Vos informations ont été sauvegardées."
        confirmLabel="OK"
        onConfirm={() => {
          setShowSuccess(false)
          onGoBack()
        }}
        onCancel={() => {
          setShowSuccess(false)
          onGoBack()
        }}
      />
    </KeyboardAwareView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { flexGrow: 1, paddingHorizontal: spacing[6] },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[6],
  },
  headerTitle: { ...typography.h2 },

  avatarSection: { alignItems: 'center', marginBottom: spacing[6] },
  avatarWrapper: { position: 'relative' },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  avatarFallback: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.green[400],
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontFamily: fonts.sansBd, fontSize: 32, color: colors.neutral[0] },
  cameraButton: {
    position: 'absolute',
    bottom: 0,
    right: -2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.neutral[800],
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.neutral[0],
  },
  avatarHint: { ...typography.bodyS, fontFamily: fonts.sansSb, marginTop: spacing[2] },

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

  form: { gap: spacing[2] },
  label: { ...typography.caption, marginTop: spacing[3], marginBottom: spacing[1] },
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

  saveButton: {
    height: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing[8],
    backgroundColor: colors.green[400],
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { ...typography.h3, color: colors.neutral[0] },
})
