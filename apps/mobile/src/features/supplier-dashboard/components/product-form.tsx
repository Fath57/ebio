import type { NutritionBasis } from '../../catalog/composition'
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'
import Camera from 'lucide-react-native/dist/esm/icons/camera'
import ChevronDown from 'lucide-react-native/dist/esm/icons/chevron-down'
import ChevronUp from 'lucide-react-native/dist/esm/icons/chevron-up'
import ImagePlus from 'lucide-react-native/dist/esm/icons/image-plus'
import TriangleAlert from 'lucide-react-native/dist/esm/icons/triangle-alert'
import X from 'lucide-react-native/dist/esm/icons/x'
import * as React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
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
import { ALLERGEN_CODES, ALLERGEN_LABELS, LABEL_CODES, LABEL_LABELS, NUTRITION_BASES, NUTRITION_BASIS_LABELS } from '../../catalog/composition'
import { useProductUnits } from '../../catalog/hooks/use-product-units'
import { ConfirmModal } from '../../common/components/confirm-modal'
import { KeyboardAwareView } from '../../common/components/keyboard-aware-view'
import { ScreenHeader } from '../../common/components/screen-header'
import { useMediaUpload } from '../../media/hooks/use-media-upload'
import { useCategories } from '../../search/hooks/use-search'
import { CategoryPickerField } from './category-picker'

const MAX_PHOTOS = 3

// Allergen / label chips store the canonical API codes and display the French label
// Nutrition bounds mirror the API contract: energy ≤ 900 kcal, each gram field 0–100 g
const MAX_ENERGY_KCAL = 900
const MAX_GRAMS = 100

const NUTRITION_FIELDS = [
  { key: 'energyKcal', label: 'Énergie (kcal)', max: MAX_ENERGY_KCAL },
  { key: 'fat', label: 'Matières grasses (g)', max: MAX_GRAMS },
  { key: 'saturatedFat', label: 'dont saturées (g)', max: MAX_GRAMS },
  { key: 'carbohydrates', label: 'Glucides (g)', max: MAX_GRAMS },
  { key: 'sugars', label: 'dont sucres (g)', max: MAX_GRAMS },
  { key: 'fiber', label: 'Fibres (g)', max: MAX_GRAMS },
  { key: 'protein', label: 'Protéines (g)', max: MAX_GRAMS },
  { key: 'salt', label: 'Sel (g)', max: MAX_GRAMS },
] as const

type NutritionKey = typeof NUTRITION_FIELDS[number]['key']

const EMPTY_NUTRITION: Record<NutritionKey, string> = {
  energyKcal: '',
  fat: '',
  saturatedFat: '',
  carbohydrates: '',
  sugars: '',
  fiber: '',
  protein: '',
  salt: '',
}

interface Variant {
  id: string
  label: string
  price: string
  stock: string
}

interface ProductFormProps {
  /** Existing product data for edit mode */
  initialData?: {
    id: string
    name: string
    description: string
    category: string
    price: string
    unit: string
    stock: string
    alertThreshold: string
    photos: string[]
    variants: Variant[]
    isActive: boolean
    voiceDescriptionUri: string | null
    promotionalPrice: number | null
  }
  onSave?: () => void
  onCancel?: () => void
}

