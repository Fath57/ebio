import * as Location from 'expo-location'
import Banknote from 'lucide-react-native/dist/esm/icons/banknote'
import Camera from 'lucide-react-native/dist/esm/icons/camera'
import CircleCheck from 'lucide-react-native/dist/esm/icons/circle-check'
import MapPin from 'lucide-react-native/dist/esm/icons/map-pin'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { colors, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { appAlert } from '../../common/components/app-alert'
import { KeyboardAwareView } from '../../common/components/keyboard-aware-view'
import { useMediaUpload } from '../../media/hooks/use-media-upload'
import { BUYER_CODE_PATTERN, HUB_CODE_LENGTH } from '../types'

interface CompleteResult { ok: boolean, queued: boolean, status?: number, errorMessage?: string, errorCode?: string }

interface ProofScreenProps {
  /** Cash orders close with the buyer's code only: the photo fallback is off. */
  isCash?: boolean
  /**
   * Gift delivery: code, photo and position are all required together
   * (`CODE_AND_PHOTO`). Gift orders are never paid in cash.
   */
  requiresGiftProof?: boolean
  /** Name of the relative receiving the basket, for the instructions. */
  recipientName?: string | null
  /**
   * « La Valise du pays » collection: the parcel ends at the eBio hub and
   * closes with the hub's 6-digit code only, never a photo.
   */
  isCollection?: boolean
  onComplete: (body: Record<string, unknown>) => Promise<CompleteResult>
  onDone: () => void
}

/** A last known fix older than this is not trusted as the handover point. */
const LAST_KNOWN_MAX_AGE_MS = 2 * 60 * 1000

interface Fix { latitude: number, longitude: number }

/** Current position, or the last known one when it is under two minutes old. */
async function readHandoverPosition(): Promise<Fix | null> {
  const permission = await Location.requestForegroundPermissionsAsync()
  if (permission.status !== 'granted') {
    return null
  }
  try {
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
    return { latitude: position.coords.latitude, longitude: position.coords.longitude }
  }
  catch {
    const last = await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS }).catch(() => null)
    if (last && Date.now() - last.timestamp <= LAST_KNOWN_MAX_AGE_MS) {
      return { latitude: last.coords.latitude, longitude: last.coords.longitude }
    }
    return null
  }
}

/** « 10 h 42 » */
function formatHour(iso: string): string {
  const date = new Date(iso)
  return `${date.getHours()} h ${String(date.getMinutes()).padStart(2, '0')}`
}

interface GiftProofFormProps {
  recipientName: string | null
  onComplete: (body: Record<string, unknown>) => Promise<CompleteResult>
  onDone: () => void
}

/**
 * Gift handover: the recipient's code, a photo of the basket in their hands
 * and the position, sent together. The photo's time is the handover time.
 */
