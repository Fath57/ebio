import { Audio } from 'expo-av'
import Camera from 'lucide-react-native/dist/esm/icons/camera'
import Mic from 'lucide-react-native/dist/esm/icons/mic'
import Square from 'lucide-react-native/dist/esm/icons/square'
import TriangleAlert from 'lucide-react-native/dist/esm/icons/triangle-alert'
import X from 'lucide-react-native/dist/esm/icons/x'
import * as React from 'react'
import { useCallback, useEffect, useState } from 'react'
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
import { ConfirmModal } from '../../common/components/confirm-modal'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { FALLBACK_CATEGORIES } from '../../../utils/category-icons'
import { useCategories } from '../../search/hooks/use-search'
import { useMediaUpload } from '../../media/hooks/use-media-upload'

const MAX_PHOTOS = 3

type Unit = 'KG' | 'LITER' | 'SACHET' | 'PIECE' | 'LOT'

const UNITS: Array<{ value: Unit, label: string }> = [
  { value: 'KG', label: 'Kg' },
  { value: 'LITER', label: 'Litre' },
  { value: 'SACHET', label: 'Sachet' },
  { value: 'PIECE', label: 'Pièce' },
  { value: 'LOT', label: 'Lot' },
]


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
    category: string
    price: string
    unit: Unit
    stock: string
    alertThreshold: string
    photos: string[]
    variants: Variant[]
    isActive: boolean
    voiceDescriptionUri: string | null
  }
  onSave?: () => void
  onCancel?: () => void
}

