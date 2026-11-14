import type { ExportCriteriaGuide, ExportCriterion, ExportProfile, ExportStorage, ProfileDraftFacts } from '../utils/terroir-export'
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs'
import { useFocusEffect } from '@react-navigation/native'
import BookOpen from 'lucide-react-native/dist/esm/icons/book-open'
import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right'
import CircleX from 'lucide-react-native/dist/esm/icons/circle-x'
import Globe from 'lucide-react-native/dist/esm/icons/globe'
import Info from 'lucide-react-native/dist/esm/icons/info'
import Snowflake from 'lucide-react-native/dist/esm/icons/snowflake'
import Sun from 'lucide-react-native/dist/esm/icons/sun'
import Thermometer from 'lucide-react-native/dist/esm/icons/thermometer'
import { use, useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Switch,
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
import {
  computeProfileCriteria,
  formatWeight,
  loadExportCriteriaGuide,
  missingLabel,
  parseExportProfile,
  parsePositiveInt,
  readExportError,
  resolveSupplierId,
} from '../utils/terroir-export'
import { ExportCriteriaList } from './export-criteria-list'
import { ExportPhotoPicker } from './export-photo-picker'
import { ExportStatusBadge } from './export-status-badge'

const MAX_ORIGIN_PHOTOS = 3
const PRODUCER_MAX = 120
const PLACE_MAX = 120
const METHOD_MAX = 300
const ALLERGENS_MAX = 500

/** Where each criterion is fixed in the form; absent keys live on the product sheet. */
type Anchor = 'weight' | 'shelf' | 'storage' | 'allergens' | 'origin' | 'label' | 'declarations'

const CRITERION_ANCHORS: Record<string, Anchor> = {
  shelf_life: 'shelf',
  storage_ambient: 'storage',
  packed_weight: 'weight',
  allergens: 'allergens',
  origin: 'origin',
  label_photo: 'label',
  french_label: 'declarations',
  dates_printed: 'declarations',
  sealed_packaging: 'declarations',
}

const STORAGE_OPTIONS: Array<{ value: ExportStorage, label: string, Icon: typeof Sun }> = [
  { value: 'AMBIENT', label: 'Température ambiante', Icon: Sun },
  { value: 'COOL', label: 'Au frais', Icon: Thermometer },
  { value: 'FROZEN', label: 'Congelé', Icon: Snowflake },
]

/** What the form reads from the product sheet: the header and the facts the criteria check. */
interface ProductFacts {
  name: string
  photo: string | null
  categoryName: string | null
  ingredients: string | null
  allergens: string[]
}

function numberText(value: number | null | undefined): string {
  return value != null && value > 0 ? String(value) : ''
}

function digitsOnly(text: string, maxLength: number): string {
  return text.replace(/\D/g, '').slice(0, maxLength)
}

/** The criteria facts of a saved profile, built in the same key order as the live draft. */
function draftFactsOf(profile: ExportProfile, product: ProductFacts | null): ProfileDraftFacts {
  return {
    categoryName: product?.categoryName ?? null,
    ingredients: product?.ingredients ?? null,
    productAllergens: product?.allergens ?? [],
    packedWeightG: parsePositiveInt(numberText(profile.packedWeightG)),
    shelfLifeDays: parsePositiveInt(numberText(profile.shelfLifeDays)),
    storage: profile.storage,
    allergens: profile.allergens ?? '',
    noAllergens: profile.noAllergens,
    producer: profile.origin.producer ?? '',
    place: profile.origin.place ?? '',
    labelPhoto: profile.labelPhoto,
    declaresFrenchLabel: profile.declaresFrenchLabel,
    declaresDatesPrinted: profile.declaresDatesPrinted,
    declaresSealedPackaging: profile.declaresSealedPackaging,
  }
}

async function fetchProduct(productId: string): Promise<{ facts: ProductFacts, profile: ExportProfile | null } | null> {
  const res = await apiFetch(`/api/products/${productId}`)
  if (!res.ok)
    return null
  const data = await res.json() as Record<string, unknown>
  const photos = Array.isArray(data.photos) ? data.photos as string[] : []
  return {
    facts: {
      name: String(data.name ?? ''),
      photo: photos[0] ?? null,
      categoryName: typeof data.categoryName === 'string' ? data.categoryName : null,
      ingredients: typeof data.ingredients === 'string' ? data.ingredients : null,
      allergens: Array.isArray(data.allergens) ? (data.allergens as unknown[]).filter((a): a is string => typeof a === 'string') : [],
    },
    profile: parseExportProfile(data.exportProfile),
  }
}

interface DeclarationRowProps {
  label: string
  value: boolean
  onChange: (value: boolean) => void
}

function DeclarationRow({ label, value, onChange }: DeclarationRowProps) {
  const { semantic } = useTheme()
  return (
    <View style={styles.switchRow}>
      <Text style={[styles.switchLabel, { color: semantic.textPrimary }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.neutral[200], true: colors.green[200] }}
        thumbColor={value ? colors.green[400] : colors.neutral[400]}
        accessibilityLabel={label}
      />
    </View>
  )
}

interface ExportProfileFormProps {
  productId: string
  onGoBack: () => void
  /** Called once the product is exportable after a save, or after it left the export. */
  onDone: () => void
  /** Opens « Vendre à l’étranger : le guide ». */
  onOpenGuide?: () => void
  /** Opens the product sheet, where the ingredients and the category are set. */
  onEditProduct?: () => void
}

/**
 * « Vendre à l’étranger » for one product. The product becomes exportable on
 * its own as soon as every criterion is met: the list at the top shows what
 * is missing while the shop types, and the server confirms it on save. eBio
 * may withdraw a product; its reason is shown and only eBio reinstates it.
 */
export function ExportProfileForm({ productId, onGoBack, onDone, onOpenGuide, onEditProduct }: ExportProfileFormProps) {
  const { semantic } = useTheme()
  const tabBarHeight = use(BottomTabBarHeightContext) ?? 0
  const scrollRef = useRef<ScrollView>(null)
  const anchors = useRef<Partial<Record<Anchor, number>>>({})

  const [isLoading, setIsLoading] = useState(true)
  const [product, setProduct] = useState<ProductFacts | null>(null)
  const [profile, setProfile] = useState<ExportProfile | null>(null)
  const [guide, setGuide] = useState<ExportCriteriaGuide | null>(null)
  /** Draft as last confirmed by the server: while unchanged, its criteria are shown. */
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null)

  const [weight, setWeight] = useState('')
  const [length, setLength] = useState('')
  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')
  const [shelfLife, setShelfLife] = useState('')
  const [storage, setStorage] = useState<ExportStorage | null>(null)
  const [allergens, setAllergens] = useState('')
  const [noAllergens, setNoAllergens] = useState(false)
  const [producer, setProducer] = useState('')
  const [place, setPlace] = useState('')
  const [year, setYear] = useState('')
  const [method, setMethod] = useState('')
  const [originPhotos, setOriginPhotos] = useState<string[]>([])
  const [labelPhoto, setLabelPhoto] = useState<string | null>(null)
  const [declaresFrenchLabel, setDeclaresFrenchLabel] = useState(false)
  const [declaresDatesPrinted, setDeclaresDatesPrinted] = useState(false)
  const [declaresSealedPackaging, setDeclaresSealedPackaging] = useState(false)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isWithdrawing, setIsWithdrawing] = useState(false)

  function fillFrom(next: ExportProfile): void {
    setWeight(numberText(next.packedWeightG))
    setLength(numberText(next.lengthCm))
    setWidth(numberText(next.widthCm))
    setHeight(numberText(next.heightCm))
    setShelfLife(numberText(next.shelfLifeDays))
    setStorage(next.storage)
    setAllergens(next.allergens ?? '')
    setNoAllergens(next.noAllergens)
    setProducer(next.origin.producer ?? '')
    setPlace(next.origin.place ?? '')
    setYear(numberText(next.origin.year))
    setMethod(next.origin.method ?? '')
    setOriginPhotos(next.origin.photos.slice(0, MAX_ORIGIN_PHOTOS))
    setLabelPhoto(next.labelPhoto)
    setDeclaresFrenchLabel(next.declaresFrenchLabel)
    setDeclaresDatesPrinted(next.declaresDatesPrinted)
    setDeclaresSealedPackaging(next.declaresSealedPackaging)
  }

  // First load: the product, its profile (fills the form) and the thresholds.
  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      try {
        const [loaded, thresholds] = await Promise.all([fetchProduct(productId), loadExportCriteriaGuide()])
        if (cancelled)
          return
        setGuide(thresholds)
        if (loaded) {
          setProduct(loaded.facts)
          if (loaded.profile) {
            setProfile(loaded.profile)
            fillFrom(loaded.profile)
            setSavedSnapshot(JSON.stringify(draftFactsOf(loaded.profile, loaded.facts)))
          }
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

  // Back from the product sheet: refresh what it holds (ingredients, category, allergens).
  const isFirstFocus = useRef(true)
  useFocusEffect(useCallback(() => {
    if (isFirstFocus.current) {
      isFirstFocus.current = false
      return
    }
    fetchProduct(productId)
      .then((loaded) => {
        if (loaded)
          setProduct(loaded.facts)
      })
      .catch(() => {
        // keeps the facts already shown
      })
  }, [productId]))

  const currentYear = new Date().getFullYear()
  const weightValue = parsePositiveInt(weight)
  const shelfLifeValue = parsePositiveInt(shelfLife)
  const yearValue = year.trim() === '' ? null : Number(year)
  const yearValid = yearValue === null || (yearValue >= 1950 && yearValue <= currentYear)
  const dimensionsValid = [length, width, height].every(v => v.trim() === '' || parsePositiveInt(v) !== null)
  const canSave = yearValid && dimensionsValid && product !== null

  const facts: ProfileDraftFacts = {
    categoryName: product?.categoryName ?? null,
    ingredients: product?.ingredients ?? null,
    productAllergens: product?.allergens ?? [],
    packedWeightG: weightValue,
    shelfLifeDays: shelfLifeValue,
    storage,
    allergens,
    noAllergens,
    producer,
    place,
    labelPhoto,
    declaresFrenchLabel,
    declaresDatesPrinted,
    declaresSealedPackaging,
  }
  const snapshot = JSON.stringify(facts)
  const localCriteria = computeProfileCriteria(facts, guide, profile?.criteria ?? [])
  const criteria = profile && profile.criteria.length > 0 && savedSnapshot === snapshot ? profile.criteria : localCriteria
  const withdrawn = profile?.status === 'WITHDRAWN'

  function scrollTo(anchor: Anchor): void {
    const y = anchors.current[anchor]
    if (y !== undefined)
      scrollRef.current?.scrollTo({ y: Math.max(0, y - spacing[4]), animated: true })
  }

  function rememberAnchor(anchor: Anchor) {
    return (event: { nativeEvent: { layout: { y: number } } }) => {
      anchors.current[anchor] = event.nativeEvent.layout.y
    }
  }

  function sheetButtons() {
    return onEditProduct
      ? [{ text: 'Modifier la fiche', onPress: onEditProduct }, { text: 'Fermer', style: 'cancel' as const }]
      : undefined
  }

  function onPressCriterion(criterion: ExportCriterion): void {
    if (criterion.key === 'category_allowed') {
      appAlert(
        'Catégorie non autorisée',
        `${product?.categoryName ? `La catégorie « ${product.categoryName} » ne peut pas voyager à l’étranger. ` : ''}${criterion.hint} Si la catégorie est mal choisie, corrigez-la dans la fiche du produit.`,
        sheetButtons(),
      )
      return
    }
    if (criterion.key === 'ingredients') {
      appAlert('Ingrédients du produit', `${criterion.hint} Les ingrédients se saisissent une seule fois, dans la fiche du produit.`, sheetButtons())
      return
    }
    const anchor = CRITERION_ANCHORS[criterion.key]
    if (anchor)
      scrollTo(anchor)
  }

  async function submit(): Promise<void> {
    if (!canSave)
      return
    setIsSubmitting(true)
    try {
      const supplierId = await resolveSupplierId()
      if (!supplierId) {
        appAlert('Enregistrement impossible', 'Votre boutique est introuvable. Réessayez dans un instant.')
        return
      }
      const body = {
        packedWeightG: weightValue,
        lengthCm: parsePositiveInt(length),
        widthCm: parsePositiveInt(width),
        heightCm: parsePositiveInt(height),
        shelfLifeDays: shelfLifeValue,
        storage,
        allergens: noAllergens || !allergens.trim() ? null : allergens.trim(),
        noAllergens,
        origin: {
          producer: producer.trim() || null,
          place: place.trim() || null,
          year: yearValue,
          method: method.trim() || null,
          photos: originPhotos,
        },
        labelPhoto,
        declaresFrenchLabel,
        declaresDatesPrinted,
        declaresSealedPackaging,
      }
      const res = await apiFetch(`/api/suppliers/${supplierId}/products/${productId}/export`, {
        method: 'PUT',
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        appAlert('Enregistrement impossible', await readExportError(res))
        return
      }
      const saved = parseExportProfile(await res.json().catch(() => null))
      if (!saved) {
        appAlert('Modifications enregistrées')
        return
      }
      setProfile(saved)
      fillFrom(saved)
      setSavedSnapshot(JSON.stringify(draftFactsOf(saved, product)))
      if (saved.status === 'EXPORTABLE') {
        appAlert('Produit exportable', 'Votre produit est exportable : il apparaît dans la Valise du pays.', [{ text: 'Parfait', onPress: onDone }])
      }
      else if (saved.status === 'WITHDRAWN') {
        appAlert('Modifications enregistrées', 'Le produit reste retiré par eBio. Une fois tout corrigé, contactez eBio : c’est eBio qui le remet en vente à l’étranger.')
      }
      else {
        scrollRef.current?.scrollTo({ y: 0, animated: true })
        appAlert(
          `Encore ${missingLabel(saved.missingCount)} à compléter`,
          'Vos informations sont enregistrées. Le produit partira à l’étranger dès que tous les points de la liste seront cochés.',
        )
      }
    }
    catch {
      appAlert('Enregistrement impossible', 'Vérifiez votre connexion et réessayez.')
    }
    finally {
      setIsSubmitting(false)
    }
  }

  async function removeFromExport(): Promise<void> {
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

  function confirmRemove(): void {
    appAlert(
      'Ne plus vendre à l’étranger ?',
      'Le produit ne sera plus proposé aux clients à l’étranger, et les packs qui le contiennent ne pourront plus être commandés. Il reste en vente au Bénin.',
      [
        { text: 'Retirer de l’export', style: 'destructive', onPress: removeFromExport },
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
  const maxWeightText = guide ? formatWeight(guide.maxUnitWeightG) : null

  return (
    <KeyboardAwareView style={[styles.container, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader title="Vendre à l’étranger" subtitle={product?.name} onBack={onGoBack} />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + spacing[10] }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Product + status */}
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
                      Pas encore proposé à l’étranger
                    </Text>
                  )}
            </View>
          </View>
          <Text style={[styles.helper, { color: semantic.textSecondary }]}>
            Dès que tous les points ci-dessous sont remplis, votre produit apparaît tout seul dans la Valise du pays, sans attendre.
          </Text>
        </View>

        {withdrawn
          ? (
              <View style={[styles.withdrawnCard, { backgroundColor: colors.coral[50], borderColor: colors.coral[200] }]}>
                <View style={styles.withdrawnHead}>
                  <CircleX size={18} color={colors.coral[800]} />
                  <Text style={[styles.withdrawnTitle, { color: colors.coral[800] }]}>Retiré par eBio</Text>
                </View>
                {profile?.withdrawnReason
                  ? <Text style={[styles.withdrawnText, { color: colors.coral[800] }]}>{`Motif : ${profile.withdrawnReason}`}</Text>
                  : null}
                <Text style={[styles.withdrawnText, { color: colors.coral[800] }]}>
                  Corrigez puis contactez eBio : c’est eBio qui remet le produit en vente à l’étranger.
                </Text>
              </View>
            )
          : null}

        {onOpenGuide
          ? (
              <TouchableOpacity
                style={[styles.guideLink, { backgroundColor: colors.blue[50] }]}
                onPress={onOpenGuide}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <BookOpen size={18} color={colors.blue[800]} />
                <Text style={[styles.guideLinkText, { color: colors.blue[800] }]}>Lire le guide : ce qui peut voyager, comment emballer et étiqueter</Text>
                <ChevronRight size={18} color={colors.blue[800]} />
              </TouchableOpacity>
            )
          : null}

        <Text style={[styles.sectionTitle, { color: semantic.textTertiary }]}>CE QU’IL FAUT POUR PARTIR</Text>
        <ExportCriteriaList
          criteria={criteria}
          doneText={withdrawn ? 'Tous les points sont remplis' : 'Tout est prêt : le produit est exportable'}
          onPressCriterion={onPressCriterion}
        />

        {/* Parcel */}
        <Text style={[styles.sectionTitle, { color: semantic.textTertiary }]}>COLIS</Text>
        <View onLayout={rememberAnchor('weight')}>
          <Text style={[styles.label, { color: semantic.textSecondary }]}>Poids d’une unité emballée (g)</Text>
          <TextInput
            style={inputStyle}
            keyboardType="number-pad"
            value={weight}
            onChangeText={text => setWeight(digitsOnly(text, 6))}
            placeholder="Ex. 450"
            placeholderTextColor={semantic.textTertiary}
            accessibilityLabel="Poids d’une unité emballée, en grammes"
          />
          <Text style={[styles.helper, { color: semantic.textTertiary }]}>
            {maxWeightText
              ? `Pesez le produit dans son emballage : ${maxWeightText} au plus. Ce poids sert aussi au calcul du transport.`
              : 'Pesez le produit dans son emballage. Ce poids sert aussi au calcul du transport.'}
          </Text>
        </View>

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

        {/* Keeping */}
        <Text style={[styles.sectionTitle, { color: semantic.textTertiary }]}>CONSERVATION</Text>
        <View onLayout={rememberAnchor('shelf')}>
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
            {guide
              ? `Au moins ${guide.minShelfLifeDays} jours : le voyage dure plusieurs semaines et le produit doit rester bon après son arrivée.`
              : 'Le voyage dure plusieurs semaines : le produit doit rester bon après son arrivée.'}
          </Text>
        </View>

        <View onLayout={rememberAnchor('storage')}>
          <Text style={[styles.label, { color: semantic.textSecondary }]}>Comment se conserve le produit ?</Text>
          <View style={styles.storageRow} accessibilityRole="radiogroup">
            {STORAGE_OPTIONS.map(({ value, label, Icon }) => {
              const selected = storage === value
              return (
                <TouchableOpacity
                  key={value}
                  style={[
                    styles.storageOption,
                    { borderColor: selected ? colors.green[400] : semantic.borderNormal, backgroundColor: selected ? colors.green[50] : semantic.bgSurface },
                  ]}
                  onPress={() => setStorage(value)}
                  activeOpacity={0.7}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={label}
                >
                  <Icon size={18} color={selected ? colors.green[800] : semantic.textSecondary} />
                  <Text style={[styles.storageText, { color: selected ? colors.green[800] : semantic.textPrimary }]}>{label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
          <Text style={[styles.helper, { color: storage && storage !== 'AMBIENT' ? colors.coral[600] : semantic.textTertiary }]}>
            Seuls les produits à température ambiante peuvent voyager.
          </Text>
        </View>

        <View onLayout={rememberAnchor('allergens')}>
          <Text style={[styles.label, { color: semantic.textSecondary }]}>Allergènes</Text>
          {product && product.allergens.length > 0
            ? (
                <Text style={[styles.helper, styles.helperBelow, { color: semantic.textSecondary }]}>
                  Les allergènes cochés sur la fiche du produit suffisent. Vous pouvez compléter ci-dessous.
                </Text>
              )
            : null}
          <DeclarationRow label="Ce produit ne contient aucun allergène" value={noAllergens} onChange={setNoAllergens} />
          {!noAllergens
            ? (
                <TextInput
                  style={[...inputStyle, styles.multiline]}
                  value={allergens}
                  onChangeText={setAllergens}
                  maxLength={ALLERGENS_MAX}
                  multiline
                  textAlignVertical="top"
                  placeholder="Recopiez les allergènes de l’étiquette, ex. arachide, sésame"
                  placeholderTextColor={semantic.textTertiary}
                  accessibilityLabel="Allergènes indiqués sur l’étiquette"
                />
              )
            : null}
        </View>

        {/* Origin */}
        <Text style={[styles.sectionTitle, { color: semantic.textTertiary }]}>ORIGINE</Text>
        <View onLayout={rememberAnchor('origin')}>
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

          <Text style={[styles.label, { color: semantic.textSecondary }]}>Lieu de fabrication (commune, région)</Text>
          <TextInput
            style={inputStyle}
            value={place}
            onChangeText={setPlace}
            maxLength={PLACE_MAX}
            placeholder="Ex. Djougou, Donga"
            placeholderTextColor={semantic.textTertiary}
            accessibilityLabel="Lieu de fabrication"
          />
        </View>

        <Text style={[styles.label, { color: semantic.textSecondary }]}>Année de récolte ou de fabrication (facultatif)</Text>
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

        <Text style={[styles.label, { color: semantic.textSecondary }]}>Mode de fabrication (facultatif)</Text>
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

        <Text style={[styles.label, { color: semantic.textSecondary }]}>{`Photos d’origine (facultatif, jusqu’à ${MAX_ORIGIN_PHOTOS})`}</Text>
        <ExportPhotoPicker
          photos={originPhotos}
          onChange={setOriginPhotos}
          max={MAX_ORIGIN_PHOTOS}
          noun="photo d’origine"
        />
        <Text style={[styles.helper, { color: semantic.textTertiary }]}>
          L’atelier, le champ, les mains qui fabriquent : ce que le client ne voit pas en épicerie.
        </Text>

        {/* Label */}
        <Text style={[styles.sectionTitle, { color: semantic.textTertiary }]}>ÉTIQUETTE</Text>
        <View onLayout={rememberAnchor('label')}>
          <Text style={[styles.label, { color: semantic.textSecondary }]}>Photo de l’étiquette</Text>
          <ExportPhotoPicker
            photos={labelPhoto ? [labelPhoto] : []}
            onChange={photos => setLabelPhoto(photos[0] ?? null)}
            max={1}
            noun="photo de l’étiquette"
          />
          <View style={[styles.note, { backgroundColor: colors.blue[50] }]}>
            <Info size={16} color={colors.blue[800]} />
            <Text style={[styles.noteText, { color: colors.blue[800] }]}>
              Photographiez l’étiquette de face, en pleine lumière, avec les dates bien lisibles. Elle sert de preuve en cas de contrôle à l’arrivée.
            </Text>
          </View>
        </View>

        <View onLayout={rememberAnchor('declarations')}>
          <Text style={[styles.label, { color: semantic.textSecondary }]}>Je confirme que :</Text>
          <View style={[styles.declarations, { backgroundColor: semantic.bgCard }]}>
            <DeclarationRow
              label="L’étiquette est écrite en français"
              value={declaresFrenchLabel}
              onChange={setDeclaresFrenchLabel}
            />
            <View style={[styles.divider, { backgroundColor: semantic.borderLight }]} />
            <DeclarationRow
              label="La date de fabrication et la date limite sont imprimées sur chaque unité"
              value={declaresDatesPrinted}
              onChange={setDeclaresDatesPrinted}
            />
            <View style={[styles.divider, { backgroundColor: semantic.borderLight }]} />
            <DeclarationRow
              label="Chaque unité est bien fermée et scellée"
              value={declaresSealedPackaging}
              onChange={setDeclaresSealedPackaging}
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.submitButton, (!canSave || isSubmitting) && styles.disabled]}
          disabled={!canSave || isSubmitting}
          onPress={submit}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSave || isSubmitting }}
        >
          {isSubmitting
            ? <ActivityIndicator size="small" color={colors.neutral[0]} />
            : <Text style={styles.submitButtonText}>Enregistrer</Text>}
        </TouchableOpacity>
        <Text style={[styles.helper, styles.centered, { color: semantic.textTertiary }]}>
          Vous pouvez enregistrer à tout moment, même s’il manque encore des éléments.
        </Text>

        {profile
          ? (
              <TouchableOpacity
                style={[styles.withdrawButton, isWithdrawing && styles.disabled]}
                onPress={confirmRemove}
                disabled={isWithdrawing}
                activeOpacity={0.8}
                accessibilityRole="button"
              >
                {isWithdrawing
                  ? <ActivityIndicator size="small" color={colors.coral[600]} />
                  : <Text style={styles.withdrawButtonText}>Ne plus vendre à l’étranger</Text>}
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

  withdrawnCard: { marginTop: spacing[3], borderRadius: radius.lg, borderWidth: 1, padding: spacing[4], gap: spacing[2] },
  withdrawnHead: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  withdrawnTitle: { ...typography.h3 },
  withdrawnText: { ...typography.bodyS },

  guideLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginTop: spacing[3],
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
  },
  guideLinkText: { ...typography.bodyS, fontFamily: fonts.sansSb, flex: 1 },

  sectionTitle: { ...typography.overline, marginTop: spacing[6], marginBottom: spacing[2] },
  label: { ...typography.caption, marginTop: spacing[4], marginBottom: spacing[2] },
  helper: { ...typography.caption, marginTop: spacing[1] },
  helperBelow: { marginTop: 0, marginBottom: spacing[2] },
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
  multiline: { minHeight: 96, marginTop: spacing[2] },
  dimensionsRow: { flexDirection: 'row', gap: spacing[2] },
  dimension: { flex: 1, gap: spacing[1] },
  dimensionLabel: { ...typography.caption },

  storageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  storageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  storageText: { ...typography.bodyS, fontFamily: fonts.sansSb },

  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], minHeight: 48, paddingVertical: spacing[2] },
  switchLabel: { ...typography.bodyS, flex: 1 },
  declarations: { borderRadius: radius.lg, paddingHorizontal: spacing[3] },
  divider: { height: 1 },

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
