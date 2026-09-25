import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs'
import Check from 'lucide-react-native/dist/esm/icons/check'
import ImagePlus from 'lucide-react-native/dist/esm/icons/image-plus'
import Package from 'lucide-react-native/dist/esm/icons/package'
import Store from 'lucide-react-native/dist/esm/icons/store'
import { use, useCallback, useEffect, useState } from 'react'
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
import { useMediaUpload } from '../../media/hooks/use-media-upload'
import { readApiError } from '../utils/read-api-error'
import { MIN_TOPUP, SupplierTopupSheet } from './supplier-topup-sheet'

const TITLE_MAX = 60
const SUBTITLE_MAX = 80
/** Top-ups are rounded up to this step so the shop keeps a little slack. */
const TOPUP_STEP = 500

interface BannerOffer {
  days: number
  price: number
}

interface ProductOption {
  id: string
  name: string
  photoUri: string | null
}

type TargetType = 'SUPPLIER' | 'PRODUCT'

/** Delay in days before the banner should go live; `0` = as soon as eBio approves it. */
const START_OPTIONS: Array<{ delay: number, label: string }> = [
  { delay: 0, label: 'Dès validation' },
  { delay: 3, label: 'Dans 3 jours' },
  { delay: 7, label: 'Dans 7 jours' },
]
const MAX_START_DELAY_DAYS = 60
/** Rows shown in the product picker before asking to refine the search. */
const PRODUCT_ROWS = 8

/** Every page of the catalogue: a shop may list far more than one page. */
async function loadAllProducts(): Promise<Array<Record<string, unknown>>> {
  const pageSize = 100
  const all: Array<Record<string, unknown>> = []
  for (let offset = 0; offset < 1000; offset += pageSize) {
    const res = await apiFetch(`/api/suppliers/me/products?pageSize=${pageSize}&offset=${offset}`)
    if (!res.ok) {
      break
    }
    const json = await res.json() as { data?: Array<Record<string, unknown>>, meta?: { hasMore?: boolean } } | Array<Record<string, unknown>>
    const items = (Array.isArray(json) ? json : json.data ?? []) as Array<Record<string, unknown>>
    all.push(...items)
    if (Array.isArray(json) || !json.meta?.hasMore || items.length === 0) {
      break
    }
  }
  return all
}

function formatAmount(value: number): string {
  return `${value.toLocaleString('fr-FR')} FCFA`
}

/** Amount to top up so the wallet covers `price`, rounded up to the next step. */
export function computeMissingTopup(price: number, balance: number): number {
  const missing = Math.max(0, price - balance)
  const rounded = Math.ceil(missing / TOPUP_STEP) * TOPUP_STEP
  return Math.max(rounded, MIN_TOPUP)
}

/**
 * What the shop is buying.
 *
 * A banner and an announcement are requested the same way — artwork, a target,
 * a duration taken from a price grid, paid up front from the wallet. Only the
 * wording, the rates and where the request is filed differ, and that is
 * exactly what this object carries.
 */
const KINDS = {
  banner: {
    screenTitle: 'Demander une bannière',
    lead: 'Votre visuel en haut de l\'accueil, pendant la durée choisie.',
    offersFrom: 'settings',
    endpoint: '/api/suppliers/me/banner-requests',
    noun: 'bannière',
    approvalNote: 'eBio valide votre bannière sous 24 h.',
  },
  announcement: {
    screenTitle: 'Demander une annonce',
    lead: 'Votre message s\'affiche à l\'ouverture de l\'application, une fois par jour et par acheteur.',
    offersFrom: 'announcements',
    endpoint: '/api/suppliers/me/announcement-requests',
    noun: 'annonce',
    approvalNote: 'eBio valide votre annonce sous 24 h.',
  },
} as const

export type RequestKind = keyof typeof KINDS

