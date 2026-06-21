import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'
import * as Location from 'expo-location'
import ArrowLeft from 'lucide-react-native/dist/esm/icons/arrow-left'
import Camera from 'lucide-react-native/dist/esm/icons/camera'
import Check from 'lucide-react-native/dist/esm/icons/check'
import MapPin from 'lucide-react-native/dist/esm/icons/map-pin'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { appAlert } from '../../common/components/app-alert'
import { useMediaUpload } from '../../media/hooks/use-media-upload'

interface ShopProfileEditorProps {
  onGoBack: () => void
  onSaved?: () => void
}

export function ShopProfileEditor({ onGoBack, onSaved }: ShopProfileEditorProps) {
  const { semantic } = useTheme()
  const tabBarHeight = useBottomTabBarHeight()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [locating, setLocating] = useState(false)

  const [shopName, setShopName] = useState('')
  const [address, setAddress] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [mobileMoneyNumber, setMobileMoneyNumber] = useState('')
  const [coverPhoto, setCoverPhoto] = useState<string | null>(null)
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null)
  const [latitude, setLatitude] = useState<number | null>(null)
  const [longitude, setLongitude] = useState<number | null>(null)

  const { pickAndUpload: pickCover } = useMediaUpload({ context: 'SUPPLIER_COVER' })
  const { pickAndUpload: pickProfile } = useMediaUpload({ context: 'SUPPLIER_PROFILE' })

  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      try {
        const res = await apiFetch('/api/suppliers/me/settings')
        if (res.ok) {
          const data = await res.json() as Record<string, unknown>
          if (cancelled)
            return
          setShopName((data.shopName as string) ?? '')
          setAddress((data.address as string) ?? '')
          setNeighborhood((data.neighborhood as string) ?? '')
          setMobileMoneyNumber((data.mobileMoneyNumber as string) ?? '')
          setCoverPhoto((data.coverPhoto as string) ?? null)
          setProfilePhoto((data.profilePhoto as string) ?? null)
        }
      }
      catch {
        // ignore — champs vides
      }
      finally {
        if (!cancelled)
          setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  async function handlePickCover(): Promise<void> {
    const result = await pickCover()
    if (result?.publicUrl)
      setCoverPhoto(result.publicUrl)
  }

  async function handlePickProfile(): Promise<void> {
    const result = await pickProfile()
    if (result?.publicUrl)
      setProfilePhoto(result.publicUrl)
  }

  async function handleDetectLocation(): Promise<void> {
    setLocating(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        appAlert('Permission requise', 'Autorisez la localisation pour positionner votre boutique.')
        return
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
      setLatitude(position.coords.latitude)
      setLongitude(position.coords.longitude)
    }
    catch {
      appAlert('Erreur', 'Impossible de récupérer votre position.')
    }
    finally {
      setLocating(false)
    }
  }

  async function handleSave(): Promise<void> {
    if (!shopName.trim()) {
      appAlert('Champ requis', 'Le nom de la boutique est obligatoire.')
      return
    }
    setSaving(true)
    try {
      // L'API attend des strings optionnelles (undefined), jamais null -> on omet les champs vides
      const body: Record<string, unknown> = { shopName: shopName.trim() }
      const addr = address.trim()
      if (addr)
        body.address = addr
      const nb = neighborhood.trim()
      if (nb)
        body.neighborhood = nb
      const mm = mobileMoneyNumber.trim()
      if (mm)
        body.mobileMoneyNumber = mm
      if (coverPhoto)
        body.coverPhoto = coverPhoto
      if (profilePhoto)
        body.profilePhoto = profilePhoto
      if (latitude !== null && longitude !== null) {
        body.latitude = latitude
        body.longitude = longitude
      }

      const res = await apiFetch('/api/suppliers/me', {
        method: 'PUT',
        body: JSON.stringify(body),
      })
      if (res.ok) {
        appAlert('Enregistré', 'Votre boutique a été mise à jour.')
        onSaved?.()
      }
      else {
        appAlert('Erreur', 'Impossible d\'enregistrer les modifications.')
      }
    }
    catch {
      appAlert('Erreur', 'Vérifiez votre connexion.')
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

  const hasLocation = latitude !== null && longitude !== null

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={[styles.screen, { backgroundColor: semantic.bgPage }]}
        contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + spacing[6] }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={onGoBack} hitSlop={8}>
            <ArrowLeft size={24} color={semantic.textPrimary} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: semantic.textPrimary }]}>Profil de la boutique</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Cover */}
        <TouchableOpacity style={styles.coverPicker} onPress={handlePickCover} activeOpacity={0.8}>
          {coverPhoto
            ? (
                <Image source={{ uri: coverPhoto }} style={styles.coverImage} resizeMode="cover" />
              )
            : (
                <View style={[styles.coverPlaceholder, { backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }]}>
                  <Camera size={24} color={semantic.textTertiary} />
                  <Text style={[styles.pickerHint, { color: semantic.textTertiary }]}>Photo de couverture</Text>
                </View>
              )}
        </TouchableOpacity>

        {/* Profile / logo */}
        <TouchableOpacity style={styles.profilePicker} onPress={handlePickProfile} activeOpacity={0.8}>
          {profilePhoto
            ? (
                <Image source={{ uri: profilePhoto }} style={styles.profileImage} resizeMode="cover" />
              )
            : (
                <View style={[styles.profilePlaceholder, { backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }]}>
                  <Camera size={20} color={semantic.textTertiary} />
                </View>
              )}
          <Text style={[styles.pickerHint, { color: semantic.textTertiary }]}>Logo</Text>
        </TouchableOpacity>

        <Text style={[styles.label, { color: semantic.textSecondary }]}>Nom de la boutique *</Text>
        <TextInput
          style={[styles.textInput, { borderColor: semantic.borderNormal, color: semantic.textPrimary, backgroundColor: semantic.bgSurface }]}
          placeholder="Nom de votre boutique"
          placeholderTextColor={semantic.textTertiary}
          value={shopName}
          onChangeText={setShopName}
        />

        <Text style={[styles.label, { color: semantic.textSecondary }]}>Adresse</Text>
        <TextInput
          style={[styles.textInput, { borderColor: semantic.borderNormal, color: semantic.textPrimary, backgroundColor: semantic.bgSurface }]}
          placeholder="Adresse de la boutique"
          placeholderTextColor={semantic.textTertiary}
          value={address}
          onChangeText={setAddress}
        />

        <Text style={[styles.label, { color: semantic.textSecondary }]}>Quartier</Text>
        <TextInput
          style={[styles.textInput, { borderColor: semantic.borderNormal, color: semantic.textPrimary, backgroundColor: semantic.bgSurface }]}
          placeholder="Quartier"
          placeholderTextColor={semantic.textTertiary}
          value={neighborhood}
          onChangeText={setNeighborhood}
        />

        <Text style={[styles.label, { color: semantic.textSecondary }]}>Numéro Mobile Money</Text>
        <TextInput
          style={[styles.textInput, { borderColor: semantic.borderNormal, color: semantic.textPrimary, backgroundColor: semantic.bgSurface }]}
          placeholder="Ex: 0190000000"
          placeholderTextColor={semantic.textTertiary}
          keyboardType="phone-pad"
          value={mobileMoneyNumber}
          onChangeText={setMobileMoneyNumber}
        />

        <Text style={[styles.label, { color: semantic.textSecondary }]}>Localisation</Text>
        <TouchableOpacity
          style={[styles.locationButton, { borderColor: hasLocation ? colors.green[400] : semantic.borderNormal, backgroundColor: semantic.bgSurface }]}
          onPress={handleDetectLocation}
          disabled={locating}
          activeOpacity={0.7}
        >
          {locating
            ? (
                <ActivityIndicator size="small" color={colors.green[400]} />
              )
            : hasLocation
              ? (
                  <>
                    <Check size={18} color={colors.green[600]} />
                    <Text style={[styles.locationText, { color: colors.green[600] }]}>Position enregistrée</Text>
                  </>
                )
              : (
                  <>
                    <MapPin size={18} color={semantic.textSecondary} />
                    <Text style={[styles.locationText, { color: semantic.textSecondary }]}>Détecter ma position</Text>
                  </>
                )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving
            ? (
                <ActivityIndicator size="small" color={colors.neutral[0]} />
              )
            : (
                <Text style={styles.saveButtonText}>Enregistrer</Text>
              )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { paddingHorizontal: spacing[4], paddingBottom: spacing[10], gap: spacing[2] },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing[3],
  },
  headerTitle: { ...typography.h2 },

  coverPicker: { marginTop: spacing[2] },
  coverImage: { width: '100%', height: 140, borderRadius: radius.lg },
  coverPlaceholder: {
    width: '100%',
    height: 140,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing[1],
  },
  profilePicker: { alignItems: 'center', marginTop: -36, gap: spacing[1] },
  profileImage: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: colors.neutral[0] },
  profilePlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerHint: { ...typography.caption },

  label: { ...typography.caption, marginTop: spacing[3] },
  textInput: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    fontFamily: fonts.sans,
    fontSize: 15,
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  locationText: { ...typography.bodyS, fontFamily: fonts.sansSb },
  saveButton: {
    marginTop: spacing[6],
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.green[400],
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { ...typography.h3, fontSize: 15, color: colors.neutral[0] },
})
