import type { ExportCriterion, ExportPack, ExportPackStatus } from '../utils/terroir-export'
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs'
import { useFocusEffect } from '@react-navigation/native'
import BookOpen from 'lucide-react-native/dist/esm/icons/book-open'
import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right'
import CircleX from 'lucide-react-native/dist/esm/icons/circle-x'
import Gift from 'lucide-react-native/dist/esm/icons/gift'
import Minus from 'lucide-react-native/dist/esm/icons/minus'
import Package from 'lucide-react-native/dist/esm/icons/package'
import Plus from 'lucide-react-native/dist/esm/icons/plus'
import Trash2 from 'lucide-react-native/dist/esm/icons/trash-2'
import { use, useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  RefreshControl,
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
import { formatXof } from '../../common/hooks/use-money'
import { missingLabel, parseExportPacks, parseExportStatus, parsePositiveInt, readExportError, resolveSupplierId } from '../utils/terroir-export'
import { ExportCriteriaList } from './export-criteria-list'
import { ExportPhotoPicker } from './export-photo-picker'
import { ExportStatusBadge } from './export-status-badge'

const NAME_MAX = 120
const DESCRIPTION_MAX = 1000
const MAX_PACK_PHOTOS = 3
const MAX_ITEM_QUANTITY = 99

// ===== Shared loading =====

interface ShopProduct {
  id: string
  name: string
  imageUrl: string | null
  price: number
  /** Export status when the API tells it, `undefined` when it does not. */
  exportStatus: ExportPackStatus | null | undefined
}

function readExportStatus(p: Record<string, unknown>): ExportPackStatus | null | undefined {
  if (typeof p.exportStatus === 'string')
    return parseExportStatus(p.exportStatus)
  if ('exportProfile' in p) {
    const profile = p.exportProfile as { status?: unknown } | null
    return parseExportStatus(profile?.status)
  }
  if ('exportStatus' in p)
    return null
  return undefined
}

const PACK_CRITERION_FALLBACK: Record<string, { label: string, hint: string }> = {
  products_exportable: { label: 'Tous les produits exportables', hint: 'Chaque produit du pack doit être exportable : complétez leur profil d’export ou retirez-les du pack.' },
  name: { label: 'Nom du pack', hint: 'Donnez un nom au pack.' },
  price: { label: 'Prix du pack', hint: 'Fixez le prix du pack.' },
  photo: { label: 'Photo du pack', hint: 'Ajoutez au moins une photo du pack.' },
}

/** The pack's criteria recomputed while the shop edits it, worded as the API words them. */
function computePackCriteria(
  facts: { name: string, price: number | null, photos: string[], itemStatuses: Array<ExportPackStatus | null | undefined> },
  server: ExportCriterion[],
): ExportCriterion[] {
  const texts = new Map(server.map(c => [c.key, c]))
  const met: Record<string, boolean> = {
    products_exportable: facts.itemStatuses.length > 0 && facts.itemStatuses.every(status => status === 'EXPORTABLE'),
    name: facts.name.trim().length > 0,
    price: facts.price !== null && facts.price > 0,
    photo: facts.photos.length > 0,
  }
  return Object.keys(PACK_CRITERION_FALLBACK).map((key) => {
    const text = texts.get(key) ?? PACK_CRITERION_FALLBACK[key]
    return { key, label: text.label, hint: text.hint, met: met[key] }
  })
}

/** Every page of the shop's catalogue. */
async function loadShopProducts(): Promise<ShopProduct[]> {
  const pageSize = 100
  const all: ShopProduct[] = []
  for (let offset = 0; offset < 1000; offset += pageSize) {
    const res = await apiFetch(`/api/suppliers/me/products?pageSize=${pageSize}&offset=${offset}`)
    if (!res.ok)
      break
    const json = await res.json() as { data?: Array<Record<string, unknown>>, meta?: { hasMore?: boolean } }
    const items = json.data ?? []
    all.push(...items.map(p => ({
      id: String(p.id),
      name: String(p.name ?? ''),
      imageUrl: (p.thumbnail as string | null) ?? (p.photo as string | null) ?? null,
      price: Number(p.pricePerUnit ?? 0),
      exportStatus: readExportStatus(p),
    })))
    if (!json.meta?.hasMore || items.length === 0)
      break
  }
  return all
}

function articleCount(count: number): string {
  return `${count} article${count > 1 ? 's' : ''}`
}

// ===== List =====

interface ExportPacksScreenProps {
  onGoBack: () => void
  /** `null` opens an empty form. */
  onOpenPack: (pack: ExportPack | null) => void
  /** Opens « Vendre à l’étranger : le guide ». */
  onOpenGuide?: () => void
}

/**
 * « Packs du pays »: the shop's own bundles for buyers abroad. A pack becomes
 * exportable on its own once its criteria are met, and is sold as one article.
 */
export function ExportPacksScreen({ onGoBack, onOpenPack, onOpenGuide }: ExportPacksScreenProps) {
  const { semantic } = useTheme()
  const tabBarHeight = use(BottomTabBarHeightContext) ?? 0
  const [packs, setPacks] = useState<ExportPack[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)

  const load = useCallback(async () => {
    try {
      const supplierId = await resolveSupplierId()
      if (!supplierId) {
        setLoadFailed(true)
        return
      }
      const res = await apiFetch(`/api/suppliers/${supplierId}/export-packs`)
      if (!res.ok) {
        setLoadFailed(true)
        return
      }
      setPacks(parseExportPacks(await res.json()))
      setLoadFailed(false)
    }
    catch {
      setLoadFailed(true)
    }
    finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  // Statuses change with the products and eBio's withdrawals: reload whenever the screen shows.
  useFocusEffect(useCallback(() => {
    load()
  }, [load]))

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: semantic.bgPage }]}>
        <ActivityIndicator size="large" color={colors.green[400]} />
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader title="Packs du pays" onBack={onGoBack} />
      <ScrollView
        contentContainerStyle={[styles.listContent, { paddingBottom: tabBarHeight + spacing[6] }]}
        showsVerticalScrollIndicator={false}
        refreshControl={(
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              setIsRefreshing(true)
              load()
            }}
            tintColor={colors.green[400]}
          />
        )}
      >
        <View style={[styles.introCard, { backgroundColor: semantic.bgCard }]}>
          <View style={[styles.introIcon, { backgroundColor: colors.earth[50] }]}>
            <Gift size={20} color={colors.earth[600]} />
          </View>
          <View style={styles.introText}>
            <Text style={[styles.introTitle, { color: semantic.textPrimary }]}>Composez vos coffrets</Text>
            <Text style={[styles.introBody, { color: semantic.textSecondary }]}>
              Regroupez plusieurs de vos produits exportables et fixez le prix du pack. Dès qu’il a un nom, un prix, une photo et que tous ses produits sont exportables, il est proposé aux clients à l’étranger.
            </Text>
          </View>
        </View>

        {onOpenGuide
          ? (
              <TouchableOpacity
                style={[styles.guideLink, styles.guideLinkList, { backgroundColor: colors.blue[50] }]}
                onPress={onOpenGuide}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <BookOpen size={18} color={colors.blue[800]} />
                <Text style={[styles.guideLinkText, { color: colors.blue[800] }]}>Vendre à l’étranger : le guide</Text>
                <ChevronRight size={18} color={colors.blue[800]} />
              </TouchableOpacity>
            )
          : null}

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => onOpenPack(null)}
          activeOpacity={0.8}
          accessibilityRole="button"
        >
          <Plus size={16} color={colors.neutral[0]} strokeWidth={2.5} />
          <Text style={styles.primaryButtonText}>Nouveau pack</Text>
        </TouchableOpacity>

        <Text style={[styles.sectionTitle, styles.listSectionTitle, { color: semantic.textTertiary }]}>MES PACKS</Text>

        {loadFailed
          ? (
              <View style={[styles.emptyCard, { backgroundColor: semantic.bgCard }]}>
                <Text style={[styles.emptyText, { color: semantic.textSecondary }]}>
                  Impossible de charger vos packs. Tirez vers le bas pour réessayer.
                </Text>
              </View>
            )
          : packs.length === 0
            ? (
                <View style={[styles.emptyCard, { backgroundColor: semantic.bgCard }]}>
                  <Text style={[styles.emptyText, { color: semantic.textSecondary }]}>
                    Aucun pack pour le moment.
                  </Text>
                </View>
              )
            : packs.map(pack => (
                <TouchableOpacity
                  key={pack.id}
                  style={[styles.packCard, { backgroundColor: semantic.bgCard }, pack.status === 'RETIRED' && styles.retired]}
                  onPress={() => onOpenPack(pack)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Ouvrir le pack ${pack.name}`}
                >
                  {pack.photos[0] ?? pack.items[0]?.imageUrl
                    ? <Image source={{ uri: pack.photos[0] ?? pack.items[0]?.imageUrl ?? undefined }} style={styles.packImage} resizeMode="contain" />
                    : (
                        <View style={[styles.packImage, styles.packImageEmpty]}>
                          <Gift size={22} color={colors.earth[600]} />
                        </View>
                      )}
                  <View style={styles.packBody}>
                    <Text style={[styles.packName, { color: semantic.textPrimary }]} numberOfLines={2}>{pack.name}</Text>
                    <Text style={[styles.packMeta, { color: semantic.textTertiary }]}>
                      {articleCount(pack.items.reduce((sum, item) => sum + item.quantity, 0))}
                    </Text>
                    <Text style={[styles.packPrice, { color: semantic.textPrimary }]}>{formatXof(pack.price)}</Text>
                    <ExportStatusBadge status={pack.status} />
                    {pack.status === 'WITHDRAWN' && pack.withdrawnReason
                      ? <Text style={[styles.rejection, { color: colors.coral[600] }]}>{pack.withdrawnReason}</Text>
                      : null}
                    {pack.status === 'INCOMPLETE' && pack.missingCount > 0
                      ? <Text style={[styles.packMeta, { color: semantic.textSecondary }]}>{`Il manque ${missingLabel(pack.missingCount)}`}</Text>
                      : null}
                  </View>
                </TouchableOpacity>
              ))}
      </ScrollView>
    </View>
  )
}

// ===== Form =====

interface DraftItem {
  productId: string
  variantId: string | null
  quantity: number
  name: string
  imageUrl: string | null
}

interface ExportPackFormProps {
  /** `null` for a new pack. */
  pack: ExportPack | null
  onGoBack: () => void
  /** Called after a save or a withdrawal. */
  onDone: () => void
}

/**
 * Create or edit a shop pack: name, description, photos, price and the
 * export products it bundles, with its criteria shown live. Shows the sum of the products'
 * prices beside the pack price so the shop sees the discount it grants.
 */
export function ExportPackForm({ pack, onGoBack, onDone }: ExportPackFormProps) {
  const { semantic } = useTheme()
  const tabBarHeight = use(BottomTabBarHeightContext) ?? 0

  const [products, setProducts] = useState<ShopProduct[]>([])
  const [isLoadingProducts, setIsLoadingProducts] = useState(true)

  const [name, setName] = useState(pack?.name ?? '')
  const [description, setDescription] = useState(pack?.description ?? '')
  const [photos, setPhotos] = useState<string[]>(pack?.photos ?? [])
  const [price, setPrice] = useState(pack ? String(Math.round(pack.price)) : '')
  const [items, setItems] = useState<DraftItem[]>(pack?.items ?? [])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRetiring, setIsRetiring] = useState(false)

  const readOnly = pack?.status === 'RETIRED'

  useEffect(() => {
    let cancelled = false
    loadShopProducts()
      .then((list) => {
        if (!cancelled)
          setProducts(list)
      })
      .catch(() => {
        // the picker shows its empty state
      })
      .finally(() => {
        if (!cancelled)
          setIsLoadingProducts(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Older APIs do not say which products are offered for export: then every
  // product is offered and the server refuses the others. A product being
  // completed can join a pack; the pack waits for it to become exportable.
  const knowsExportStatus = products.some(p => p.exportStatus !== undefined)
  const eligible = knowsExportStatus ? products.filter(p => p.exportStatus === 'EXPORTABLE' || p.exportStatus === 'INCOMPLETE') : products
  const statusById = new Map(products.map(p => [p.id, p.exportStatus]))
  const selectedIds = new Set(items.map(item => item.productId))
  const available = eligible.filter(p => !selectedIds.has(p.id))
  const priceById = new Map(products.map(p => [p.id, p.price]))

  const itemsTotal = items.reduce((sum, item) => sum + (priceById.get(item.productId) ?? 0) * item.quantity, 0)
  const unknownPrices = items.some(item => !priceById.has(item.productId))
  const priceValue = parsePositiveInt(price)
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0)
  const difference = priceValue !== null ? priceValue - itemsTotal : null

  const isValid = !readOnly
    && name.trim().length >= 2
    && priceValue !== null
    && totalQuantity >= 2

  const criteria = computePackCriteria(
    { name, price: priceValue, photos, itemStatuses: items.map(item => knowsExportStatus ? statusById.get(item.productId) : 'EXPORTABLE') },
    pack?.criteria ?? [],
  )
  const withdrawn = pack?.status === 'WITHDRAWN'

  function addItem(product: ShopProduct): void {
    setItems(prev => [...prev, { productId: product.id, variantId: null, quantity: 1, name: product.name, imageUrl: product.imageUrl }])
  }

  function changeQuantity(productId: string, delta: number): void {
    setItems(prev => prev.map(item => item.productId === productId
      ? { ...item, quantity: Math.min(MAX_ITEM_QUANTITY, Math.max(1, item.quantity + delta)) }
      : item))
  }

  function removeItem(productId: string): void {
    setItems(prev => prev.filter(item => item.productId !== productId))
  }

  async function submit(): Promise<void> {
    if (!isValid || priceValue === null)
      return
    setIsSubmitting(true)
    try {
      const supplierId = await resolveSupplierId()
      if (!supplierId) {
        appAlert('Enregistrement impossible', 'Votre boutique est introuvable. Réessayez dans un instant.')
        return
      }
      const body = {
        name: name.trim(),
        description: description.trim(),
        photos,
        price: priceValue,
        items: items.map(item => (item.variantId
          ? { productId: item.productId, variantId: item.variantId, quantity: item.quantity }
          : { productId: item.productId, quantity: item.quantity })),
      }
      const res = await apiFetch(
        pack ? `/api/suppliers/${supplierId}/export-packs/${pack.id}` : `/api/suppliers/${supplierId}/export-packs`,
        { method: pack ? 'PATCH' : 'POST', body: JSON.stringify(body) },
      )
      if (!res.ok) {
        appAlert('Enregistrement impossible', await readExportError(res))
        return
      }
      const saved = parseExportPacks([await res.json().catch(() => null)])[0]
      if (saved?.status === 'EXPORTABLE') {
        appAlert('Pack exportable', 'Votre pack est exportable : il apparaît dans la Valise du pays.', [{ text: 'Parfait', onPress: onDone }])
      }
      else if (saved?.status === 'WITHDRAWN') {
        appAlert('Modifications enregistrées', 'Le pack reste retiré par eBio. Une fois tout corrigé, contactez eBio : c’est eBio qui le remet en vente à l’étranger.', [{ text: 'OK', onPress: onDone }])
      }
      else if (saved && saved.missingCount > 0) {
        appAlert(
          `Encore ${missingLabel(saved.missingCount)} à compléter`,
          'Votre pack est enregistré. Il sera proposé à l’étranger dès que tous les points de sa liste seront cochés.',
          [{ text: 'OK', onPress: onDone }],
        )
      }
      else {
        appAlert('Pack enregistré', undefined, [{ text: 'OK', onPress: onDone }])
      }
    }
    catch {
      appAlert('Enregistrement impossible', 'Vérifiez votre connexion et réessayez.')
    }
    finally {
      setIsSubmitting(false)
    }
  }

  async function retire(): Promise<void> {
    if (!pack)
      return
    setIsRetiring(true)
    try {
      const supplierId = await resolveSupplierId()
      if (!supplierId) {
        appAlert('Archivage impossible', 'Votre boutique est introuvable. Réessayez dans un instant.')
        return
      }
      const res = await apiFetch(`/api/suppliers/${supplierId}/export-packs/${pack.id}`, { method: 'DELETE' })
      if (!res.ok) {
        appAlert('Archivage impossible', await readExportError(res))
        return
      }
      onDone()
    }
    catch {
      appAlert('Archivage impossible', 'Vérifiez votre connexion et réessayez.')
    }
    finally {
      setIsRetiring(false)
    }
  }

  function confirmRetire(): void {
    appAlert('Archiver ce pack ?', 'Il ne sera plus proposé aux clients à l’étranger et ne pourra plus être modifié. Vous pourrez en composer un nouveau à tout moment.', [
      { text: 'Archiver le pack', style: 'destructive', onPress: retire },
      { text: 'Annuler', style: 'cancel' },
    ])
  }

  const inputStyle = [styles.input, { color: semantic.textPrimary, backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }]

  return (
    <KeyboardAwareView style={[styles.container, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader title={pack ? 'Modifier le pack' : 'Nouveau pack'} onBack={onGoBack} />
      <ScrollView
        contentContainerStyle={[styles.formContent, { paddingBottom: tabBarHeight + spacing[10] }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {pack
          ? (
              <View style={[styles.statusCard, { backgroundColor: semantic.bgCard }]}>
                <ExportStatusBadge status={pack.status} />
                <Text style={[styles.helper, { color: semantic.textSecondary }]}>
                  {readOnly
                    ? 'Ce pack est archivé : il n’est plus proposé à l’étranger.'
                    : 'Le pack est proposé à l’étranger dès que tous les points ci-dessous sont remplis.'}
                </Text>
              </View>
            )
          : null}

        {withdrawn
          ? (
              <View style={[styles.reason, styles.withdrawnCard, { backgroundColor: colors.coral[50], borderColor: colors.coral[200] }]}>
                <View style={styles.withdrawnHead}>
                  <CircleX size={18} color={colors.coral[800]} />
                  <Text style={[styles.reasonTitle, { color: colors.coral[800] }]}>Retiré par eBio</Text>
                </View>
                {pack?.withdrawnReason
                  ? <Text style={[styles.reasonText, { color: colors.coral[800] }]}>{`Motif : ${pack.withdrawnReason}`}</Text>
                  : null}
                <Text style={[styles.reasonText, { color: colors.coral[800] }]}>
                  Corrigez puis contactez eBio : c’est eBio qui remet le pack en vente à l’étranger.
                </Text>
              </View>
            )
          : null}

        {!readOnly
          ? (
              <View style={styles.criteriaBlock}>
                <ExportCriteriaList
                  criteria={criteria}
                  doneText={withdrawn ? 'Tous les points sont remplis' : 'Tout est prêt : le pack est exportable'}
                />
              </View>
            )
          : null}

        <Text style={[styles.label, { color: semantic.textSecondary }]}>Nom du pack</Text>
        <TextInput
          style={inputStyle}
          value={name}
          onChangeText={setName}
          maxLength={NAME_MAX}
          editable={!readOnly}
          placeholder="Ex. Pack beauté karité"
          placeholderTextColor={semantic.textTertiary}
          accessibilityLabel="Nom du pack"
        />

        <Text style={[styles.label, { color: semantic.textSecondary }]}>Description (facultatif)</Text>
        <TextInput
          style={[...inputStyle, styles.multiline]}
          value={description}
          onChangeText={setDescription}
          maxLength={DESCRIPTION_MAX}
          editable={!readOnly}
          multiline
          textAlignVertical="top"
          placeholder="Ce que contient le coffret, pour qui il est pensé"
          placeholderTextColor={semantic.textTertiary}
          accessibilityLabel="Description du pack"
        />

        <Text style={[styles.label, { color: semantic.textSecondary }]}>{`Photos (au moins une, jusqu’à ${MAX_PACK_PHOTOS})`}</Text>
        {readOnly
          ? (
              <View style={styles.photoRow}>
                {photos.map(uri => <Image key={uri} source={{ uri }} style={styles.photoThumb} resizeMode="contain" />)}
              </View>
            )
          : <ExportPhotoPicker photos={photos} onChange={setPhotos} max={MAX_PACK_PHOTOS} noun="photo du pack" />}

        {/* Composition */}
        <Text style={[styles.sectionTitle, { color: semantic.textTertiary }]}>COMPOSITION</Text>
        {items.length === 0
          ? (
              <Text style={[styles.helper, { color: semantic.textSecondary }]}>
                Un pack réunit au moins deux articles : ajoutez vos produits ci-dessous.
              </Text>
            )
          : (
              <View style={[styles.itemsCard, { backgroundColor: semantic.bgCard }]}>
                {items.map((item, index) => {
                  const unitPrice = priceById.get(item.productId)
                  return (
                    <View
                      key={item.productId}
                      style={[styles.itemRow, index > 0 && { borderTopWidth: 1, borderTopColor: semantic.borderLight }]}
                    >
                      {item.imageUrl
                        ? <Image source={{ uri: item.imageUrl }} style={styles.itemThumb} resizeMode="contain" />
                        : (
                            <View style={[styles.itemThumb, styles.itemThumbEmpty]}>
                              <Package size={16} color={colors.green[600]} />
                            </View>
                          )}
                      <View style={styles.itemText}>
                        <Text style={[styles.itemName, { color: semantic.textPrimary }]} numberOfLines={2}>{item.name}</Text>
                        <Text style={[styles.itemPrice, { color: semantic.textTertiary }]}>
                          {unitPrice !== undefined ? `${formatXof(unitPrice)} / unité` : 'Prix indisponible'}
                        </Text>
                        {knowsExportStatus && statusById.get(item.productId) !== 'EXPORTABLE'
                          ? <Text style={[styles.itemWarning, { color: semantic.textSecondary }]}>Produit à compléter avant l’export</Text>
                          : null}
                      </View>
                      {readOnly
                        ? <Text style={[styles.quantity, { color: semantic.textPrimary }]}>{`× ${item.quantity}`}</Text>
                        : (
                            <View style={styles.stepper}>
                              <TouchableOpacity
                                style={[styles.stepperButton, { borderColor: semantic.borderNormal }, item.quantity <= 1 && styles.disabled]}
                                onPress={() => changeQuantity(item.productId, -1)}
                                disabled={item.quantity <= 1}
                                accessibilityRole="button"
                                accessibilityLabel={`Retirer un ${item.name}`}
                              >
                                <Minus size={16} color={semantic.textPrimary} />
                              </TouchableOpacity>
                              <Text style={[styles.quantity, { color: semantic.textPrimary }]} accessibilityLabel={`Quantité : ${item.quantity}`}>
                                {item.quantity}
                              </Text>
                              <TouchableOpacity
                                style={[styles.stepperButton, { borderColor: semantic.borderNormal }]}
                                onPress={() => changeQuantity(item.productId, 1)}
                                accessibilityRole="button"
                                accessibilityLabel={`Ajouter un ${item.name}`}
                              >
                                <Plus size={16} color={semantic.textPrimary} />
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.removeButton}
                                onPress={() => removeItem(item.productId)}
                                accessibilityRole="button"
                                accessibilityLabel={`Enlever ${item.name} du pack`}
                              >
                                <Trash2 size={18} color={colors.coral[600]} />
                              </TouchableOpacity>
                            </View>
                          )}
                    </View>
                  )
                })}
              </View>
            )}

        {!readOnly
          ? (
              <>
                <Text style={[styles.label, { color: semantic.textSecondary }]}>Ajouter un produit proposé à l’export</Text>
                {isLoadingProducts
                  ? <ActivityIndicator size="small" color={colors.green[400]} />
                  : available.length === 0
                    ? (
                        <Text style={[styles.helper, { color: semantic.textSecondary }]}>
                          {eligible.length === 0
                            ? 'Aucun produit proposé à l’export. Ouvrez un produit et touchez « Vendre à l’étranger » pour le préparer.'
                            : 'Tous vos produits proposés à l’export sont déjà dans le pack.'}
                        </Text>
                      )
                    : (
                        <View style={[styles.itemsCard, { backgroundColor: semantic.bgCard }]}>
                          {available.map((product, index) => (
                            <TouchableOpacity
                              key={product.id}
                              style={[styles.itemRow, index > 0 && { borderTopWidth: 1, borderTopColor: semantic.borderLight }]}
                              onPress={() => addItem(product)}
                              accessibilityRole="button"
                              accessibilityLabel={`Ajouter ${product.name} au pack`}
                            >
                              {product.imageUrl
                                ? <Image source={{ uri: product.imageUrl }} style={styles.itemThumb} resizeMode="contain" />
                                : (
                                    <View style={[styles.itemThumb, styles.itemThumbEmpty]}>
                                      <Package size={16} color={colors.green[600]} />
                                    </View>
                                  )}
                              <View style={styles.itemText}>
                                <Text style={[styles.itemName, { color: semantic.textPrimary }]} numberOfLines={2}>{product.name}</Text>
                                <Text style={[styles.itemPrice, { color: semantic.textTertiary }]}>{formatXof(product.price)}</Text>
                                {product.exportStatus === 'INCOMPLETE'
                                  ? <Text style={[styles.itemWarning, { color: semantic.textSecondary }]}>À compléter</Text>
                                  : null}
                              </View>
                              <Plus size={18} color={colors.green[600]} strokeWidth={2.5} />
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                {!knowsExportStatus && products.length > 0
                  ? (
                      <Text style={[styles.helper, { color: semantic.textTertiary }]}>
                        Seuls les produits exportables rendent le pack commandable.
                      </Text>
                    )
                  : null}
              </>
            )
          : null}

        {/* Price */}
        <Text style={[styles.sectionTitle, { color: semantic.textTertiary }]}>PRIX</Text>
        <Text style={[styles.label, { color: semantic.textSecondary }]}>Prix du pack (FCFA)</Text>
        <TextInput
          style={[...inputStyle, styles.priceInput]}
          keyboardType="number-pad"
          value={price}
          onChangeText={text => setPrice(text.replace(/\D/g, '').slice(0, 9))}
          editable={!readOnly}
          placeholder="Ex. 15000"
          placeholderTextColor={semantic.textTertiary}
          accessibilityLabel="Prix du pack en francs CFA"
        />
        <View style={[styles.summaryCard, { backgroundColor: semantic.bgCard }]}>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: semantic.textSecondary }]}>Somme des produits</Text>
            <Text style={[styles.summaryAmount, { color: semantic.textPrimary }]}>{formatXof(itemsTotal)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: semantic.textSecondary }]}>Prix du pack</Text>
            <Text style={[styles.summaryAmount, { color: semantic.textPrimary }]}>{priceValue !== null ? formatXof(priceValue) : '-'}</Text>
          </View>
          {difference !== null && items.length > 0
            ? (
                <Text style={[styles.helper, { color: semantic.textSecondary }]}>
                  {difference < 0
                    ? `Remise accordée aux clients : ${formatXof(-difference)}.`
                    : difference > 0
                      ? `Le pack coûte ${formatXof(difference)} de plus que ses produits achetés séparément.`
                      : 'Le pack coûte exactement la somme de ses produits.'}
                </Text>
              )
            : null}
          {unknownPrices
            ? (
                <Text style={[styles.helper, { color: semantic.textTertiary }]}>
                  Certains produits n'ont pas de prix connu : ils ne sont pas comptés dans la somme.
                </Text>
              )
            : null}
        </View>

        {!readOnly
          ? (
              <>
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
                    : <Text style={styles.submitButtonText}>Enregistrer</Text>}
                </TouchableOpacity>
                {!isValid
                  ? (
                      <Text style={[styles.helper, styles.centered, { color: semantic.textTertiary }]}>
                        Un nom, un prix et au moins deux articles sont nécessaires.
                      </Text>
                    )
                  : null}
              </>
            )
          : null}

        {pack && !readOnly
          ? (
              <TouchableOpacity
                style={[styles.withdrawButton, isRetiring && styles.disabled]}
                onPress={confirmRetire}
                disabled={isRetiring}
                activeOpacity={0.8}
                accessibilityRole="button"
              >
                {isRetiring
                  ? <ActivityIndicator size="small" color={colors.coral[600]} />
                  : <Text style={styles.withdrawButtonText}>Archiver le pack</Text>}
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
  listContent: { paddingTop: spacing[2] },
  formContent: { paddingHorizontal: spacing[4], paddingTop: spacing[2] },

  introCard: {
    flexDirection: 'row',
    gap: spacing[3],
    marginHorizontal: spacing[4],
    padding: spacing[4],
    borderRadius: radius.lg,
  },
  introIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  introText: { flex: 1, gap: spacing[1] },
  introTitle: { ...typography.h3 },
  introBody: { ...typography.bodyS },

  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    marginHorizontal: spacing[4],
    marginTop: spacing[3],
    minHeight: 48,
    backgroundColor: colors.green[400],
    borderRadius: radius.md,
    paddingVertical: spacing[3],
  },
  primaryButtonText: { ...typography.h3, color: colors.neutral[0] },

  sectionTitle: { ...typography.overline, marginTop: spacing[6], marginBottom: spacing[2] },
  listSectionTitle: { paddingHorizontal: spacing[4] },
  emptyCard: { marginHorizontal: spacing[4], padding: spacing[4], borderRadius: radius.lg },
  emptyText: { ...typography.bodyS, textAlign: 'center' },

  packCard: {
    flexDirection: 'row',
    gap: spacing[3],
    marginHorizontal: spacing[4],
    marginBottom: spacing[3],
    padding: spacing[3],
    borderRadius: radius.lg,
  },
  retired: { opacity: 0.6 },
  packImage: { width: 72, height: 72, borderRadius: radius.md, backgroundColor: colors.neutral[100] },
  packImageEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.earth[50] },
  packBody: { flex: 1, gap: spacing[1] },
  packName: { ...typography.h3 },
  packMeta: { ...typography.caption },
  packPrice: { ...typography.price },
  rejection: { ...typography.bodyS },

  statusCard: { borderRadius: radius.lg, padding: spacing[4], gap: spacing[2] },
  reason: { borderRadius: radius.md, padding: spacing[3], gap: spacing[1] },
  reasonTitle: { ...typography.caption, fontFamily: fonts.sansSb },
  reasonText: { ...typography.bodyS },
  withdrawnCard: { marginTop: spacing[3], borderWidth: 1 },
  withdrawnHead: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  criteriaBlock: { marginTop: spacing[3] },
  itemWarning: { ...typography.caption },
  guideLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
  },
  guideLinkList: { marginHorizontal: spacing[4], marginTop: spacing[3] },
  guideLinkText: { ...typography.bodyS, fontFamily: fonts.sansSb, flex: 1 },

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
  multiline: { minHeight: 96 },
  priceInput: { fontFamily: fonts.mono },
  photoRow: { flexDirection: 'row', gap: spacing[2] },
  photoThumb: { width: 88, height: 88, borderRadius: radius.md, backgroundColor: colors.neutral[100] },

  itemsCard: { borderRadius: radius.lg, paddingHorizontal: spacing[3] },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], minHeight: 60, paddingVertical: spacing[2] },
  itemThumb: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.neutral[100] },
  itemThumbEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.green[50] },
  itemText: { flex: 1, gap: 2 },
  itemName: { ...typography.bodyS, fontFamily: fonts.sansSb },
  itemPrice: { ...typography.caption, fontFamily: fonts.mono },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  stepperButton: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantity: { ...typography.bodyL, fontFamily: fonts.mono, minWidth: 24, textAlign: 'center' },
  removeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

  summaryCard: { marginTop: spacing[3], padding: spacing[4], borderRadius: radius.lg, gap: spacing[2] },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing[2] },
  summaryLabel: { ...typography.bodyS },
  summaryAmount: { ...typography.price },

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