export function ProductForm({ initialData, onSave, onCancel }: ProductFormProps) {
  const { semantic } = useTheme()
  const { categories, loadCategories } = useCategories()
  const [modal, setModal] = useState<{ visible: boolean, title: string, message: string, type: 'success' | 'error' | 'confirm', onConfirm?: () => void }>({ visible: false, title: '', message: '', type: 'error' })

  function showError(title: string, message: string): void {
    setModal({ visible: true, title, message, type: 'error' })
  }

  useEffect(() => { loadCategories() }, [loadCategories])

  const [name, setName] = useState(initialData?.name ?? '')
  const [category, setCategory] = useState(initialData?.category ?? '')
  const [price, setPrice] = useState(initialData?.price ?? '')
  const [unit, setUnit] = useState<Unit>(initialData?.unit ?? 'KG')
  const [stock, setStock] = useState(initialData?.stock ?? '')
  const [alertThreshold, setAlertThreshold] = useState(
    initialData?.alertThreshold ?? '',
  )
  const [mediaIds, setMediaIds] = useState<string[]>([])
  const [photoUrls, setPhotoUrls] = useState<string[]>(initialData?.photos ?? [])
  const { uploading: _uploadingPhoto, pickAndUpload } = useMediaUpload({
    context: 'PRODUCT_PHOTO',
  })
  const [variants, setVariants] = useState<Variant[]>(
    initialData?.variants ?? [],
  )
  const [isActive, setIsActive] = useState(initialData?.isActive ?? true)
  const [voiceUri, setVoiceUri] = useState<string | null>(
    initialData?.voiceDescriptionUri ?? null,
  )
  const [isRecording, setIsRecording] = useState(false)
  const [recording, setRecording] = useState<Audio.Recording | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleAddPhoto(): Promise<void> {
    if (photoUrls.length >= MAX_PHOTOS) {
      showError('Limite atteinte', `Maximum ${MAX_PHOTOS} photos autorisées.`)
      return
    }
    const result = await pickAndUpload()
    if (result) {
      setMediaIds(prev => [...prev, result.mediaId])
      setPhotoUrls(prev => [...prev, result.publicUrl ?? ''])
    }
  }

  function handleRemovePhoto(index: number): void {
    setMediaIds(prev => prev.filter((_, i) => i !== index))
    setPhotoUrls(prev => prev.filter((_, i) => i !== index))
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

  async function handleStartRecording(): Promise<void> {
    try {
      const permission = await Audio.requestPermissionsAsync()
      if (!permission.granted) {
        showError(
          'Permission refusée',
          'L\'accès au microphone est requis pour enregistrer une description vocale.',
        )
        return
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      })
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      )
      setRecording(newRecording)
      setIsRecording(true)
    }
    catch {
      showError('Erreur', 'Impossible de démarrer l\'enregistrement.')
    }
  }

  async function handleStopRecording(): Promise<void> {
    if (!recording)
      return
    try {
      await recording.stopAndUnloadAsync()
      const uri = recording.getURI()
      setVoiceUri(uri)
      setRecording(null)
      setIsRecording(false)
    }
    catch {
      setIsRecording(false)
    }
  }

  async function handleSubmit(): Promise<void> {
    if (!name.trim() || !category || !price.trim() || !stock.trim()) {
      showError(
        'Champs requis',
        'Veuillez remplir le nom, la catégorie, le prix et le stock.',
      )
      return
    }

    setIsSubmitting(true)
    try {
      const body = {
        name: name.trim(),
        categoryId: category,
        pricePerUnit: Number.parseFloat(price),
        unit,
        stock: Number.parseInt(stock, 10),
        stockAlertThreshold: alertThreshold ? Number.parseInt(alertThreshold, 10) : 5,
        status: isActive ? 'ACTIVE' : 'HIDDEN',
        mediaIds,
        variants: variants.map(v => ({
          label: v.label,
          pricePerUnit: Number.parseFloat(v.price),
          stock: Number.parseInt(v.stock, 10),
        })),
      }

      const method = initialData?.id ? 'PUT' : 'POST'
      const path = initialData?.id
        ? `/api/suppliers/me/products/${initialData.id}`
        : '/api/suppliers/me/products'

      await apiFetch(path, {
        method,
        body: JSON.stringify(body),
      })

      onSave?.()
    }
    catch {
      showError('Erreur', 'Impossible d\'enregistrer le produit.')
    }
    finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: semantic.bgPage }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.title, { color: semantic.textPrimary }]}>
        {initialData ? 'Modifier le produit' : 'Nouveau produit'}
      </Text>

      {/* Photos */}
      <Text style={[styles.label, { color: semantic.textSecondary }]}>
        Photos (
        {photoUrls.length}
        /
        {MAX_PHOTOS}
        )
      </Text>
      <View style={styles.photoRow}>
        {photoUrls.map((uri, index) => (
          <View key={uri} style={styles.photoContainer}>
            <Image source={{ uri }} style={styles.photoImage} resizeMode="cover" />
            <TouchableOpacity
              style={styles.photoRemoveButton}
              onPress={() => handleRemovePhoto(index)}
              accessibilityLabel={`Supprimer la photo ${index + 1}`}
            >
              <X size={12} color={colors.neutral[0]} />
            </TouchableOpacity>
          </View>
        ))}
        {photoUrls.length < MAX_PHOTOS && (
          <TouchableOpacity
            style={[styles.photoAddButton, { borderColor: semantic.borderNormal, backgroundColor: semantic.bgSurface }]}
            onPress={handleAddPhoto}
            accessibilityLabel="Ajouter une photo"
          >
            <Camera size={20} color={semantic.textTertiary} />
            <Text style={[styles.photoAddText, { color: semantic.textTertiary }]}>Ajouter</Text>
            <Text style={[styles.photoGuideText, { color: semantic.textTertiary }]}>Cadrez le produit au centre</Text>
          </TouchableOpacity>
        )}
      </View>

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

      {/* Category */}
      <Text style={[styles.label, { color: semantic.textSecondary }]}>Catégorie *</Text>
      <View style={styles.categoryGrid}>
        {categories.map((cat) => {
          const isSelected = category === cat.id
          return (
            <TouchableOpacity
              key={cat.id}
              style={[
                styles.categoryChip,
                { borderColor: semantic.borderNormal, backgroundColor: semantic.bgCard },
                isSelected && styles.categoryChipActive,
              ]}
              onPress={() => setCategory(cat.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={cat.label}
            >
              {cat.imageUrl
                ? <Image source={{ uri: cat.imageUrl }} style={{ width: 16, height: 16, borderRadius: 4 }} />
                : <cat.fallbackIcon size={16} color={isSelected ? colors.green[800] : semantic.textSecondary} />}
              <Text
                style={[
                  styles.categoryLabel,
                  { color: semantic.textSecondary },
                  isSelected && styles.categoryLabelActive,
                ]}
              >
                {cat.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

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
          {UNITS.map((u) => {
            const isSelected = unit === u.value
            return (
              <TouchableOpacity
                key={u.value}
                style={[
                  styles.unitChip,
                  { borderColor: semantic.borderNormal, backgroundColor: semantic.bgSurface },
                  isSelected && styles.unitChipActive,
                ]}
                onPress={() => setUnit(u.value)}
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

      {/* Voice description */}
      <Text style={[styles.label, { color: semantic.textSecondary }]}>Description vocale</Text>
      <View style={styles.voiceRow}>
        <TouchableOpacity
          style={[
            styles.voiceButton,
            { borderColor: semantic.borderNormal, backgroundColor: semantic.bgSurface },
            isRecording && styles.voiceButtonRecording,
          ]}
          onPress={isRecording ? handleStopRecording : handleStartRecording}
          accessibilityLabel={
            isRecording
              ? 'Arrêter l\'enregistrement'
              : 'Enregistrer une description vocale'
          }
        >
          {isRecording
            ? <Square size={18} color={colors.coral[600]} />
            : <Mic size={18} color={semantic.textSecondary} />}
          <Text
            style={[
              styles.voiceText,
              { color: semantic.textSecondary },
              isRecording && styles.voiceTextRecording,
            ]}
          >
            {isRecording ? 'Enregistrement en cours...' : 'Enregistrer'}
          </Text>
        </TouchableOpacity>
        {voiceUri && !isRecording && (
          <Text style={[styles.voiceRecorded, { color: semantic.textPrimaryColor }]}>Enregistrement sauvegardé</Text>
        )}
      </View>

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
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    marginTop: spacing[1],
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    minHeight: 44,
    paddingHorizontal: spacing[3],
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  categoryChipActive: {
    backgroundColor: colors.green[50],
    borderColor: colors.green[400],
  },
  categoryIcon: {
    fontSize: 16,
  },
  categoryLabel: {
    fontFamily: fonts.sansMd,
    fontSize: 13,
  },
  categoryLabelActive: {
    color: colors.green[800],
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
  voiceRow: {
    gap: spacing[2],
    marginTop: spacing[1],
  },
  voiceButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    borderWidth: 1,
    borderRadius: radius.md,
  },
  voiceButtonRecording: {
    borderColor: colors.coral[400],
    backgroundColor: colors.coral[50],
  },
  voiceIcon: {
    fontSize: 18,
  },
  voiceText: {
    fontFamily: fonts.sansMd,
    fontSize: 14,
  },
  voiceTextRecording: {
    color: colors.coral[600],
  },
  voiceRecorded: {
    ...typography.caption,
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