interface BannerRequestFormProps {
  onGoBack: () => void
  /** Called once the request has been created (and paid). */
  onCreated: () => void
  /** Banner by default: that is what this form used to do. */
  kind?: RequestKind
}

/**
 * New sponsored banner request: 2:1 visual, copy, target (shop or product),
 * offer and optional start date. The price is debited from the shop wallet on
 * submit; when the balance is short, a FedaPay top-up is proposed and the
 * submission retried once it is confirmed.
 */
export function BannerRequestForm({ onGoBack, onCreated, kind = 'banner' }: BannerRequestFormProps) {
  const config = KINDS[kind]
  const { semantic } = useTheme()
  const { uploading, pickAndUpload } = useMediaUpload({ context: 'BANNER_IMAGE', aspect: [2, 1] })

  const [offers, setOffers] = useState<BannerOffer[]>([])
  const [balance, setBalance] = useState<number | null>(null)
  const [products, setProducts] = useState<ProductOption[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [targetType, setTargetType] = useState<TargetType>('SUPPLIER')
  const [targetId, setTargetId] = useState<string | null>(null)
  const [durationDays, setDurationDays] = useState<number | null>(null)
  const [startDelay, setStartDelay] = useState(0)
  const [customDelay, setCustomDelay] = useState(false)
  const [customDelayText, setCustomDelayText] = useState('')
  const [productQuery, setProductQuery] = useState('')
  const tabBarHeight = use(BottomTabBarHeightContext) ?? 0

  const [isSubmitting, setIsSubmitting] = useState(false)
  // Insufficient balance: the sheet opens pre-filled with what is missing and
  // the submission is retried after the top-up is verified.
  const [topupAmount, setTopupAmount] = useState<number | null>(null)

  const loadBalance = useCallback(async (): Promise<number | null> => {
    try {
      const res = await apiFetch('/api/suppliers/me/wallet')
      if (!res.ok) {
        return null
      }
      const data = await res.json() as { balance: number }
      setBalance(data.balance)
      return data.balance
    }
    catch {
      return null
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [settingsRes, allProducts] = await Promise.all([
          apiFetch(config.offersFrom === 'settings'
            ? '/api/settings/public'
            : '/api/suppliers/me/announcement-requests/offers'),
          loadAllProducts(),
        ])
        if (cancelled) {
          return
        }
        if (settingsRes.ok) {
          const data = await settingsRes.json() as { bannerOffers?: { offers?: BannerOffer[] }, offers?: BannerOffer[] }
          const list = data.bannerOffers?.offers ?? data.offers ?? []
          setOffers(list)
          setDurationDays(list[0]?.days ?? null)
        }
        {
          const items = allProducts
          setProducts(items.map(p => ({
            id: p.id as string,
            name: p.name as string,
            photoUri: (p.thumbnail as string | null) ?? (p.photo as string | null) ?? null,
          })))
        }
        await loadBalance()
      }
      catch {
        // the form still renders; the summary line shows "solde inconnu"
      }
      finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [loadBalance])

  const selectedOffer = offers.find(offer => offer.days === durationDays) ?? null
  const price = selectedOffer?.price ?? 0
  const normalizedQuery = productQuery.trim().toLowerCase()
  const matchingProducts = normalizedQuery
    ? products.filter(p => p.name.toLowerCase().includes(normalizedQuery))
    : products
  // The chosen product stays visible whatever the search says.
  const visibleProducts = [
    ...matchingProducts.filter(p => p.id === targetId),
    ...matchingProducts.filter(p => p.id !== targetId),
  ].slice(0, PRODUCT_ROWS)
  const hiddenProducts = Math.max(0, matchingProducts.length - visibleProducts.length)
  const customDelayValid = !customDelay || (Number(customDelayText) >= 1 && Number(customDelayText) <= MAX_START_DELAY_DAYS)
  const isValid = customDelayValid
    && imageUrl !== null
    && title.trim().length > 0
    && title.trim().length <= TITLE_MAX
    && subtitle.trim().length <= SUBTITLE_MAX
    && selectedOffer !== null
    && (targetType === 'SUPPLIER' || targetId !== null)

  async function handlePickImage(): Promise<void> {
    const result = await pickAndUpload()
    if (result?.publicUrl) {
      setImageUrl(result.publicUrl)
    }
    else if (result) {
      appAlert('Image indisponible', 'L’image a été envoyée mais son adresse publique est introuvable. Réessayez.')
    }
  }

  function selectTarget(type: TargetType): void {
    setTargetType(type)
    if (type === 'SUPPLIER') {
      setTargetId(null)
    }
  }

  const submit = useCallback(async (knownBalance: number | null) => {
    if (!isValid || !selectedOffer) {
      return
    }
    setIsSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        imageUrl,
        targetType,
        durationDays: selectedOffer.days,
      }
      if (subtitle.trim()) {
        body.subtitle = subtitle.trim()
      }
      if (targetType === 'PRODUCT' && targetId) {
        body.targetId = targetId
      }
      const effectiveDelay = customDelay ? Number(customDelayText) || 0 : startDelay
      if (effectiveDelay > 0) {
        body.requestedStartAt = new Date(Date.now() + effectiveDelay * 24 * 60 * 60 * 1000).toISOString()
      }
      const res = await apiFetch(config.endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const message = await readApiError(res)
        if (res.status === 400 && /solde insuffisant/i.test(message)) {
          const current = knownBalance ?? (await loadBalance()) ?? 0
          setTopupAmount(computeMissingTopup(selectedOffer.price, current))
          return
        }
        appAlert('Demande refusée', message)
        return
      }
      appAlert(
        'Demande envoyée',
        `${formatAmount(selectedOffer.price)} ont été débités de votre portefeuille. ${config.approvalNote}`,
      )
      onCreated()
    }
    catch {
      appAlert('Envoi impossible', 'Vérifiez votre connexion et réessayez.')
    }
    finally {
      setIsSubmitting(false)
    }
  }, [isValid, selectedOffer, title, imageUrl, targetType, subtitle, targetId, startDelay, customDelay, customDelayText, loadBalance, onCreated])

  const handleTopupVerified = useCallback((newBalance: number) => {
    setBalance(newBalance)
    setTopupAmount(null)
    // The wallet now covers the price: send the same request again.
    submit(newBalance)
  }, [submit])

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: semantic.bgPage }]}>
        <ActivityIndicator size="large" color={colors.green[400]} />
      </View>
    )
  }

  const chipStyle = (selected: boolean) => [
    styles.chip,
    {
      backgroundColor: selected ? colors.green[50] : semantic.bgSurface,
      borderColor: selected ? colors.green[400] : semantic.borderNormal,
    },
  ]
  const chipTextStyle = (selected: boolean) => [
    styles.chipText,
    { color: selected ? colors.green[800] : semantic.textPrimary },
  ]

  return (
    <KeyboardAwareView style={[styles.container, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader title={config.screenTitle} onBack={onGoBack} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + spacing[10] }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Visual */}
        <Text style={[styles.label, { color: semantic.textSecondary }]}>Visuel (format 2:1)</Text>
        <TouchableOpacity
          style={[styles.imagePicker, { borderColor: semantic.borderNormal, backgroundColor: semantic.bgSurface }, uploading && styles.disabled]}
          onPress={handlePickImage}
          disabled={uploading}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={imageUrl ? 'Changer le visuel' : 'Choisir un visuel'}
        >
          {imageUrl
            ? <Image source={{ uri: imageUrl }} style={styles.imagePreview} resizeMode="cover" />
            : (
                <View style={styles.imagePlaceholder}>
                  {uploading
                    ? <ActivityIndicator size="small" color={colors.green[400]} />
                    : <ImagePlus size={28} color={semantic.textTertiary} strokeWidth={1.5} />}
                  <Text style={[styles.imageHint, { color: semantic.textTertiary }]}>
                    {uploading ? 'Envoi en cours…' : 'Choisir une image dans la galerie'}
                  </Text>
                </View>
              )}
          {imageUrl && uploading
            ? (
                <View style={styles.imageOverlay}>
                  <ActivityIndicator size="small" color={colors.neutral[0]} />
                </View>
              )
            : null}
        </TouchableOpacity>
        {imageUrl
          ? <Text style={[styles.helper, { color: semantic.textTertiary }]}>Touchez l’image pour la remplacer.</Text>
          : null}

        {/* Copy */}
        <Text style={[styles.label, { color: semantic.textSecondary }]}>Titre</Text>
        <TextInput
          style={[styles.input, { color: semantic.textPrimary, backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }]}
          placeholder="Ex. Paniers de saison à -20 %"
          placeholderTextColor={semantic.textTertiary}
          value={title}
          onChangeText={setTitle}
          maxLength={TITLE_MAX}
          accessibilityLabel={`Titre de l\u2019${config.noun}`}
        />
        <Text style={[styles.counter, { color: semantic.textTertiary }]}>{`${title.length}/${TITLE_MAX}`}</Text>

        <Text style={[styles.label, { color: semantic.textSecondary }]}>Sous-titre (optionnel)</Text>
        <TextInput
          style={[styles.input, { color: semantic.textPrimary, backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }]}
          placeholder="Ex. Livraison offerte cette semaine"
          placeholderTextColor={semantic.textTertiary}
          value={subtitle}
          onChangeText={setSubtitle}
          maxLength={SUBTITLE_MAX}
          accessibilityLabel={`Sous-titre de l\u2019${config.noun}`}
        />
        <Text style={[styles.counter, { color: semantic.textTertiary }]}>{`${subtitle.length}/${SUBTITLE_MAX}`}</Text>

        {/* Target */}
        <Text style={[styles.label, { color: semantic.textSecondary }]}>En touchant la bannière, le client ouvre</Text>
        <View style={styles.chipRow}>
          <TouchableOpacity
            style={chipStyle(targetType === 'SUPPLIER')}
            onPress={() => selectTarget('SUPPLIER')}
            accessibilityRole="radio"
            accessibilityState={{ selected: targetType === 'SUPPLIER' }}
          >
            <Store size={16} color={targetType === 'SUPPLIER' ? colors.green[800] : semantic.textSecondary} />
            <Text style={chipTextStyle(targetType === 'SUPPLIER')}>Ma boutique</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={chipStyle(targetType === 'PRODUCT')}
            onPress={() => selectTarget('PRODUCT')}
            accessibilityRole="radio"
            accessibilityState={{ selected: targetType === 'PRODUCT' }}
          >
            <Package size={16} color={targetType === 'PRODUCT' ? colors.green[800] : semantic.textSecondary} />
            <Text style={chipTextStyle(targetType === 'PRODUCT')}>Un produit</Text>
          </TouchableOpacity>
        </View>

        {targetType === 'PRODUCT'
          ? (
              <View style={[styles.productList, { backgroundColor: semantic.bgCard }]}>
                {products.length > PRODUCT_ROWS
                  ? (
                      <TextInput
                        style={[styles.input, styles.productSearch, { color: semantic.textPrimary, backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }]}
                        placeholder={`Rechercher parmi ${products.length} produits…`}
                        placeholderTextColor={semantic.textTertiary}
                        value={productQuery}
                        onChangeText={setProductQuery}
                        autoCorrect={false}
                        accessibilityLabel="Rechercher un produit"
                      />
                    )
                  : null}
                {products.length === 0
                  ? (
                      <Text style={[styles.helper, styles.productEmpty, { color: semantic.textSecondary }]}>
                        Aucun produit dans votre catalogue. Ajoutez-en un ou choisissez « Ma boutique ».
                      </Text>
                    )
                  : visibleProducts.map((product, index) => {
                      const selected = targetId === product.id
                      return (
                        <TouchableOpacity
                          key={product.id}
                          style={[
                            styles.productRow,
                            index > 0 && { borderTopWidth: 1, borderTopColor: semantic.borderLight },
                          ]}
                          onPress={() => setTargetId(product.id)}
                          accessibilityRole="radio"
                          accessibilityState={{ selected }}
                          accessibilityLabel={product.name}
                        >
                          {product.photoUri
                            ? <Image source={{ uri: product.photoUri }} style={styles.productThumb} />
                            : (
                                <View style={[styles.productThumb, { backgroundColor: colors.green[50], alignItems: 'center', justifyContent: 'center' }]}>
                                  <Package size={16} color={colors.green[600]} />
                                </View>
                              )}
                          <Text style={[styles.productName, { color: semantic.textPrimary }]} numberOfLines={1}>
                            {product.name}
                          </Text>
                          {selected ? <Check size={18} color={colors.green[600]} strokeWidth={2.5} /> : null}
                        </TouchableOpacity>
                      )
                    })}
                {hiddenProducts > 0
                  ? (
                      <Text style={[styles.helper, styles.productEmpty, { color: semantic.textTertiary }]}>
                        {`${hiddenProducts} autre${hiddenProducts > 1 ? 's' : ''} produit${hiddenProducts > 1 ? 's' : ''} — affinez la recherche`}
                      </Text>
                    )
                  : null}
              </View>
            )
          : null}

        {/* Offer */}
        <Text style={[styles.label, { color: semantic.textSecondary }]}>Durée</Text>
        {offers.length === 0
          ? (
              <Text style={[styles.helper, { color: colors.coral[600] }]}>
                Aucune offre disponible pour le moment. Réessayez plus tard.
              </Text>
            )
          : (
              <View style={styles.chipRow}>
                {offers.map((offer) => {
                  const selected = durationDays === offer.days
                  return (
                    <TouchableOpacity
                      key={offer.days}
                      style={chipStyle(selected)}
                      onPress={() => setDurationDays(offer.days)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`${offer.days} jours, ${formatAmount(offer.price)}`}
                    >
                      <Text style={chipTextStyle(selected)}>
                        {`${offer.days} jours · ${formatAmount(offer.price)}`}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            )}

        {/* Start date */}
        <Text style={[styles.label, { color: semantic.textSecondary }]}>Mise en ligne</Text>
        <View style={styles.chipRow}>
          {START_OPTIONS.map(option => (
            <TouchableOpacity
              key={option.delay}
              style={chipStyle(!customDelay && startDelay === option.delay)}
              onPress={() => {
                setCustomDelay(false)
                setStartDelay(option.delay)
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: !customDelay && startDelay === option.delay }}
            >
              <Text style={chipTextStyle(!customDelay && startDelay === option.delay)}>{option.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={chipStyle(customDelay)}
            onPress={() => setCustomDelay(true)}
            accessibilityRole="radio"
            accessibilityState={{ selected: customDelay }}
          >
            <Text style={chipTextStyle(customDelay)}>Autre</Text>
          </TouchableOpacity>
        </View>
        {customDelay
          ? (
              <View style={styles.customDelayRow}>
                <Text style={[styles.helper, { color: semantic.textSecondary, marginTop: 0 }]}>Dans</Text>
                <TextInput
                  style={[styles.input, styles.customDelayInput, { color: semantic.textPrimary, backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }]}
                  keyboardType="number-pad"
                  value={customDelayText}
                  onChangeText={text => setCustomDelayText(text.replace(/\D/g, '').slice(0, 2))}
                  placeholder="10"
                  placeholderTextColor={semantic.textTertiary}
                  accessibilityLabel="Nombre de jours avant la mise en ligne"
                />
                <Text style={[styles.helper, { color: semantic.textSecondary, marginTop: 0 }]}>{`jours (max ${MAX_START_DELAY_DAYS})`}</Text>
              </View>
            )
          : null}

        {/* Summary */}
        <View style={[styles.summaryCard, { backgroundColor: semantic.bgCard }]}>
          <Text style={[styles.summaryLabel, { color: semantic.textSecondary }]}>Montant débité de votre portefeuille</Text>
          <Text style={[styles.summaryAmount, { color: semantic.textPrimary }]}>{formatAmount(price)}</Text>
          <Text style={[styles.summaryBalance, { color: balance !== null && balance < price ? colors.coral[600] : semantic.textTertiary }]}>
            {balance === null
              ? 'Solde : inconnu'
              : `Solde : ${formatAmount(balance)}`}
            {balance !== null && balance < price ? ' · une recharge vous sera proposée' : ''}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.submitButton, (!isValid || isSubmitting || uploading) && styles.disabled]}
          disabled={!isValid || isSubmitting || uploading}
          onPress={() => submit(balance)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Envoyer la demande"
        >
          {isSubmitting
            ? <ActivityIndicator size="small" color={colors.neutral[0]} />
            : <Text style={styles.submitButtonText}>Envoyer la demande</Text>}
        </TouchableOpacity>
        <Text style={[styles.helper, styles.footnote, { color: semantic.textTertiary }]}>
          Le montant est remboursé intégralement si eBio refuse la bannière ou si vous annulez avant validation.
        </Text>
      </ScrollView>

      <SupplierTopupSheet
        visible={topupAmount !== null}
        suggestedAmount={topupAmount ?? 0}
        hint={topupAmount !== null
          ? `Votre solde ne couvre pas les ${formatAmount(price)} de la bannière. Rechargez au moins ${formatAmount(topupAmount)} ; la demande sera envoyée dès la confirmation du paiement.`
          : undefined}
        onClose={() => setTopupAmount(null)}
        onVerified={handleTopupVerified}
      />
    </KeyboardAwareView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: spacing[4], paddingBottom: spacing[10] },

  label: { ...typography.caption, marginTop: spacing[4], marginBottom: spacing[2] },
  helper: { ...typography.caption, marginTop: spacing[1] },
  counter: { ...typography.caption, textAlign: 'right', marginTop: spacing[1] },
  footnote: { textAlign: 'center', marginTop: spacing[3] },

  imagePicker: {
    width: '100%',
    aspectRatio: 2,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  imagePreview: { width: '100%', height: '100%' },
  imagePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[2] },
  imageHint: { ...typography.bodyS },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    ...typography.bodyL,
  },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  chipText: { ...typography.bodyS, fontFamily: fonts.sansSb },

  productList: { marginTop: spacing[2], borderRadius: radius.lg, paddingHorizontal: spacing[3] },
  productEmpty: { paddingVertical: spacing[3], textAlign: 'center' },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: 52,
    paddingVertical: spacing[2],
  },
  productThumb: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.neutral[100] },
  productName: { ...typography.bodyL, flex: 1 },
  productSearch: { marginHorizontal: spacing[3], marginTop: spacing[3], marginBottom: spacing[2] },
  customDelayRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: spacing[3] },
  customDelayInput: { width: 72, textAlign: 'center' },

  summaryCard: {
    marginTop: spacing[6],
    padding: spacing[4],
    borderRadius: radius.lg,
    gap: spacing[1],
  },
  summaryLabel: { ...typography.bodyS },
  summaryAmount: { ...typography.h1 },
  summaryBalance: { ...typography.caption },

  submitButton: {
    marginTop: spacing[4],
    minHeight: 48,
    backgroundColor: colors.green[400],
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[3],
  },
  submitButtonText: { ...typography.h3, color: colors.neutral[0] },
  disabled: { opacity: 0.5 },
})
