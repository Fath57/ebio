import type { ExportPack } from '../utils/terroir-export'
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs'
import { useFocusEffect } from '@react-navigation/native'
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
import { parsePositiveInt, readExportError, resolveSupplierId } from '../utils/terroir-export'
import { ExportPhotoPicker } from './export-photo-picker'
import { ExportStatusBadge } from './export-status-badge'

const NAME_MAX = 120
const DESCRIPTION_MAX = 1000
const MAX_PACK_PHOTOS = 3
const MAX_ITEM_QUANTITY = 99

// ===== Shared loading =====

/** Reads the untyped pack list; tolerant of a `{ items }` envelope. */
function parsePacks(raw: unknown): ExportPack[] {
  const list = Array.isArray(raw)
    ? raw
    : (raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown }).items) ? (raw as { items: unknown[] }).items : [])
  return (list as Array<Record<string, unknown>>).map(p => ({
    id: String(p.id),
    name: String(p.name ?? ''),
    description: typeof p.description === 'string' ? p.description : null,
    photos: Array.isArray(p.photos) ? (p.photos as unknown[]).filter((u): u is string => typeof u === 'string') : [],
    price: Number(p.price ?? 0),
    status: (p.status as ExportPack['status']) ?? 'PENDING',
    rejectionReason: typeof p.rejectionReason === 'string' ? p.rejectionReason : null,
    items: (Array.isArray(p.items) ? p.items as Array<Record<string, unknown>> : []).map(item => ({
      productId: String(item.productId),
      variantId: typeof item.variantId === 'string' ? item.variantId : null,
      quantity: Number(item.quantity ?? 1),
      name: String(item.name ?? ''),
      imageUrl: typeof item.imageUrl === 'string' ? item.imageUrl : null,
    })),
  }))
}

interface ShopProduct {
  id: string
  name: string
  imageUrl: string | null
  price: number
  /** Export verdict when the API tells it, `undefined` when it does not. */
  exportStatus: string | null | undefined
}

function readExportStatus(p: Record<string, unknown>): string | null | undefined {
  if (typeof p.exportStatus === 'string')
    return p.exportStatus
  if ('exportProfile' in p) {
    const profile = p.exportProfile as { status?: unknown } | null
    return typeof profile?.status === 'string' ? profile.status : null
  }
  if ('exportStatus' in p)
    return null
  return undefined
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
}

/**
 * « Packs terroir »: the shop's own bundles for buyers abroad, with eBio's
 * verdict. A pack is validated like a product and sold as one article.
 */
export function ExportPacksScreen({ onGoBack, onOpenPack }: ExportPacksScreenProps) {
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
      setPacks(parsePacks(await res.json()))
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

  // Verdicts come from the back-office: reload whenever the screen shows.
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
      <ScreenHeader title="Packs terroir" onBack={onGoBack} />
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
              Regroupez plusieurs de vos produits validés pour l'export et fixez le prix du pack. eBio le valide avant qu'il soit proposé aux clients en France et en Belgique.
            </Text>
          </View>
        </View>

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
                    {pack.status === 'REJECTED' && pack.rejectionReason
                      ? <Text style={[styles.rejection, { color: colors.coral[600] }]}>{pack.rejectionReason}</Text>
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
 * export-validated products it bundles. Shows the sum of the products'
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

  // Older APIs do not say which products are validated for export: then every
  // product is offered and eBio's review catches the rest.
  const knowsExportStatus = products.some(p => p.exportStatus !== undefined)
  const eligible = knowsExportStatus ? products.filter(p => p.exportStatus === 'APPROVED') : products
  const selectedIds = new Set(items.map(item => item.productId))
  const available = eligible.filter(p => !selectedIds.has(p.id))
  const priceById = new Map(products.map(p => [p.id, p.price]))

  const itemsTotal = items.reduce((sum, item) => sum + (priceById.get(item.productId) ?? 0) * item.quantity, 0)
  const unknownPrices = items.some(item => !priceById.has(item.productId))
  const priceValue = parsePositiveInt(price)
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0)
  const difference = priceValue !== null ? priceValue - itemsTotal : null

  const isValid = !readOnly
    && name.trim().length > 0
    && priceValue !== null
    && totalQuantity >= 2

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
        appAlert('Envoi impossible', 'Votre boutique est introuvable. Réessayez dans un instant.')
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
        appAlert('Pack refusé', await readExportError(res))
        return
      }
      appAlert(
        pack ? 'Pack modifié' : 'Pack envoyé',
        'eBio vérifie votre pack avant de le proposer aux clients à l\'étranger. Vous serez prévenu de sa validation.',
      )
      onDone()
    }
    catch {
      appAlert('Envoi impossible', 'Vérifiez votre connexion et réessayez.')
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
        appAlert('Retrait impossible', 'Votre boutique est introuvable. Réessayez dans un instant.')
        return
      }
      const res = await apiFetch(`/api/suppliers/${supplierId}/export-packs/${pack.id}`, { method: 'DELETE' })
      if (!res.ok) {
        appAlert('Retrait impossible', await readExportError(res))
        return
      }
      onDone()
    }
    catch {
      appAlert('Retrait impossible', 'Vérifiez votre connexion et réessayez.')
    }
    finally {
      setIsRetiring(false)
    }
  }

  function confirmRetire(): void {
    appAlert('Retirer ce pack ?', 'Il ne sera plus proposé aux clients à l\'étranger. Vous pourrez en composer un nouveau à tout moment.', [
      { text: 'Retirer le pack', style: 'destructive', onPress: retire },
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
                {pack.status === 'REJECTED' && pack.rejectionReason
                  ? (
                      <View style={[styles.reason, { backgroundColor: colors.coral[50] }]}>
                        <Text style={[styles.reasonTitle, { color: colors.coral[800] }]}>Motif du refus</Text>
                        <Text style={[styles.reasonText, { color: colors.coral[800] }]}>{pack.rejectionReason}</Text>
                      </View>
                    )
                  : null}
                <Text style={[styles.helper, { color: semantic.textSecondary }]}>
                  {readOnly
                    ? 'Ce pack est retiré : il n\'est plus proposé à l\'étranger.'
                    : 'Toute modification renvoie le pack en validation.'}
                </Text>
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

        <Text style={[styles.label, { color: semantic.textSecondary }]}>{`Photos (jusqu'à ${MAX_PACK_PHOTOS})`}</Text>
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
                <Text style={[styles.label, { color: semantic.textSecondary }]}>Ajouter un produit validé pour l'export</Text>
                {isLoadingProducts
                  ? <ActivityIndicator size="small" color={colors.green[400]} />
                  : available.length === 0
                    ? (
                        <Text style={[styles.helper, { color: semantic.textSecondary }]}>
                          {eligible.length === 0
                            ? 'Aucun produit validé pour l\'export. Ouvrez un produit et touchez « Vendre à l\'étranger » pour le proposer.'
                            : 'Tous vos produits validés sont déjà dans le pack.'}
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
                              </View>
                              <Plus size={18} color={colors.green[600]} strokeWidth={2.5} />
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                {!knowsExportStatus && products.length > 0
                  ? (
                      <Text style={[styles.helper, { color: semantic.textTertiary }]}>
                        Seuls les produits validés pour l'export rendent le pack commandable.
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
                    : <Text style={styles.submitButtonText}>{pack ? 'Enregistrer et renvoyer en validation' : 'Envoyer pour validation'}</Text>}
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
                  : <Text style={styles.withdrawButtonText}>Retirer le pack</Text>}
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