function GiftProofForm({ recipientName, onComplete, onDone }: GiftProofFormProps) {
  const { semantic } = useTheme()
  const [code, setCode] = useState('')
  const [photo, setPhoto] = useState<{ mediaId: string, takenAt: string } | null>(null)
  const [fix, setFix] = useState<Fix | null>(null)
  const [locating, setLocating] = useState(false)
  const [locateFailed, setLocateFailed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { takePhotoAndUpload, uploading } = useMediaUpload({ context: 'DELIVERY_PROOF' })
  const who = recipientName?.trim().split(/\s+/)[0] ?? 'le destinataire'

  const locate = useCallback(async () => {
    setLocating(true)
    setLocateFailed(false)
    const found = await readHandoverPosition().catch(() => null)
    setLocating(false)
    if (found) {
      setFix(found)
    }
    else {
      setLocateFailed(true)
    }
  }, [])

  useEffect(() => {
    void locate()
  }, [locate])

  async function takePhoto() {
    const uploaded = await takePhotoAndUpload()
    if (!uploaded) {
      return
    }
    setPhoto({ mediaId: uploaded.mediaId, takenAt: new Date().toISOString() })
    // The position that counts is the one at the door: read it again now.
    void locate()
  }

  const codeComplete = /^\d{4}$/.test(code)
  const ready = codeComplete && photo !== null && fix !== null
  const busy = submitting || uploading

  async function submit() {
    if (!ready || !photo || !fix) {
      return
    }
    setSubmitting(true)
    const result = await onComplete({
      proofType: 'CODE_AND_PHOTO',
      code,
      mediaId: photo.mediaId,
      latitude: fix.latitude,
      longitude: fix.longitude,
      occurredAt: photo.takenAt,
    })
    setSubmitting(false)
    if (result.ok) {
      onDone()
    }
    else if (result.queued) {
      appAlert('Hors connexion', 'La remise sera confirmée dès le retour du réseau.')
      onDone()
    }
    else if (result.errorCode === 'GIFT_PROOF_REQUIRED') {
      appAlert('Preuve incomplète', 'Pour un panier offert, le code, la photo et la position sont tous les trois nécessaires.')
    }
    else {
      appAlert('Remise refusée', result.errorMessage ?? `Le code ne correspond pas. Vérifiez-le avec ${who}.`)
    }
  }

  return (
    <>
      <Text style={[styles.subtitle, { color: semantic.textSecondary }]}>
        {`Panier offert : demandez à ${who} le code à 4 chiffres reçu par SMS, puis photographiez le panier remis.`}
      </Text>

      <Text style={[styles.fieldLabel, { color: semantic.textSecondary }]}>1. Code de remise</Text>
      <TextInput
        style={[styles.codeInput, { backgroundColor: semantic.bgCard, color: semantic.textPrimary, borderColor: semantic.borderNormal }]}
        value={code}
        onChangeText={value => setCode(value.replace(/\D/g, '').slice(0, 4))}
        keyboardType="number-pad"
        maxLength={4}
        placeholder="0000"
        placeholderTextColor={semantic.textTertiary}
        accessibilityLabel="Code de remise à 4 chiffres"
      />

      <Text style={[styles.fieldLabel, { color: semantic.textSecondary }]}>2. Photo de la remise</Text>
      <Pressable
        style={[styles.secondary, { borderColor: photo ? colors.green[400] : semantic.borderNormal }, busy && styles.disabled]}
        onPress={() => {
          void takePhoto()
        }}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={photo ? 'Reprendre la photo de la remise' : 'Photographier la remise du panier'}
      >
        {uploading
          ? <ActivityIndicator size="small" color={colors.green[400]} />
          : (
              <View style={styles.secondaryContent}>
                {photo
                  ? <CircleCheck size={18} color={colors.green[600]} strokeWidth={2} />
                  : <Camera size={18} color={semantic.textPrimary} strokeWidth={2} />}
                <Text style={[styles.secondaryText, { color: semantic.textPrimary }]}>
                  {photo ? `Photo prise à ${formatHour(photo.takenAt)} · Reprendre` : 'Photographier la remise'}
                </Text>
              </View>
            )}
      </Pressable>

      <Text style={[styles.fieldLabel, { color: semantic.textSecondary }]}>3. Position</Text>
      <View style={styles.positionRow}>
        {locating
          ? <ActivityIndicator size="small" color={colors.green[400]} />
          : fix
            ? <CircleCheck size={18} color={colors.green[600]} strokeWidth={2} />
            : <MapPin size={18} color={colors.coral[600]} strokeWidth={2} />}
        <Text style={[styles.positionText, { color: fix ? semantic.textPrimary : semantic.textSecondary }]}>
          {locating
            ? 'Lecture de votre position…'
            : fix
              ? 'Position enregistrée'
              : locateFailed
                ? 'Position introuvable : activez la localisation.'
                : 'Position en attente'}
        </Text>
        {locateFailed && !locating && (
          <Pressable
            style={[styles.retryButton, { borderColor: semantic.borderNormal }]}
            onPress={() => {
              void locate()
            }}
            accessibilityRole="button"
            accessibilityLabel="Relire ma position"
          >
            <Text style={[styles.secondaryText, { color: semantic.textPrimary }]}>Réessayer</Text>
          </Pressable>
        )}
      </View>

      <Pressable
        style={[styles.primary, (!ready || busy) && styles.disabled]}
        onPress={() => {
          void submit()
        }}
        disabled={!ready || busy}
        accessibilityRole="button"
        accessibilityLabel="Valider la remise"
        accessibilityState={{ disabled: !ready || busy }}
      >
        {submitting
          ? <ActivityIndicator size="small" color={colors.neutral[0]} />
          : <Text style={styles.primaryText}>Valider</Text>}
      </Pressable>
      {!ready && (
        <Text style={[styles.note, { color: semantic.textTertiary }]}>
          Le code, la photo et la position sont nécessaires pour valider.
        </Text>
      )}
    </>
  )
}

interface HubCodeFormProps {
  onComplete: (body: Record<string, unknown>) => Promise<CompleteResult>
  onDone: () => void
}

const HUB_CODE_PATTERN = new RegExp(`^\\d{${HUB_CODE_LENGTH}}$`)

/**
 * Drop-off at the eBio hub: the staff read a 6-digit code from the back
 * office once the parcel is in their hands. No photo: the code is the proof.
 */
function HubCodeForm({ onComplete, onDone }: HubCodeFormProps) {
  const { semantic } = useTheme()
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const complete = HUB_CODE_PATTERN.test(code)

  async function submit() {
    if (!complete) {
      setError(`Saisissez les ${HUB_CODE_LENGTH} chiffres donnés par l’équipe eBio.`)
      return
    }
    setSubmitting(true)
    setError(null)
    const result = await onComplete({ proofType: 'CODE', code })
    setSubmitting(false)
    if (result.ok) {
      appAlert('Colis remis', 'Colis remis au point eBio, votre gain est crédité.')
      onDone()
    }
    else if (result.queued) {
      appAlert('Hors connexion', 'Le dépôt sera confirmé dès le retour du réseau.')
      onDone()
    }
    else if (result.status === 422 && result.errorCode !== 'EXPORT_HUB_CODE_REQUIRED') {
      setError('Ce code ne correspond pas. Demandez-le à nouveau à l’équipe eBio du point de regroupement.')
    }
    else {
      setError(result.errorMessage ?? 'Le dépôt n’a pas pu être confirmé. Réessayez.')
    }
  }

  return (
    <>
      <Text style={[styles.subtitle, { color: semantic.textSecondary }]}>
        Remettez le colis à l’équipe eBio, puis saisissez le code qu’elle vous donne.
      </Text>
      <Text style={[styles.fieldLabel, { color: semantic.textSecondary }]}>
        Code du point de regroupement, donné par l’équipe eBio
      </Text>
      <TextInput
        style={[
          styles.codeInput,
          { backgroundColor: semantic.bgCard, color: semantic.textPrimary, borderColor: error ? colors.coral[600] : semantic.borderNormal },
        ]}
        value={code}
        onChangeText={(value) => {
          setCode(value.replace(/\D/g, '').slice(0, HUB_CODE_LENGTH))
          setError(null)
        }}
        keyboardType="number-pad"
        maxLength={HUB_CODE_LENGTH}
        placeholder="000000"
        placeholderTextColor={semantic.textTertiary}
        accessibilityLabel={`Code du point de regroupement à ${HUB_CODE_LENGTH} chiffres`}
        onSubmitEditing={() => {
          void submit()
        }}
      />
      {error
        ? (
            <Text style={[styles.error, { color: colors.coral[600] }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
              {error}
            </Text>
          )
        : null}
      <Pressable
        style={[styles.primary, (submitting || !complete) && styles.disabled]}
        onPress={() => {
          void submit()
        }}
        disabled={submitting}
        accessibilityRole="button"
        accessibilityLabel="Valider le dépôt au point eBio"
        accessibilityState={{ disabled: submitting || !complete, busy: submitting }}
      >
        {submitting
          ? <ActivityIndicator size="small" color={colors.neutral[0]} />
          : <Text style={styles.primaryText}>Valider le dépôt</Text>}
      </Pressable>
    </>
  )
}

/**
 * Proof of delivery. Nominal path: the 4-digit code the buyer received at
 * pickup. Fallback: a photo of the handed-over package (absent customer, etc.).
 */
export function ProofScreen({ isCash = false, requiresGiftProof = false, recipientName = null, isCollection = false, onComplete, onDone }: ProofScreenProps) {
  const { semantic } = useTheme()
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { takePhotoAndUpload, uploading } = useMediaUpload({ context: 'DELIVERY_PROOF' })

  async function submitCode() {
    if (!BUYER_CODE_PATTERN.test(code)) {
      appAlert('Code incomplet', 'Saisissez le code communiqué au client (4 chiffres).')
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
        <Text style={[styles.title, { color: semantic.textPrimary }]}>{isCollection ? 'Dépôt au point eBio' : 'Preuve de livraison'}</Text>
        {isCollection
          ? <HubCodeForm onComplete={onComplete} onDone={onDone} />
          : requiresGiftProof
            ? <GiftProofForm recipientName={recipientName} onComplete={onComplete} onDone={onDone} />
            : (
                <ProofCodeOrPhoto
                  isCash={isCash}
                  code={code}
                  setCode={setCode}
                  submitting={submitting}
                  uploading={uploading}
                  submitCode={submitCode}
                  submitPhoto={submitPhoto}
                />
              )}
      </ScrollView>
    </KeyboardAwareView>
  )
}

interface ProofCodeOrPhotoProps {
  isCash: boolean
  code: string
  setCode: (code: string) => void
  submitting: boolean
  uploading: boolean
  submitCode: () => void
  submitPhoto: () => void
}

/** The ordinary proof: the buyer's code, or a photo when the code cannot be had. */
function ProofCodeOrPhoto({ isCash, code, setCode, submitting, uploading, submitCode, submitPhoto }: ProofCodeOrPhotoProps) {
  const { semantic } = useTheme()
  return (
    <>
      <Text style={[styles.subtitle, { color: semantic.textSecondary }]}>
        Demandez au client le code à 4 chiffres reçu dans son application.
      </Text>
      {isCash
        ? (
            <View style={styles.cashNote} accessibilityRole="alert">
              <Banknote size={18} color={colors.earth[800]} strokeWidth={2.2} />
              <Text style={styles.cashNoteText}>
                Commande en espèces : saisissez le code du client après encaissement.
              </Text>
            </View>
          )
        : null}

      <TextInput
        style={[styles.codeInput, { backgroundColor: semantic.bgCard, color: semantic.textPrimary, borderColor: semantic.borderNormal }]}
        value={code}
        onChangeText={value => setCode(value.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        maxLength={6}
        placeholder="0000"
        placeholderTextColor={semantic.textTertiary}
        accessibilityLabel="Code de confirmation du client"
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

      {isCash
        ? null
        : (
            <>
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
            </>
          )}
    </>
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
  cashNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    backgroundColor: colors.earth[50],
    borderWidth: 1,
    borderColor: colors.earth[200],
    borderRadius: radius.md,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    marginBottom: spacing[4],
  },
  cashNoteText: {
    ...typography.bodyS,
    flex: 1,
    color: colors.earth[800],
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
  fieldLabel: {
    ...typography.caption,
    marginTop: spacing[4],
    marginBottom: spacing[2],
  },
  positionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    minHeight: 44,
  },
  positionText: {
    ...typography.bodyS,
    flex: 1,
  },
  retryButton: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    justifyContent: 'center',
  },
  error: {
    ...typography.bodyS,
    marginTop: spacing[2],
  },
  note: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing[3],
  },
})
