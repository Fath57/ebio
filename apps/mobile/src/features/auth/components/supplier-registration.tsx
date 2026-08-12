import * as Location from 'expo-location'
import Camera from 'lucide-react-native/dist/esm/icons/camera'
import Check from 'lucide-react-native/dist/esm/icons/check'
import CircleCheck from 'lucide-react-native/dist/esm/icons/circle-check'
import FileText from 'lucide-react-native/dist/esm/icons/file-text'
import Hourglass from 'lucide-react-native/dist/esm/icons/hourglass'
import MapPin from 'lucide-react-native/dist/esm/icons/map-pin'
import AlertTriangle from 'lucide-react-native/dist/esm/icons/triangle-alert'
import * as React from 'react'
import { useCallback, useEffect, useState } from 'react'
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
import { storage } from '../../../utils/offline-storage'
import { ConfirmModal } from '../../common/components/confirm-modal'
import { ScreenHeader } from '../../common/components/screen-header'
import { useMediaUpload } from '../../media/hooks/use-media-upload'

const DRAFT_KEY = 'supplier_registration_draft'
const TOTAL_STEPS = 4

type SupplierType = 'INPUTS' | 'TRANSFORMER'

interface RegistrationDraft {
  step: number
  shopName: string
  supplierType: SupplierType | null
  shopPhotoUri: string | null
  latitude: number | null
  longitude: number | null
  mobileMoneyNumber: string
  identityDocUri: string | null
  businessProofUri: string | null
}

const EMPTY_DRAFT: RegistrationDraft = {
  step: 1,
  shopName: '',
  supplierType: null,
  shopPhotoUri: null,
  latitude: null,
  longitude: null,
  mobileMoneyNumber: '',
  identityDocUri: null,
  businessProofUri: null,
}

function loadDraft(): RegistrationDraft {
  const raw = storage.getString(DRAFT_KEY)
  if (!raw)
    return { ...EMPTY_DRAFT }
  try {
    return JSON.parse(raw) as RegistrationDraft
  }
  catch {
    return { ...EMPTY_DRAFT }
  }
}

function saveDraft(draft: RegistrationDraft): void {
  storage.set(DRAFT_KEY, JSON.stringify(draft))
}

function clearDraft(): void {
  storage.delete(DRAFT_KEY)
}

interface SupplierRegistrationProps {
  /** Called when phone OTP step is already verified */
  isPhoneVerified?: boolean
  onComplete?: () => void
  onGoBack?: () => void
}