export function ProductForm({ initialData, onSave, onCancel }: ProductFormProps) {
  const { semantic } = useTheme()
  const tabBarHeight = useBottomTabBarHeight()
  const { categories, loadCategories } = useCategories()
  const { units } = useProductUnits()
  const [modal, setModal] = useState<{ visible: boolean, title: string, message: string, type: 'success' | 'error' | 'confirm', onConfirm?: () => void }>({ visible: false, title: '', message: '', type: 'error' })

  function showError(title: string, message: string): void {
    setModal({ visible: true, title, message, type: 'error' })
  }

  useEffect(() => {
    loadCategories()
  }, [loadCategories])

  const [name, setName] = useState(initialData?.name ?? '')
  const [description, setDescription] = useState(initialData?.description ?? '')
  const [promoPrice, setPromoPrice] = useState(
    initialData?.promotionalPrice != null ? String(initialData.promotionalPrice) : '',
  )
  const [promoDays, setPromoDays] = useState(7)
  const [category, setCategory] = useState(initialData?.category ?? '')
  const [price, setPrice] = useState(initialData?.price ?? '')
  const [unit, setUnit] = useState<string>(initialData?.unit ?? '')
  const [stock, setStock] = useState(initialData?.stock ?? '')
  const [alertThreshold, setAlertThreshold] = useState(
    initialData?.alertThreshold ?? '',
  )
  // Existing photos (URLs already on the product, kept unless removed) vs
  // freshly uploaded ones (sent as mediaIds). The API needs both lists on
  // update, otherwise new uploads used to wipe the existing photos.
  const [existingPhotos, setExistingPhotos] = useState<string[]>(initialData?.photos ?? [])
  const [newPhotos, setNewPhotos] = useState<Array<{ mediaId: string, url: string }>>([])
  const { uploading, progress, pickAndUpload, takePhotoAndUpload } = useMediaUpload({
    context: 'PRODUCT_PHOTO',
  })
  const [variants, setVariants] = useState<Variant[]>(
    initialData?.variants ?? [],
  )
  const [isActive, setIsActive] = useState(initialData?.isActive ?? true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [hasPromo, setHasPromo] = useState(initialData?.promotionalPrice != null)
  const [removingPromo, setRemovingPromo] = useState(false)
  // Keeps the id of a product created in this session, so a retry after a
  // failed promotion call updates it instead of creating a duplicate.
  const createdIdRef = useRef<string | null>(null)

  // Composition & fiche produit
  const [compositionOpen, setCompositionOpen] = useState(false)
  const [ingredients, setIngredients] = useState('')
  const [allergensSel, setAllergensSel] = useState<string[]>([])
  const [labelsSel, setLabelsSel] = useState<string[]>([])
  const [origin, setOrigin] = useState('')
  const [conservation, setConservation] = useState('')
  const [nutrition, setNutrition] = useState<Record<NutritionKey, string>>(EMPTY_NUTRITION)
  const [nutritionBasis, setNutritionBasis] = useState<NutritionBasis>('100g')

  // Edit mode: initialData (built by the navigation wrapper) does not carry
  // the composition fields, so hydrate them from the product endpoint.
  useEffect(() => {
    const id = initialData?.id
    if (!id)
      return
    let cancelled = false
    async function hydrate(): Promise<void> {
      try {
        const res = await apiFetch(`/api/products/${id}`)
        if (!res.ok || cancelled)
          return
        const p = await res.json() as Record<string, unknown>
        if (cancelled)
          return
        const nv = (p.nutritionalValues as Record<string, number | string | null> | null) ?? null
        const nextNutrition = { ...EMPTY_NUTRITION }
        for (const field of NUTRITION_FIELDS) {
          const value = nv?.[field.key]
          if (typeof value === 'number')
            nextNutrition[field.key] = String(value)
        }
        setIngredients((p.ingredients as string) ?? '')
        setAllergensSel((p.allergens as string[]) ?? [])
        setLabelsSel((p.labels as string[]) ?? [])
        setOrigin((p.origin as string) ?? '')
        setConservation((p.conservation as string) ?? '')
        setNutrition(nextNutrition)
        setNutritionBasis(nv?.basis === '100ml' ? '100ml' : '100g')
        const hasComposition = Boolean(p.ingredients)
          || ((p.allergens as string[]) ?? []).length > 0
          || ((p.labels as string[]) ?? []).length > 0
          || Boolean(p.origin)
          || Boolean(p.conservation)
          || nv != null
        if (hasComposition)
          setCompositionOpen(true)
      }
      catch {
        // Offline: the composition section simply starts empty
      }
    }
    hydrate()
    return () => {
      cancelled = true
    }
  }, [initialData?.id])

  const totalPhotos = existingPhotos.length + newPhotos.length

  async function handleAddPhoto(fromCamera: boolean): Promise<void> {
    if (totalPhotos >= MAX_PHOTOS) {
      showError('Limite atteinte', `Maximum ${MAX_PHOTOS} photos autorisées.`)
      return
    }
    const result = fromCamera ? await takePhotoAndUpload() : await pickAndUpload()
    if (result) {
      setNewPhotos(prev => [...prev, { mediaId: result.mediaId, url: result.publicUrl ?? '' }])
    }
  }

  function handleRemoveExistingPhoto(index: number): void {
    setExistingPhotos(prev => prev.filter((_, i) => i !== index))
  }

  function handleRemoveNewPhoto(mediaId: string): void {
    setNewPhotos(prev => prev.filter(p => p.mediaId !== mediaId))
  }

  function toggleAllergen(value: string): void {
    setAllergensSel(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value])
  }

  function toggleLabel(value: string): void {
    setLabelsSel(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value])
  }

  function setNutritionField(key: NutritionKey, value: string): void {
    setNutrition(prev => ({ ...prev, [key]: value }))
  }

  function handleAddVariant(): void {
    setVariants(prev => [
      ...prev,
      {
        id: Date.now().toString(),
        label: '',
        price: '',
        stock: '',
      },
    ])
  }

  function handleRemoveVariant(id: string): void {
    setVariants(prev => prev.filter(v => v.id !== id))
  }

  const handleUpdateVariant = useCallback(
    (id: string, field: keyof Omit<Variant, 'id'>, value: string) => {
      setVariants(prev =>
        prev.map(v => (v.id === id ? { ...v, [field]: value } : v)),
      )
    },
    [],
  )

  async function readError(res: Response): Promise<string> {
    const body = await res.json().catch(() => null) as { message?: string, aggregateErrors?: Array<{ message?: string }> } | null
    return body?.aggregateErrors?.[0]?.message ?? body?.message ?? 'Une erreur est survenue'
  }

  async function handleRemovePromotion(): Promise<void> {
    const productId = initialData?.id ?? createdIdRef.current
    if (!productId)
      return
    setRemovingPromo(true)
    try {
      const res = await apiFetch(`/api/suppliers/me/products/${productId}/promotion`, { method: 'DELETE' })
      if (res.ok) {
        setHasPromo(false)
        setPromoPrice('')
      }
      else {
        showError('Erreur', await readError(res))
      }
    }
    catch {
      showError('Erreur', 'Impossible de retirer la promotion. Vérifiez votre connexion.')
    }
    finally {
      setRemovingPromo(false)
    }
  }

  /** Parsed nutrition inputs (comma accepted as decimal separator); blank fields are skipped. */
  function parseNutrition(): Partial<Record<NutritionKey, number>> {
    const parsed: Partial<Record<NutritionKey, number>> = {}
    for (const field of NUTRITION_FIELDS) {
      const raw = nutrition[field.key].trim().replace(',', '.')
      if (raw === '')
        continue
      const value = Number.parseFloat(raw)
      if (!Number.isNaN(value))
        parsed[field.key] = value
    }
    return parsed
  }

  /** Client-side mirror of the API nutrition bounds; returns a French error or null. */
  function validateNutrition(values: Partial<Record<NutritionKey, number>>): string | null {
    for (const field of NUTRITION_FIELDS) {
      const value = values[field.key]
      if (value === undefined)
        continue
      if (value < 0)
        return `${field.label} : la valeur ne peut pas être négative.`
      if (value > field.max) {
        const unit = field.key === 'energyKcal' ? 'kcal' : 'g'
        return `${field.label} : la valeur ne peut pas dépasser ${field.max} ${unit} ${NUTRITION_BASIS_LABELS[nutritionBasis]}.`
      }
    }
    if (values.saturatedFat !== undefined && values.fat !== undefined && values.saturatedFat > values.fat)
      return 'Les acides gras saturés ne peuvent pas dépasser les matières grasses.'
    if (values.sugars !== undefined && values.carbohydrates !== undefined && values.sugars > values.carbohydrates)
      return 'Les sucres ne peuvent pas dépasser les glucides.'
    return null
  }

  /** Composition fields, empty ones omitted so the API keeps its defaults. */
  function buildCompositionBody(): Record<string, unknown> {
    const composition: Record<string, unknown> = {}
    if (ingredients.trim())
      composition.ingredients = ingredients.trim()
    if (allergensSel.length > 0)
      composition.allergens = allergensSel
    if (labelsSel.length > 0)
      composition.labels = labelsSel
    if (origin.trim())
      composition.origin = origin.trim()
    if (conservation.trim())
      composition.conservation = conservation.trim()
    const nutritionalValues = parseNutrition()
    if (Object.keys(nutritionalValues).length > 0)
      composition.nutritionalValues = { basis: nutritionBasis, ...nutritionalValues }
    return composition
  }

  async function handleSubmit(): Promise<void> {
    if (!name.trim() || !category || !price.trim() || !unit || !stock.trim()) {
      showError(
        'Champs requis',
        'Veuillez remplir le nom, la catégorie, le prix, l\'unité et le stock.',
      )
      return
    }

    if (promoPrice.trim()) {
      const promoNum = Number.parseFloat(promoPrice)
      const priceNum = Number.parseFloat(price)
      if (Number.isNaN(promoNum) || promoNum <= 0 || promoNum >= priceNum) {
        showError(
          'Prix promotionnel invalide',
          'Le prix promotionnel doit être inférieur au prix normal.',
        )
        return
      }
    }

    const nutritionError = validateNutrition(parseNutrition())
    if (nutritionError) {
      showError('Valeurs nutritionnelles invalides', nutritionError)
      return
    }

    setIsSubmitting(true)
    try {
      const existingId = initialData?.id ?? createdIdRef.current
      const body: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim(),
        categoryId: category,
        pricePerUnit: Number.parseFloat(price),
        unit,
        stock: Number.parseInt(stock, 10),
        stockAlertThreshold: alertThreshold ? Number.parseInt(alertThreshold, 10) : 5,
        status: isActive ? 'ACTIVE' : 'HIDDEN',
        mediaIds: newPhotos.map(p => p.mediaId),
        variants: variants.map(v => ({
          label: v.label,
          pricePerUnit: Number.parseFloat(v.price),
          stock: Number.parseInt(v.stock, 10),
        })),
        ...buildCompositionBody(),
      }
      if (existingId) {
        // URLs of existing photos to keep, in order — without this list the
        // API wipes every photo not re-uploaded in this edit.
        body.photos = existingPhotos.filter(url => url !== '')
      }

      const method = existingId ? 'PUT' : 'POST'
      const path = existingId
        ? `/api/suppliers/me/products/${existingId}`
        : '/api/suppliers/me/products'

      const res = await apiFetch(path, {
        method,
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        showError('Enregistrement impossible', await readError(res))
        return
      }
      const saved = await res.json().catch(() => null) as { id?: string } | null

      const productId = existingId ?? saved?.id ?? null
      if (!existingId && saved?.id) {
        // From now on this session updates the created product instead of
        // creating duplicates (e.g. retry after a failed promotion call).
        createdIdRef.current = saved.id
        setExistingPhotos(prev => [...prev, ...newPhotos.map(p => p.url).filter(url => url !== '')])
        setNewPhotos([])
      }

      // Promotion (dedicated endpoint) — applied when a promo price is set
      if (productId && promoPrice.trim()) {
        const expiresAt = new Date(Date.now() + promoDays * 24 * 60 * 60 * 1000).toISOString()
        const promoRes = await apiFetch(`/api/suppliers/me/products/${productId}/promotion`, {
          method: 'POST',
          body: JSON.stringify({ promotionalPrice: Number.parseFloat(promoPrice), expiresAt }),
        })
        if (!promoRes.ok) {
          showError('Promotion non appliquée', await readError(promoRes))
          return
        }
        setHasPromo(true)
      }

      onSave?.()
    }
    catch {
      showError('Erreur', 'Impossible d\'enregistrer le produit. Vérifiez votre connexion.')
    }
    finally {
      setIsSubmitting(false)
    }
  }

  return (
    <KeyboardAwareView style={styles.screen}>
      <ScreenHeader
        title={initialData ? 'Modifier le produit' : 'Nouveau produit'}
        onBack={onCancel}
      />
      <ScrollView
        style={[styles.screen, { backgroundColor: semantic.bgPage }]}
        contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + spacing[6] }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Photos */}
        <Text style={[styles.label, { color: semantic.textSecondary }]}>
          Photos (
          {totalPhotos}
          /
          {MAX_PHOTOS}
          )
        </Text>
        <View style={styles.photoRow}>
          {existingPhotos.map((uri, index) => (
            <View key={`existing-${uri}`} style={styles.photoContainer}>
              <Image source={{ uri }} style={styles.photoImage} resizeMode="cover" />
              <TouchableOpacity
                style={styles.photoRemoveButton}
                onPress={() => handleRemoveExistingPhoto(index)}
                accessibilityLabel={`Supprimer la photo ${index + 1}`}
              >
                <X size={12} color={colors.neutral[0]} />
              </TouchableOpacity>
            </View>
          ))}
          {newPhotos.map(photo => (
            <View key={photo.mediaId} style={styles.photoContainer}>
              <Image source={{ uri: photo.url }} style={styles.photoImage} resizeMode="cover" />
              <TouchableOpacity
                style={styles.photoRemoveButton}
                onPress={() => handleRemoveNewPhoto(photo.mediaId)}
                accessibilityLabel="Supprimer la nouvelle photo"
              >
                <X size={12} color={colors.neutral[0]} />
              </TouchableOpacity>
            </View>
          ))}
          {totalPhotos < MAX_PHOTOS && (
            <>
              <TouchableOpacity
                style={[styles.photoAddButton, { borderColor: semantic.borderNormal, backgroundColor: semantic.bgSurface }, uploading && styles.buttonDisabled]}
                onPress={() => handleAddPhoto(false)}
                disabled={uploading}
                accessibilityRole="button"
                accessibilityLabel="Ajouter une photo depuis la galerie"
              >
                <ImagePlus size={20} color={semantic.textTertiary} />
                <Text style={[styles.photoAddText, { color: semantic.textTertiary }]}>Galerie</Text>
                <Text style={[styles.photoGuideText, { color: semantic.textTertiary }]}>Cadrez le produit au centre</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.photoAddButton, { borderColor: semantic.borderNormal, backgroundColor: semantic.bgSurface }, uploading && styles.buttonDisabled]}
                onPress={() => handleAddPhoto(true)}
                disabled={uploading}
                accessibilityRole="button"
                accessibilityLabel="Prendre une photo"
              >
                <Camera size={20} color={semantic.textTertiary} />
                <Text style={[styles.photoAddText, { color: semantic.textTertiary }]}>Prendre une photo</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
        {uploading && (
          <View style={styles.uploadProgressRow}>
            <ActivityIndicator size="small" color={colors.green[400]} />
            <Text style={[styles.uploadProgressText, { color: semantic.textSecondary }]}>
              Envoi de la photo…
              {' '}
              {Math.round(progress * 100)}
              {' %'}
            </Text>
          </View>
        )}

        {/* Name */}
        <Text style={[styles.label, { color: semantic.textSecondary }]}>Nom du produit *</Text>
        <TextInput
          style={[styles.textInput, { borderColor: semantic.borderNormal, color: semantic.textPrimary, backgroundColor: semantic.bgSurface }]}
          placeholder="Ex: Huile d'arachide bio"
          placeholderTextColor={semantic.textTertiary}
          value={name}
          onChangeText={setName}
          accessibilityLabel="Nom du produit"
        />

        {/* Description */}
        <Text style={[styles.label, { color: semantic.textSecondary }]}>Description</Text>
        <TextInput
          style={[styles.textInput, styles.textArea, { borderColor: semantic.borderNormal, color: semantic.textPrimary, backgroundColor: semantic.bgSurface }]}
          placeholder="Décrivez votre produit (origine, qualité, conservation...)"
          placeholderTextColor={semantic.textTertiary}
          value={description}
          onChangeText={setDescription}
          multiline
          accessibilityLabel="Description du produit"
        />

        {/* Category */}
        <Text style={[styles.label, { color: semantic.textSecondary }]}>Catégorie *</Text>
        <CategoryPickerField categories={categories} value={category} onChange={setCategory} />

        {/* Price + Unit */}
        <Text style={[styles.label, { color: semantic.textSecondary }]}>Prix et unité *</Text>
        <View style={styles.priceRow}>
          <TextInput
            style={[styles.textInput, styles.priceInput, { borderColor: semantic.borderNormal, color: semantic.textPrimary, backgroundColor: semantic.bgSurface }]}
            placeholder="Prix (FCFA)"
            placeholderTextColor={semantic.textTertiary}
            keyboardType="numeric"
            value={price}
            onChangeText={setPrice}
            accessibilityLabel="Prix"
          />
          <View style={styles.unitRow}>
            {units.map((u) => {
              const isSelected = unit === u.code
              return (
                <TouchableOpacity
                  key={u.code}
                  style={[
                    styles.unitChip,
                    { borderColor: semantic.borderNormal, backgroundColor: semantic.bgSurface },
                    isSelected && styles.unitChipActive,
                  ]}
                  onPress={() => setUnit(u.code)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={u.label}
                >
                  <Text
                    style={[
                      styles.unitChipText,
                      { color: semantic.textSecondary },
                      isSelected && styles.unitChipTextActive,
                    ]}
                  >
                    {u.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {/* Promotion */}
        <Text style={[styles.label, { color: semantic.textSecondary }]}>Prix promotionnel (optionnel)</Text>
        <TextInput
          style={[styles.textInput, { borderColor: semantic.borderNormal, color: semantic.textPrimary, backgroundColor: semantic.bgSurface }]}
          placeholder="Prix promo (FCFA)"
          placeholderTextColor={semantic.textTertiary}
          keyboardType="numeric"
          value={promoPrice}
          onChangeText={setPromoPrice}
          accessibilityLabel="Prix promotionnel"
        />
        {promoPrice.trim() !== '' && (
          <View style={styles.unitRow}>
            {[7, 15, 30].map((d) => {
              const isSelected = promoDays === d
              return (
                <TouchableOpacity
                  key={d}
                  style={[
                    styles.unitChip,
                    { borderColor: semantic.borderNormal, backgroundColor: semantic.bgSurface },
                    isSelected && styles.unitChipActive,
                  ]}
                  onPress={() => setPromoDays(d)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${d} jours`}
                >
                  <Text style={[styles.unitChipText, { color: semantic.textSecondary }, isSelected && styles.unitChipTextActive]}>
                    {d}
                    {' '}
                    jours
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        )}
        {hasPromo && (
          <TouchableOpacity
            style={[styles.removePromoButton, removingPromo && styles.buttonDisabled]}
            onPress={handleRemovePromotion}
            disabled={removingPromo}
            accessibilityRole="button"
            accessibilityLabel="Retirer la promotion"
          >
            {removingPromo
              ? (
                  <ActivityIndicator size="small" color={colors.coral[600]} />
                )
              : (
                  <Text style={styles.removePromoText}>Retirer la promotion</Text>
                )}
          </TouchableOpacity>
        )}

        {/* Variants */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.label, { color: semantic.textSecondary }]}>Variantes</Text>
          <TouchableOpacity
            style={styles.addVariantButton}
            onPress={handleAddVariant}
            accessibilityLabel="Ajouter une variante"
          >
            <Text style={[styles.addVariantText, { color: semantic.colorPrimary }]}>+ Ajouter</Text>
          </TouchableOpacity>
        </View>
        {variants.map(variant => (
          <View key={variant.id} style={styles.variantRow}>
            <TextInput
              style={[styles.textInput, styles.variantInput, { borderColor: semantic.borderNormal, color: semantic.textPrimary, backgroundColor: semantic.bgSurface }]}
              placeholder="Libellé"
              placeholderTextColor={semantic.textTertiary}
              value={variant.label}
              onChangeText={text =>
                handleUpdateVariant(variant.id, 'label', text)}
              accessibilityLabel="Libellé de la variante"
            />
            <TextInput
              style={[styles.textInput, styles.variantSmallInput, { borderColor: semantic.borderNormal, color: semantic.textPrimary, backgroundColor: semantic.bgSurface }]}
              placeholder="Prix"
              placeholderTextColor={semantic.textTertiary}
              keyboardType="numeric"
              value={variant.price}
              onChangeText={text =>
                handleUpdateVariant(variant.id, 'price', text)}
              accessibilityLabel="Prix de la variante"
            />
            <TextInput
              style={[styles.textInput, styles.variantSmallInput, { borderColor: semantic.borderNormal, color: semantic.textPrimary, backgroundColor: semantic.bgSurface }]}
              placeholder="Stock"
              placeholderTextColor={semantic.textTertiary}
              keyboardType="numeric"
              value={variant.stock}
              onChangeText={text =>
                handleUpdateVariant(variant.id, 'stock', text)}
              accessibilityLabel="Stock de la variante"
            />
            <TouchableOpacity
              style={styles.variantRemoveButton}
              onPress={() => handleRemoveVariant(variant.id)}
              accessibilityLabel="Supprimer la variante"
            >
              <X size={16} color={colors.coral[400]} />
            </TouchableOpacity>
          </View>
        ))}

        {/* Stock */}
        <Text style={[styles.label, { color: semantic.textSecondary }]}>Stock *</Text>
        <TextInput
          style={[styles.textInput, { borderColor: semantic.borderNormal, color: semantic.textPrimary, backgroundColor: semantic.bgSurface }]}
          placeholder="Quantité en stock"
          placeholderTextColor={semantic.textTertiary}
          keyboardType="numeric"
          value={stock}
          onChangeText={setStock}
          accessibilityLabel="Stock"
        />

        <Text style={[styles.label, { color: semantic.textSecondary }]}>Seuil d'alerte stock</Text>
        <TextInput
          style={[styles.textInput, { borderColor: semantic.borderNormal, color: semantic.textPrimary, backgroundColor: semantic.bgSurface }]}
          placeholder="Alerte quand le stock descend sous..."
          placeholderTextColor={semantic.textTertiary}
          keyboardType="numeric"
          value={alertThreshold}
          onChangeText={setAlertThreshold}
          accessibilityLabel="Seuil d'alerte stock"
        />

        {/* Composition & fiche produit (collapsible, all optional) */}
        <TouchableOpacity
          style={[styles.collapseHeader, { borderColor: semantic.borderNormal, backgroundColor: semantic.bgSurface }]}
          onPress={() => setCompositionOpen(open => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded: compositionOpen }}
          accessibilityLabel="Composition et fiche produit"
        >
          <Text style={[styles.collapseHeaderText, { color: semantic.textPrimary }]}>Composition & fiche produit</Text>
          {compositionOpen
            ? <ChevronUp size={18} color={semantic.textSecondary} />
            : <ChevronDown size={18} color={semantic.textSecondary} />}
        </TouchableOpacity>
        {compositionOpen && (
          <View>
            <Text style={[styles.label, { color: semantic.textSecondary }]}>Ingrédients</Text>
            <TextInput
              style={[styles.textInput, styles.textArea, { borderColor: semantic.borderNormal, color: semantic.textPrimary, backgroundColor: semantic.bgSurface }]}
              placeholder="Liste des ingrédients"
              placeholderTextColor={semantic.textTertiary}
              value={ingredients}
              onChangeText={setIngredients}
              multiline
              accessibilityLabel="Ingrédients"
            />

            <Text style={[styles.label, { color: semantic.textSecondary }]}>Allergènes</Text>
            <View style={styles.chipWrap}>
              {ALLERGEN_CODES.map((allergen) => {
                const isSelected = allergensSel.includes(allergen)
                return (
                  <TouchableOpacity
                    key={allergen}
                    style={[
                      styles.unitChip,
                      { borderColor: semantic.borderNormal, backgroundColor: semantic.bgSurface },
                      isSelected && styles.unitChipActive,
                    ]}
                    onPress={() => toggleAllergen(allergen)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isSelected }}
                    accessibilityLabel={ALLERGEN_LABELS[allergen]}
                  >
                    <Text style={[styles.unitChipText, { color: semantic.textSecondary }, isSelected && styles.unitChipTextActive]}>
                      {ALLERGEN_LABELS[allergen]}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            <Text style={[styles.label, { color: semantic.textSecondary }]}>Labels</Text>
            <View style={styles.chipWrap}>
              {LABEL_CODES.map((qualityLabel) => {
                const isSelected = labelsSel.includes(qualityLabel)
                return (
                  <TouchableOpacity
                    key={qualityLabel}
                    style={[
                      styles.unitChip,
                      { borderColor: semantic.borderNormal, backgroundColor: semantic.bgSurface },
                      isSelected && styles.unitChipActive,
                    ]}
                    onPress={() => toggleLabel(qualityLabel)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isSelected }}
                    accessibilityLabel={LABEL_LABELS[qualityLabel]}
                  >
                    <Text style={[styles.unitChipText, { color: semantic.textSecondary }, isSelected && styles.unitChipTextActive]}>
                      {LABEL_LABELS[qualityLabel]}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            <Text style={[styles.label, { color: semantic.textSecondary }]}>Origine</Text>
            <TextInput
              style={[styles.textInput, { borderColor: semantic.borderNormal, color: semantic.textPrimary, backgroundColor: semantic.bgSurface }]}
              placeholder="Ex: Vallée de l'Ouémé, Bénin"
              placeholderTextColor={semantic.textTertiary}
              value={origin}
              onChangeText={setOrigin}
              accessibilityLabel="Origine"
            />

            <Text style={[styles.label, { color: semantic.textSecondary }]}>Conservation</Text>
            <TextInput
              style={[styles.textInput, styles.textArea, { borderColor: semantic.borderNormal, color: semantic.textPrimary, backgroundColor: semantic.bgSurface }]}
              placeholder="Ex: À conserver au frais après ouverture"
              placeholderTextColor={semantic.textTertiary}
              value={conservation}
              onChangeText={setConservation}
              multiline
              accessibilityLabel="Conservation"
            />

            <Text style={[styles.label, { color: semantic.textSecondary }]}>Valeurs nutritionnelles</Text>
            <View style={styles.chipWrap} accessibilityRole="radiogroup" accessibilityLabel="Base des valeurs nutritionnelles">
              {NUTRITION_BASES.map((basis) => {
                const isSelected = nutritionBasis === basis
                return (
                  <TouchableOpacity
                    key={basis}
                    style={[
                      styles.unitChip,
                      { borderColor: semantic.borderNormal, backgroundColor: semantic.bgSurface },
                      isSelected && styles.unitChipActive,
                    ]}
                    onPress={() => setNutritionBasis(basis)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={NUTRITION_BASIS_LABELS[basis]}
                  >
                    <Text style={[styles.unitChipText, { color: semantic.textSecondary }, isSelected && styles.unitChipTextActive]}>
                      {NUTRITION_BASIS_LABELS[basis]}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
            <View style={styles.nutritionGrid}>
              {NUTRITION_FIELDS.map(field => (
                <View key={field.key} style={styles.nutritionField}>
                  <Text style={[styles.nutritionFieldLabel, { color: semantic.textTertiary }]}>{field.label}</Text>
                  <TextInput
                    style={[styles.textInput, { borderColor: semantic.borderNormal, color: semantic.textPrimary, backgroundColor: semantic.bgSurface }]}
                    placeholder="—"
                    placeholderTextColor={semantic.textTertiary}
                    keyboardType="numeric"
                    value={nutrition[field.key]}
                    onChangeText={value => setNutritionField(field.key, value)}
                    accessibilityLabel={field.label}
                  />
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Status toggle */}
        <View style={[styles.statusRow, { borderTopColor: semantic.borderLight }]}>
          <Text style={[styles.statusLabel, { color: semantic.textPrimary }]}>
            Statut :
            {' '}
            {isActive ? 'Actif' : 'Masqué'}
          </Text>
          <Switch
            value={isActive}
            onValueChange={setIsActive}
            trackColor={{
              false: colors.neutral[200],
              true: colors.green[200],
            }}
            thumbColor={isActive ? colors.green[400] : colors.neutral[400]}
            accessibilityLabel="Statut du produit"
          />
        </View>

        {/* Actions */}
        <View style={styles.actionRow}>
          {onCancel && (
            <TouchableOpacity
              style={[styles.cancelButton, { borderColor: semantic.borderNormal }]}
              onPress={onCancel}
              accessibilityLabel="Annuler"
            >
              <Text style={[styles.cancelButtonText, { color: semantic.textSecondary }]}>Annuler</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.saveButton, isSubmitting && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitting}
            accessibilityLabel="Enregistrer"
          >
            {isSubmitting
              ? (
                  <ActivityIndicator size="small" color={colors.neutral[0]} />
                )
              : (
                  <Text style={styles.saveButtonText}>Enregistrer</Text>
                )}
          </TouchableOpacity>
        </View>

        <ConfirmModal
          visible={modal.visible}
          icon={TriangleAlert}
          iconColor={colors.coral[600]}
          iconBg={colors.coral[50]}
          title={modal.title}
          message={modal.message}
          confirmLabel="OK"
          confirmStyle="primary"
          onConfirm={() => setModal(prev => ({ ...prev, visible: false }))}
          onCancel={() => setModal(prev => ({ ...prev, visible: false }))}
        />
      </ScrollView>
    </KeyboardAwareView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingTop: spacing[4],
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[10],
    gap: spacing[2],
  },
  title: {
    ...typography.h1,
    marginBottom: spacing[2],
  },
  label: {
    ...typography.caption,
    marginTop: spacing[3],
  },
  textInput: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    fontFamily: fonts.sans,
    fontSize: 15,
  },
  textArea: {
    minHeight: 88,
    paddingTop: spacing[3],
    textAlignVertical: 'top',
  },
  photoRow: {
    flexDirection: 'row',
    gap: spacing[2],
    flexWrap: 'wrap',
    marginTop: spacing[1],
  },
  photoContainer: {
    width: 100,
    height: 100,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  photoImage: {
    width: 100,
    height: 100,
  },
  photoRemoveButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoRemoveText: {
    fontSize: 12,
    color: colors.neutral[0],
  },
  photoAddButton: {
    width: 100,
    height: 100,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
  },
  photoAddIcon: {
    fontSize: 20,
  },
  photoAddText: {
    ...typography.caption,
  },
  photoGuideText: {
    fontFamily: fonts.sans,
    fontSize: 9,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  priceRow: {
    gap: spacing[2],
  },
  priceInput: {
    fontFamily: fonts.mono,
  },
  unitRow: {
    flexDirection: 'row',
    gap: spacing[1],
    flexWrap: 'wrap',
  },
  unitChip: {
    minHeight: 44,
    paddingHorizontal: spacing[3],
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
  },
  unitChipActive: {
    backgroundColor: colors.green[50],
    borderColor: colors.green[400],
  },
  unitChipText: {
    fontFamily: fonts.sansMd,
    fontSize: 13,
  },
  unitChipTextActive: {
    color: colors.green[800],
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing[3],
  },
  addVariantButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing[2],
  },
  addVariantText: {
    fontFamily: fonts.sansSb,
    fontSize: 13,
  },
  variantRow: {
    flexDirection: 'row',
    gap: spacing[1],
    alignItems: 'center',
  },
  variantInput: {
    flex: 2,
  },
  variantSmallInput: {
    flex: 1,
  },
  variantRemoveButton: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  variantRemoveText: {
    fontSize: 16,
    color: colors.coral[400],
  },
  uploadProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginTop: spacing[1],
  },
  uploadProgressText: {
    ...typography.caption,
  },
  removePromoButton: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.coral[200],
    backgroundColor: colors.coral[50],
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing[1],
  },
  removePromoText: {
    fontFamily: fonts.sansSb,
    fontSize: 14,
    color: colors.coral[600],
  },
  collapseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: spacing[3],
    borderWidth: 1,
    borderRadius: radius.md,
    marginTop: spacing[4],
  },
  collapseHeaderText: {
    fontFamily: fonts.sansSb,
    fontSize: 14,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[1],
    marginTop: spacing[1],
  },
  nutritionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    marginTop: spacing[1],
  },
  nutritionField: {
    width: '47%',
    gap: 4,
  },
  nutritionFieldLabel: {
    fontFamily: fonts.sansMd,
    fontSize: 11,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing[4],
    paddingVertical: spacing[2],
    borderTopWidth: 1,
  },
  statusLabel: {
    ...typography.bodyL,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[4],
  },
  cancelButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontFamily: fonts.sansMd,
    fontSize: 16,
  },
  saveButton: {
    flex: 2,
    minHeight: 44,
    backgroundColor: colors.green[400],
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonText: {
    fontFamily: fonts.sansSb,
    fontSize: 16,
    color: colors.neutral[0],
  },
  buttonDisabled: {
    opacity: 0.5,
  },
})
