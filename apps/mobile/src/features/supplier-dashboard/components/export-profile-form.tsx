import type { ExportProfile } from '../utils/terroir-export'
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs'
import Globe from 'lucide-react-native/dist/esm/icons/globe'
import Info from 'lucide-react-native/dist/esm/icons/info'
import { use, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Image,
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
import { KeyboardAwareView } from '../../common/components/keyboard-aware-view'
import { ScreenHeader } from '../../common/components/screen-header'
import { parsePositiveInt, readExportError, resolveSupplierId } from '../utils/terroir-export'
import { ExportPhotoPicker } from './export-photo-picker'
import { ExportStatusBadge } from './export-status-badge'

const MAX_ORIGIN_PHOTOS = 3
const PRODUCER_MAX = 120
const PLACE_MAX = 120
const METHOD_MAX = 300

interface ProductHeader {
  name: string
  photo: string | null
}

/** Reads the untyped `exportProfile` of a product or a PUT response; null when absent. */
function parseProfile(raw: unknown): ExportProfile | null {
  if (!raw || typeof raw !== 'object')
    return null
  const data = raw as Record<string, unknown>
  const status = data.status
  if (status !== 'PENDING' && status !== 'APPROVED' && status !== 'REJECTED')
    return null
  const origin = (data.origin && typeof data.origin === 'object' ? data.origin : {}) as Record<string, unknown>
  const asText = (value: unknown): string | null => typeof value === 'string' && value !== '' ? value : null
  const asNumber = (value: unknown): number | null => typeof value === 'number' ? value : null
  return {
    status,
    rejectionReason: asText(data.rejectionReason),
    packedWeightG: asNumber(data.packedWeightG) ?? 0,
    lengthCm: asNumber(data.lengthCm),
    widthCm: asNumber(data.widthCm),
    heightCm: asNumber(data.heightCm),
    shelfLifeDays: asNumber(data.shelfLifeDays) ?? 0,
    origin: {
      producer: asText(origin.producer),
      place: asText(origin.place),
      year: asNumber(origin.year),
      method: asText(origin.method),
      photos: Array.isArray(origin.photos) ? origin.photos.filter((p): p is string => typeof p === 'string') : [],
    },
    labelPhoto: asText(data.labelPhoto),
  }
}

function numberText(value: number | null | undefined): string {
  return value != null && value > 0 ? String(value) : ''
}

function digitsOnly(text: string, maxLength: number): string {
  return text.replace(/\D/g, '').slice(0, maxLength)
}

interface ExportProfileFormProps {
  productId: string
  onGoBack: () => void
  /** Called after the profile was sent or withdrawn. */
  onDone: () => void
}

/**
 * « Vendre à l'étranger » for one product: packed weight, size, shelf life,
 * origin and the label photo eBio checks before allowing it abroad. Shows
 * eBio's verdict; any change sends the product back to validation.
 */
export function ExportProfileForm({ productId, onGoBack, onDone }: ExportProfileFormProps) {
  const { semantic } = useTheme()
  const tabBarHeight = use(BottomTabBarHeightContext) ?? 0

  const [isLoading, setIsLoading] = useState(true)
  const [product, setProduct] = useState<ProductHeader | null>(null)
  const [profile, setProfile] = useState<ExportProfile | null>(null)

  const [weight, setWeight] = useState('')
  const [length, setLength] = useState('')
  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')
  const [shelfLife, setShelfLife] = useState('')
  const [producer, setProducer] = useState('')
  const [place, setPlace] = useState('')
  const [year, setYear] = useState('')
  const [method, setMethod] = useState('')
  const [originPhotos, setOriginPhotos] = useState<string[]>([])
  const [labelPhoto, setLabelPhoto] = useState<string | null>(null)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isWithdrawing, setIsWithdrawing] = useState(false)

  function fillFrom(next: ExportProfile): void {
    setWeight(numberText(next.packedWeightG))
    setLength(numberText(next.lengthCm))
    setWidth(numberText(next.widthCm))
    setHeight(numberText(next.heightCm))
    setShelfLife(numberText(next.shelfLifeDays))
    setProducer(next.origin.producer ?? '')
    setPlace(next.origin.place ?? '')
    setYear(numberText(next.origin.year))
    setMethod(next.origin.method ?? '')
    setOriginPhotos(next.origin.photos.slice(0, MAX_ORIGIN_PHOTOS))
    setLabelPhoto(next.labelPhoto)
  }

  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      try {
        const res = await apiFetch(`/api/products/${productId}`)
        if (!res.ok || cancelled)
          return
        const data = await res.json() as Record<string, unknown>
        const photos = Array.isArray(data.photos) ? data.photos as string[] : []
        setProduct({ name: String(data.name ?? ''), photo: photos[0] ?? null })
        const existing = parseProfile(data.exportProfile)
        if (existing) {
          setProfile(existing)
          fillFrom(existing)
        }
      }
      catch {
        // the form still opens empty; saving reports the network error
      }
      finally {
        if (!cancelled)
          setIsLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [productId])

  const currentYear = new Date().getFullYear()
  const weightValue = parsePositiveInt(weight)
  const shelfLifeValue = parsePositiveInt(shelfLife)
  const yearValue = year.trim() === '' ? null : Number(year)
  const yearValid = yearValue === null || (yearValue >= 1950 && yearValue <= currentYear)
  const dimensionsValid = [length, width, height].every(v => v.trim() === '' || parsePositiveInt(v) !== null)
  const isValid = weightValue !== null
    && shelfLifeValue !== null
    && yearValid
    && dimensionsValid
    && labelPhoto !== null

  async function submit(): Promise<void> {
    if (!isValid || weightValue === null || shelfLifeValue === null || !labelPhoto)
      return
    setIsSubmitting(true)
    try {
      const supplierId = await resolveSupplierId()
      if (!supplierId) {
        appAlert('Envoi impossible', 'Votre boutique est introuvable. Réessayez dans un instant.')
        return
      }
      const origin: Record<string, unknown> = { photos: originPhotos }
      if (producer.trim())
        origin.producer = producer.trim()
      if (place.trim())
        origin.place = place.trim()
      if (yearValue !== null)
        origin.year = yearValue
      if (method.trim())
        origin.method = method.trim()
      const body: Record<string, unknown> = {
        packedWeightG: weightValue,
        shelfLifeDays: shelfLifeValue,
        origin,
        labelPhoto,
      }
      const lengthValue = parsePositiveInt(length)
      const widthValue = parsePositiveInt(width)
      const heightValue = parsePositiveInt(height)
      if (lengthValue !== null)
        body.lengthCm = lengthValue
      if (widthValue !== null)
        body.widthCm = widthValue
      if (heightValue !== null)
        body.heightCm = heightValue

      const res = await apiFetch(`/api/suppliers/${supplierId}/products/${productId}/export`, {
        method: 'PUT',
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        appAlert('Demande refusée', await readExportError(res))
        return
      }
      const saved = parseProfile(await res.json().catch(() => null))
      if (saved) {
        setProfile(saved)
        fillFrom(saved)
      }
      if (saved?.status === 'APPROVED') {
        appAlert('Modifications enregistrées', 'Votre produit reste proposé à l\'étranger.')
      }
      else {
        appAlert('Demande envoyée', 'eBio vérifie votre produit et son étiquette. Vous serez prévenu dès qu\'il est validé pour l\'export.')
      }
      onDone()
    }
    catch {
      appAlert('Envoi impossible', 'Vérifiez votre connexion et réessayez.')
    }
    finally {
      setIsSubmitting(false)
    }
  }

  async function withdraw(): Promise<void> {
    setIsWithdrawing(true)
    try {
      const supplierId = await resolveSupplierId()
      if (!supplierId) {
        appAlert('Retrait impossible', 'Votre boutique est introuvable. Réessayez dans un instant.')
        return
      }
      const res = await apiFetch(`/api/suppliers/${supplierId}/products/${productId}/export`, { method: 'DELETE' })
      if (!res.ok) {
        appAlert('Retrait impossible', await readExportError(res))
        return
      }
      setProfile(null)
      onDone()
    }
    catch {
      appAlert('Retrait impossible', 'Vérifiez votre connexion et réessayez.')
    }
    finally {
      setIsWithdrawing(false)
    }
  }

  function confirmWithdraw(): void {
    appAlert(
      'Ne plus vendre à l\'étranger ?',
      'Le produit ne sera plus proposé aux clients à l\'étranger, et les packs qui le contiennent ne pourront plus être commandés. Il reste en vente au Bénin.',
      [
        { text: 'Retirer de l\'export', style: 'destructive', onPress: withdraw },
        { text: 'Annuler', style: 'cancel' },
      ],
    )
  }

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: semantic.bgPage }]}>
        <ActivityIndicator size="large" color={colors.green[400]} />
      </View>
    )
  }

  const inputStyle = [styles.input, { color: semantic.textPrimary, backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }]

  return (
    <KeyboardAwareView style={[styles.container, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader title="Vendre à l'étranger" subtitle={product?.name} onBack={onGoBack} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + spacing[10] }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Product + verdict */}
        <View style={[styles.card, { backgroundColor: semantic.bgCard }]}>
          <View style={styles.productRow}>
            {product?.photo
              ? <Image source={{ uri: product.photo }} style={styles.productThumb} resizeMode="contain" />
              : (
                  <View style={[styles.productThumb, styles.productThumbEmpty]}>
                    <Globe size={18} color={colors.green[600]} />
                  </View>
                )}
            <View style={styles.productText}>
              <Text style={[styles.productName, { color: semantic.textPrimary }]} numberOfLines={2}>
                {product?.name ?? 'Produit'}
              </Text>
              {profile
                ? <ExportStatusBadge status={profile.status} />
                : (
                    <Text style={[styles.helper, { color: semantic.textSecondary }]}>
                      Pas encore proposé à l'étranger
                    </Text>
                  )}
            </View>
          </View>
          {profile?.status === 'REJECTED' && profile.rejectionReason
            ? (
                <View style={[styles.reason, { backgroundColor: colors.coral[50] }]}>
                  <Text style={[styles.reasonTitle, { color: colors.coral[800] }]}>Motif du refus</Text>
                  <Text style={[styles.reasonText, { color: colors.coral[800] }]}>{profile.rejectionReason}</Text>
                </View>
              )
            : null}
          <Text style={[styles.helper, { color: semantic.textSecondary }]}>
            {profile
              ? 'Modifier le poids, la composition ou l\'étiquette renvoie le produit en validation : il n\'est plus proposé à l\'étranger jusqu\'à l\'accord d\'eBio.'
              : 'Votre produit sera proposé aux clients des pays desservis une fois validé par eBio.'}
          </Text>
        </View>

        {/* Parcel */}
        <Text style={[styles.sectionTitle, { color: semantic.textTertiary }]}>COLIS</Text>
        <Text style={[styles.label, { color: semantic.textSecondary }]}>Poids emballé (g)</Text>
        <TextInput
          style={inputStyle}
          keyboardType="number-pad"
          value={weight}
          onChangeText={text => setWeight(digitsOnly(text, 6))}
          placeholder="Ex. 450"
          placeholderTextColor={semantic.textTertiary}
          accessibilityLabel="Poids emballé en grammes"
        />
        <Text style={[styles.helper, { color: semantic.textTertiary }]}>
          Produit dans son emballage de voyage : c'est ce poids qui sert au calcul du transport.
        </Text>

        <Text style={[styles.label, { color: semantic.textSecondary }]}>Dimensions (cm, facultatif)</Text>
        <View style={styles.dimensionsRow}>
          <View style={styles.dimension}>
            <Text style={[styles.dimensionLabel, { color: semantic.textTertiary }]}>Longueur</Text>
            <TextInput
              style={inputStyle}
              keyboardType="number-pad"
              value={length}
              onChangeText={text => setLength(digitsOnly(text, 3))}
              accessibilityLabel="Longueur en centimètres"
            />
          </View>
          <View style={styles.dimension}>
            <Text style={[styles.dimensionLabel, { color: semantic.textTertiary }]}>Largeur</Text>
            <TextInput
              style={inputStyle}
              keyboardType="number-pad"
              value={width}
              onChangeText={text => setWidth(digitsOnly(text, 3))}
              accessibilityLabel="Largeur en centimètres"
            />
          </View>
          <View style={styles.dimension}>
            <Text style={[styles.dimensionLabel, { color: semantic.textTertiary }]}>Hauteur</Text>
            <TextInput
              style={inputStyle}
              keyboardType="number-pad"
              value={height}
              onChangeText={text => setHeight(digitsOnly(text, 3))}
              accessibilityLabel="Hauteur en centimètres"
            />
          </View>
        </View>

        <Text style={[styles.label, { color: semantic.textSecondary }]}>Durée de conservation (jours)</Text>
        <TextInput
          style={inputStyle}
          keyboardType="number-pad"
          value={shelfLife}
          onChangeText={text => setShelfLife(digitsOnly(text, 4))}
          placeholder="Ex. 180"
          placeholderTextColor={semantic.textTertiary}
          accessibilityLabel="Durée de conservation en jours"
        />
        <Text style={[styles.helper, { color: semantic.textTertiary }]}>
          Le voyage dure plusieurs semaines : le produit doit rester bon bien après son arrivée.
        </Text>

        {/* Origin */}
        <Text style={[styles.sectionTitle, { color: semantic.textTertiary }]}>ORIGINE</Text>
        <Text style={[styles.helper, styles.sectionLead, { color: semantic.textSecondary }]}>
          Facultatif, mais c'est ce qui donne le badge « Validé Valise du pays » : renseignez au moins le producteur ou le lieu.
        </Text>
        <Text style={[styles.label, { color: semantic.textSecondary }]}>Producteur ou coopérative</Text>
        <TextInput
          style={inputStyle}
          value={producer}
          onChangeText={setProducer}
          maxLength={PRODUCER_MAX}
          placeholder="Ex. Coopérative des femmes de Djougou"
          placeholderTextColor={semantic.textTertiary}
          accessibilityLabel="Producteur ou coopérative"
        />

        <Text style={[styles.label, { color: semantic.textSecondary }]}>Commune / région</Text>
        <TextInput
          style={inputStyle}
          value={place}
          onChangeText={setPlace}
          maxLength={PLACE_MAX}
          placeholder="Ex. Djougou, Donga"
          placeholderTextColor={semantic.textTertiary}
          accessibilityLabel="Commune ou région"
        />

        <Text style={[styles.label, { color: semantic.textSecondary }]}>Année de récolte ou de fabrication</Text>
        <TextInput
          style={[...inputStyle, styles.yearInput]}
          keyboardType="number-pad"
          value={year}
          onChangeText={text => setYear(digitsOnly(text, 4))}
          placeholder={String(currentYear)}
          placeholderTextColor={semantic.textTertiary}
          accessibilityLabel="Année de récolte ou de fabrication"
        />
        {!yearValid
          ? (
              <Text style={[styles.helper, { color: colors.coral[600] }]}>
                {`Saisissez une année entre 1950 et ${currentYear}.`}
              </Text>
            )
          : null}

        <Text style={[styles.label, { color: semantic.textSecondary }]}>Mode de fabrication</Text>
        <TextInput
          style={[...inputStyle, styles.multiline]}
          value={method}
          onChangeText={setMethod}
          maxLength={METHOD_MAX}
          multiline
          textAlignVertical="top"
          placeholder="Ex. Beurre extrait à la main, sans additif"
          placeholderTextColor={semantic.textTertiary}
          accessibilityLabel="Mode de fabrication"
        />

        <Text style={[styles.label, { color: semantic.textSecondary }]}>{`Photos d'origine (jusqu'à ${MAX_ORIGIN_PHOTOS})`}</Text>
        <ExportPhotoPicker
          photos={originPhotos}
          onChange={setOriginPhotos}
          max={MAX_ORIGIN_PHOTOS}
          noun="photo d'origine"
        />
        <Text style={[styles.helper, { color: semantic.textTertiary }]}>
          L'atelier, le champ, les mains qui fabriquent : ce que le client ne voit pas en épicerie.
        </Text>

        {/* Label */}
        <Text style={[styles.sectionTitle, { color: semantic.textTertiary }]}>ÉTIQUETTE</Text>
        <Text style={[styles.label, { color: semantic.textSecondary }]}>Photo de l'étiquette (obligatoire)</Text>
        <ExportPhotoPicker
          photos={labelPhoto ? [labelPhoto] : []}
          onChange={photos => setLabelPhoto(photos[0] ?? null)}
          max={1}
          noun="photo de l'étiquette"
        />
        <View style={[styles.note, { backgroundColor: colors.blue[50] }]}>
          <Info size={16} color={colors.blue[800]} />
          <Text style={[styles.noteText, { color: colors.blue[800] }]}>
            Contrôle eBio : sur l'étiquette, nous vérifions la langue française, les allergènes et les dates de fabrication et de péremption avant d'autoriser l'envoi. La photo sert aussi de preuve en cas de contrôle à l'arrivée.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.submitButton, (!isValid || isSubmitting) && styles.disabled]}
          disabled={!isValid || isSubmitting}
          onPress={submit}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityState={{ disabled: !isValid || isSubmitting }}
        >
          {isSubmitting
            ? <ActivityIndicator size="small" color={colors.neutral[0]} />
            : <Text style={styles.submitButtonText}>{profile ? 'Enregistrer et renvoyer en validation' : 'Envoyer pour validation'}</Text>}
        </TouchableOpacity>
        {!isValid
          ? (
              <Text style={[styles.helper, styles.centered, { color: semantic.textTertiary }]}>
                Poids emballé, durée de conservation et photo de l'étiquette sont nécessaires.
              </Text>
            )
          : null}

        {profile
          ? (
              <TouchableOpacity
                style={[styles.withdrawButton, isWithdrawing && styles.disabled]}
                onPress={confirmWithdraw}
                disabled={isWithdrawing}
                activeOpacity={0.8}
                accessibilityRole="button"
              >
                {isWithdrawing
                  ? <ActivityIndicator size="small" color={colors.coral[600]} />
                  : <Text style={styles.withdrawButtonText}>Ne plus vendre à l'étranger</Text>}
              </TouchableOpacity>
            )
          : null}
      </ScrollView>
    </KeyboardAwareView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: spacing[4], paddingTop: spacing[2] },

  card: { borderRadius: radius.lg, padding: spacing[4], gap: spacing[3] },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  productThumb: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.neutral[100] },
  productThumbEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.green[50] },
  productText: { flex: 1, gap: spacing[1] },
  productName: { ...typography.h3 },
  reason: { borderRadius: radius.md, padding: spacing[3], gap: spacing[1] },
  reasonTitle: { ...typography.caption, fontFamily: fonts.sansSb },
  reasonText: { ...typography.bodyS },

  sectionTitle: { ...typography.overline, marginTop: spacing[6] },
  sectionLead: { marginTop: spacing[2] },
  label: { ...typography.caption, marginTop: spacing[4], marginBottom: spacing[2] },
  helper: { ...typography.caption, marginTop: spacing[1] },
  centered: { textAlign: 'center', marginTop: spacing[2] },

  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    ...typography.bodyL,
  },
  yearInput: { width: 120 },
  multiline: { minHeight: 96 },
  dimensionsRow: { flexDirection: 'row', gap: spacing[2] },
  dimension: { flex: 1, gap: spacing[1] },
  dimensionLabel: { ...typography.caption },

  note: {
    flexDirection: 'row',
    gap: spacing[2],
    borderRadius: radius.md,
    padding: spacing[3],
    marginTop: spacing[3],
  },
  noteText: { ...typography.bodyS, flex: 1 },

  submitButton: {
    marginTop: spacing[6],
    minHeight: 48,
    backgroundColor: colors.green[400],
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
  },
  submitButtonText: { ...typography.h3, color: colors.neutral[0], textAlign: 'center' },
  withdrawButton: {
    marginTop: spacing[3],
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.coral[200],
    backgroundColor: colors.coral[50],
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[3],
  },
  withdrawButtonText: { ...typography.h3, color: colors.coral[600] },
  disabled: { opacity: 0.5 },
})