export function SupplierRegistration({
  isPhoneVerified = false,
  onComplete,
  onGoBack,
}: SupplierRegistrationProps) {
  const { semantic } = useTheme()
  const [draft, setDraft] = useState<RegistrationDraft>(loadDraft)
  const [isLocating, setIsLocating] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [shopPhotoMediaId, setShopPhotoMediaId] = useState<string | null>(null)
  const [identityDocMediaId, setIdentityDocMediaId] = useState<string | null>(null)
  const [businessProofMediaId, setBusinessProofMediaId] = useState<string | null>(null)
  const [errorModal, setErrorModal] = useState<{ visible: boolean, title: string, message: string }>({ visible: false, title: '', message: '' })

  function showError(title: string, message: string) {
    setErrorModal({ visible: true, title, message })
  }

  const { pickAndUpload: pickShopPhoto } = useMediaUpload({
    context: 'SUPPLIER_PROFILE',
  })
  const { pickAndUpload: pickIdentityDoc } = useMediaUpload({
    context: 'IDENTITY_DOCUMENT',
  })
  const { pickAndUpload: pickBusinessProof } = useMediaUpload({
    context: 'BUSINESS_PROOF',
  })

  const currentStep = isPhoneVerified && draft.step === 1 ? 2 : draft.step

  useEffect(() => {
    saveDraft(draft)
  }, [draft])

  const updateDraft = useCallback(
    (updates: Partial<RegistrationDraft>) => {
      setDraft(prev => ({ ...prev, ...updates }))
    },
    [],
  )

  function handleNext(): void {
    // Validate current step before proceeding
    if (currentStep === 2) {
      if (!draft.shopName.trim()) {
        showError('Champ requis', 'Veuillez entrer le nom de votre boutique.')
        return
      }
      if (!draft.supplierType) {
        showError('Champ requis', 'Veuillez choisir votre type de fournisseur.')
        return
      }
      if (!draft.mobileMoneyNumber.trim() || draft.mobileMoneyNumber.trim().length < 8) {
        showError('Champ requis', 'Veuillez entrer un numéro Mobile Money valide.')
        return
      }
    }

    if (currentStep < TOTAL_STEPS) {
      updateDraft({ step: currentStep + 1 })
    }
  }

  function handleBack(): void {
    if (currentStep > 1) {
      updateDraft({ step: currentStep - 1 })
    }
  }

  async function handlePickShopPhoto(): Promise<void> {
    const result = await pickShopPhoto()
    if (result) {
      setShopPhotoMediaId(result.mediaId)
      updateDraft({ shopPhotoUri: result.publicUrl })
    }
  }

  async function handleDetectGPS(): Promise<void> {
    setIsLocating(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        showError('Permission refusée', 'Veuillez autoriser la localisation pour détecter votre position.')
        return
      }
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      })
      updateDraft({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      })
    }
    catch {
      showError('Erreur', 'Impossible de détecter votre position.')
    }
    finally {
      setIsLocating(false)
    }
  }

  async function handlePickDocument(
    field: 'identityDocUri' | 'businessProofUri',
  ): Promise<void> {
    const picker = field === 'identityDocUri' ? pickIdentityDoc : pickBusinessProof
    const result = await picker()
    if (result) {
      if (field === 'identityDocUri') {
        setIdentityDocMediaId(result.mediaId)
      }
      else {
        setBusinessProofMediaId(result.mediaId)
      }
      updateDraft({ [field]: result.publicUrl })
    }
  }

  async function handleSubmit(): Promise<void> {
    if (!draft.shopName.trim() || !draft.supplierType || !draft.mobileMoneyNumber.trim()) {
      showError('Champs requis', 'Veuillez compléter toutes les informations obligatoires à l\'étape précédente.')
      return
    }
    setIsSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        shopName: draft.shopName,
        type: draft.supplierType,
        mobileMoneyNumber: draft.mobileMoneyNumber,
      }

      if (draft.latitude !== null && draft.longitude !== null) {
        body.latitude = draft.latitude
        body.longitude = draft.longitude
      }

      if (shopPhotoMediaId) {
        body.shopPhotoMediaId = shopPhotoMediaId
      }

      if (identityDocMediaId) {
        body.identityDocMediaId = identityDocMediaId
      }

      if (businessProofMediaId) {
        body.businessProofMediaId = businessProofMediaId
      }

      const res = await apiFetch('/api/suppliers/register', {
        method: 'POST',
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message ?? 'Inscription refusée')
      }

      clearDraft()
      updateDraft({ step: 4 })
    }
    catch {
      const msg = error instanceof Error ? error.message : 'L\'inscription a échoué. Veuillez réessayer.'
      showError('Erreur', msg)
    }
    finally {
      setIsSubmitting(false)
    }
  }

  function renderProgressIndicator(): React.ReactNode {
    return (
      <View style={styles.progressContainer}>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => {
          const stepNum = i + 1
          const isActive = stepNum === currentStep
          const isCompleted = stepNum < currentStep
          return (
            <View key={stepNum} style={styles.progressStepRow}>
              <View
                style={[
                  styles.progressDot,
                  { backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal },
                  isActive && styles.progressDotActive,
                  isCompleted && styles.progressDotCompleted,
                ]}
              >
                {isCompleted
                  ? (
                      <Check size={14} color={colors.neutral[0]} />
                    )
                  : (
                      <Text
                        style={[
                          styles.progressDotText,
                          { color: semantic.textTertiary },
                          (isActive || isCompleted) && styles.progressDotTextActive,
                        ]}
                      >
                        {String(stepNum)}
                      </Text>
                    )}
              </View>
              {stepNum < TOTAL_STEPS && (
                <View
                  style={[
                    styles.progressLine,
                    { backgroundColor: semantic.borderNormal },
                    isCompleted && styles.progressLineCompleted,
                  ]}
                />
              )}
            </View>
          )
        })}
      </View>
    )
  }

  function renderStepOTP(): React.ReactNode {
    return (
      <View style={styles.stepContent}>
        <Text style={[styles.stepTitle, { color: semantic.textPrimary }]}>Vérification du téléphone</Text>
        <Text style={[styles.stepDescription, { color: semantic.textSecondary }]}>
          Un code OTP a été envoyé à votre numéro. Saisissez-le pour continuer.
        </Text>
        <Text style={[styles.placeholderText, { color: semantic.textTertiary }]}>
          Composant OTP existant à réutiliser ici
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleNext}
          accessibilityLabel="Continuer"
        >
          <Text style={styles.primaryButtonText}>Continuer</Text>
        </TouchableOpacity>
      </View>
    )
  }

  function renderStepProfile(): React.ReactNode {
    const isProfileValid
      = draft.shopName.trim().length > 0
        && draft.supplierType !== null
        && draft.mobileMoneyNumber.trim().length > 0

    return (
      <View style={styles.stepContent}>
        <Text style={[styles.stepTitle, { color: semantic.textPrimary }]}>Profil de la boutique</Text>

        <Text style={[styles.label, { color: semantic.textSecondary }]}>Nom de la boutique *</Text>
        <TextInput
          style={[styles.textInput, { color: semantic.textPrimary, backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }]}
          placeholder="Ex: Bio Market Dakar"
          placeholderTextColor={semantic.textTertiary}
          value={draft.shopName}
          onChangeText={text => updateDraft({ shopName: text })}
          accessibilityLabel="Nom de la boutique"
        />

        <Text style={[styles.label, { color: semantic.textSecondary }]}>Type de fournisseur *</Text>
        <View style={styles.typeRow}>
          {(
            [
              { value: 'INPUTS' as const, label: 'Intrants' },
              { value: 'TRANSFORMER' as const, label: 'Transformateur' },
            ] as const
          ).map((option) => {
            const isSelected = draft.supplierType === option.value
            return (
              <TouchableOpacity
                key={option.value}
                style={[styles.typeChip, { backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }, isSelected && styles.typeChipActive]}
                onPress={() => updateDraft({ supplierType: option.value })}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={option.label}
              >
                <Text
                  style={[
                    styles.typeChipText,
                    { color: semantic.textSecondary },
                    isSelected && styles.typeChipTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>

        <Text style={[styles.label, { color: semantic.textSecondary }]}>Photo de la boutique</Text>
        <TouchableOpacity
          style={[styles.photoPickerButton, { borderColor: semantic.borderNormal }]}
          onPress={handlePickShopPhoto}
          accessibilityLabel="Choisir une photo de la boutique"
        >
          {draft.shopPhotoUri
            ? (
                <Image
                  source={{ uri: draft.shopPhotoUri }}
                  style={styles.shopPhotoPreview}
                  resizeMode="cover"
                />
              )
            : (
                <View style={[styles.photoPickerPlaceholder, { backgroundColor: semantic.bgSurface }]}>
                  <Camera size={28} color={semantic.textTertiary} />
                  <Text style={[styles.photoPickerText, { color: semantic.textTertiary }]}>Ajouter une photo</Text>
                </View>
              )}
        </TouchableOpacity>

        <Text style={[styles.label, { color: semantic.textSecondary }]}>Localisation GPS</Text>
        <TouchableOpacity
          style={[styles.gpsButton, { backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }]}
          onPress={handleDetectGPS}
          disabled={isLocating}
          accessibilityLabel="Détecter ma position"
        >
          {isLocating
            ? (
                <ActivityIndicator size="small" color={colors.green[400]} />
              )
            : (
                <>
                  <MapPin size={16} color={semantic.textSecondary} />
                  <Text style={[styles.gpsButtonText, { color: semantic.textSecondary }]}>
                    {draft.latitude !== null
                      ? `Position détectée (${draft.latitude.toFixed(4)}, ${draft.longitude?.toFixed(4)})`
                      : 'Détecter ma position'}
                  </Text>
                </>
              )}
        </TouchableOpacity>

        <Text style={[styles.label, { color: semantic.textSecondary }]}>Numéro Mobile Money *</Text>
        <TextInput
          style={[styles.textInput, { color: semantic.textPrimary, backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }]}
          placeholder="Ex: +221 77 123 45 67"
          placeholderTextColor={semantic.textTertiary}
          keyboardType="phone-pad"
          value={draft.mobileMoneyNumber}
          onChangeText={text => updateDraft({ mobileMoneyNumber: text })}
          accessibilityLabel="Numéro Mobile Money"
        />

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.secondaryButton, { borderColor: semantic.borderNormal }]}
            onPress={handleBack}
            accessibilityLabel="Retour"
          >
            <Text style={[styles.secondaryButtonText, { color: semantic.textSecondary }]}>Retour</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.primaryButton,
              styles.buttonFlex,
              !isProfileValid && styles.buttonDisabled,
            ]}
            onPress={handleNext}
            disabled={!isProfileValid}
            accessibilityLabel="Suivant"
          >
            <Text style={styles.primaryButtonText}>Suivant</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  function renderStepDocuments(): React.ReactNode {
    return (
      <View style={styles.stepContent}>
        <Text style={[styles.stepTitle, { color: semantic.textPrimary }]}>Documents justificatifs</Text>
        <Text style={[styles.stepDescription, { color: semantic.textSecondary }]}>
          Ajoutez vos documents pour accélérer la validation. Vous pourrez les ajouter plus tard.
        </Text>

        <Text style={[styles.label, { color: semantic.textSecondary }]}>
          Pièce d'identité (CNI, Passeport, Permis)
        </Text>
        <TouchableOpacity
          style={[styles.documentPickerButton, { borderColor: semantic.borderNormal }]}
          onPress={() => handlePickDocument('identityDocUri')}
          accessibilityLabel="Ajouter une pièce d'identité"
        >
          {draft.identityDocUri
            ? (
                <View style={[styles.documentPickerSuccess, { backgroundColor: semantic.bgPrimaryLight }]}>
                  <CircleCheck size={24} color={semantic.textPrimaryColor} />
                  <Text style={[styles.documentPickerSuccessText, { color: semantic.textPrimaryColor }]}>
                    Document ajouté
                  </Text>
                </View>
              )
            : (
                <View style={[styles.documentPickerPlaceholder, { backgroundColor: semantic.bgSurface }]}>
                  <FileText size={24} color={semantic.textTertiary} />
                  <Text style={[styles.documentPickerText, { color: semantic.textTertiary }]}>
                    Ajouter un document
                  </Text>
                </View>
              )}
        </TouchableOpacity>

        <Text style={[styles.label, { color: semantic.textSecondary }]}>
          Justificatif d'activité (optionnel)
        </Text>
        <TouchableOpacity
          style={[styles.documentPickerButton, { borderColor: semantic.borderNormal }]}
          onPress={() => handlePickDocument('businessProofUri')}
          accessibilityLabel="Ajouter un justificatif d'activité"
        >
          {draft.businessProofUri
            ? (
                <View style={[styles.documentPickerSuccess, { backgroundColor: semantic.bgPrimaryLight }]}>
                  <CircleCheck size={24} color={semantic.textPrimaryColor} />
                  <Text style={[styles.documentPickerSuccessText, { color: semantic.textPrimaryColor }]}>
                    Document ajouté
                  </Text>
                </View>
              )
            : (
                <View style={[styles.documentPickerPlaceholder, { backgroundColor: semantic.bgSurface }]}>
                  <FileText size={24} color={semantic.textTertiary} />
                  <Text style={[styles.documentPickerText, { color: semantic.textTertiary }]}>
                    Ajouter un document
                  </Text>
                </View>
              )}
        </TouchableOpacity>

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.secondaryButton, { borderColor: semantic.borderNormal }]}
            onPress={handleBack}
            accessibilityLabel="Retour"
          >
            <Text style={[styles.secondaryButtonText, { color: semantic.textSecondary }]}>Retour</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.primaryButton,
              styles.buttonFlex,
              isSubmitting && styles.buttonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={isSubmitting}
            accessibilityLabel="Envoyer la demande"
          >
            {isSubmitting
              ? (
                  <ActivityIndicator size="small" color={colors.neutral[0]} />
                )
              : (
                  <Text style={styles.primaryButtonText}>Envoyer la demande</Text>
                )}
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  function renderStepConfirmation(): React.ReactNode {
    return (
      <View style={styles.confirmationContainer}>
        <Hourglass size={64} color={colors.green[400]} />
        <Text style={[styles.confirmationTitle, { color: semantic.textPrimary }]}>En attente de validation</Text>
        <Text style={[styles.confirmationDescription, { color: semantic.textSecondary }]}>
          Votre demande d'inscription en tant que fournisseur a été envoyée.
          Notre équipe vérifiera vos informations sous 24 à 48 heures. Vous
          recevrez une notification dès que votre compte sera activé.
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => {
            clearDraft()
            onComplete?.()
          }}
          accessibilityLabel="Retour à l'accueil"
        >
          <Text style={styles.primaryButtonText}>Retour à l'accueil</Text>
        </TouchableOpacity>
      </View>
    )
  }

  function renderCurrentStep(): React.ReactNode {
    switch (currentStep) {
      case 1:
        return renderStepOTP()
      case 2:
        return renderStepProfile()
      case 3:
        return renderStepDocuments()
      case 4:
        return renderStepConfirmation()
      default:
        return null
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: semantic.bgPage }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScreenHeader title="Devenir fournisseur" onBack={onGoBack} />
      <ScrollView
        contentContainerStyle={styles.screenContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {renderProgressIndicator()}
        {renderCurrentStep()}
      </ScrollView>

      <ConfirmModal
        visible={errorModal.visible}
        icon={AlertTriangle}
        iconColor={colors.coral[400]}
        iconBg={colors.coral[50]}
        title={errorModal.title}
        message={errorModal.message}
        confirmLabel="OK"
        onConfirm={() => setErrorModal(e => ({ ...e, visible: false }))}
        onCancel={() => setErrorModal(e => ({ ...e, visible: false }))}
      />
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.neutral[0],
  },
  screenContent: {
    flexGrow: 1,
    paddingTop: spacing[4],
    paddingBottom: spacing[10],
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[4],
  },
  progressStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.neutral[100],
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.neutral[200],
  },
  progressDotActive: {
    backgroundColor: colors.green[50],
    borderColor: colors.green[400],
  },
  progressDotCompleted: {
    backgroundColor: colors.green[400],
    borderColor: colors.green[400],
  },
  progressDotText: {
    fontFamily: fonts.sansSb,
    fontSize: 12,
    color: colors.neutral[400],
  },
  progressDotTextActive: {
    color: colors.green[800],
  },
  progressLine: {
    width: 40,
    height: 2,
    backgroundColor: colors.neutral[200],
  },
  progressLineCompleted: {
    backgroundColor: colors.green[400],
  },
  stepContent: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[10],
    gap: spacing[3],
  },
  stepTitle: {
    ...typography.h1,
    color: colors.neutral[800],
    marginBottom: spacing[1],
  },
  stepDescription: {
    ...typography.bodyL,
    color: colors.neutral[600],
  },
  placeholderText: {
    ...typography.bodyS,
    color: colors.neutral[400],
    textAlign: 'center',
    paddingVertical: spacing[8],
  },
  label: {
    ...typography.caption,
    color: colors.neutral[600],
    marginTop: spacing[2],
  },
  textInput: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.neutral[800],
    backgroundColor: colors.neutral[50],
  },
  typeRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  typeChip: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    backgroundColor: colors.neutral[50],
  },
  typeChipActive: {
    backgroundColor: colors.green[50],
    borderColor: colors.green[400],
  },
  typeChipText: {
    fontFamily: fonts.sansMd,
    fontSize: 14,
    color: colors.neutral[600],
  },
  typeChipTextActive: {
    color: colors.green[800],
  },
  photoPickerButton: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.neutral[200],
    borderStyle: 'dashed',
  },
  photoPickerPlaceholder: {
    minHeight: 120,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.neutral[50],
    gap: spacing[2],
  },
  photoPickerText: {
    ...typography.bodyS,
    color: colors.neutral[400],
  },
  shopPhotoPreview: {
    width: '100%',
    height: 160,
  },
  gpsButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    borderWidth: 1,
    borderColor: colors.neutral[200],
    borderRadius: radius.md,
    backgroundColor: colors.neutral[50],
  },
  gpsButtonText: {
    fontFamily: fonts.sansMd,
    fontSize: 14,
    color: colors.neutral[600],
  },
  documentPickerButton: {
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.neutral[200],
    borderStyle: 'dashed',
  },
  documentPickerPlaceholder: {
    minHeight: 80,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.neutral[50],
    gap: spacing[1],
  },
  documentPickerText: {
    ...typography.bodyS,
    color: colors.neutral[400],
  },
  documentPickerSuccess: {
    minHeight: 80,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.green[50],
    gap: spacing[1],
  },
  documentPickerSuccessText: {
    ...typography.bodyS,
    color: colors.green[600],
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[4],
  },
  primaryButton: {
    minHeight: 44,
    backgroundColor: colors.green[400],
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
  },
  primaryButtonText: {
    fontFamily: fonts.sansSb,
    fontSize: 16,
    color: colors.neutral[0],
  },
  secondaryButton: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
  },
  secondaryButtonText: {
    fontFamily: fonts.sansMd,
    fontSize: 16,
    color: colors.neutral[600],
  },
  buttonFlex: {
    flex: 1,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  confirmationContainer: {
    alignItems: 'center',
    paddingHorizontal: spacing[6],
    paddingTop: spacing[12],
    gap: spacing[4],
  },
  confirmationTitle: {
    ...typography.h1,
    color: colors.neutral[800],
    textAlign: 'center',
  },
  confirmationDescription: {
    ...typography.bodyL,
    color: colors.neutral[600],
    textAlign: 'center',
  },
})
