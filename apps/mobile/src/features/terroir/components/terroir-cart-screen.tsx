import type { TerroirCheckoutInput, TerroirPreview, TerroirPreviewLine, TerroirSuggestion } from '../terroir-api'
import type { TerroirCartLine } from '../terroir-cart-context'
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs'
import Minus from 'lucide-react-native/dist/esm/icons/minus'
import Plus from 'lucide-react-native/dist/esm/icons/plus'
import Scale from 'lucide-react-native/dist/esm/icons/scale'
import ShoppingBasket from 'lucide-react-native/dist/esm/icons/shopping-basket'
import Trash2 from 'lucide-react-native/dist/esm/icons/trash-2'
import { use, useMemo } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { appAlert } from '../../common/components/app-alert'
import { ScreenHeader } from '../../common/components/screen-header'
import { Thumbnail } from '../../common/components/thumbnail'
import { useTerroirMoney } from '../hooks/use-terroir-money'
import { useTerroirPreview } from '../hooks/use-terroir-preview'
import { formatKg } from '../terroir-api'
import { useTerroirCart } from '../terroir-cart-context'
import { terroirStyles } from './terroir-ui'
import { ValiseModeBanner } from './valise-ui'

/** The server's pricing of a basket line, matched by product and format, or by pack. */
function previewLineFor(line: TerroirCartLine, preview: TerroirPreview | null): TerroirPreviewLine | null {
  if (!preview)
    return null
  return preview.lines.find(entry => line.kind === 'PACK'
    ? entry.packId === line.packId
    : entry.productId === line.productId && (entry.variantId ?? null) === (line.variantId ?? null)) ?? null
}

interface CartLineRowProps {
  line: TerroirCartLine
  /** The server's view of the line: its price and shop, when the preview has them. */
  priced: TerroirPreviewLine | null
  unavailable: boolean
  onQuantity: (key: string, quantity: number) => void
  onRemove: (line: TerroirCartLine) => void
}

function CartLineRow({ line, priced, unavailable, onQuantity, onRemove }: CartLineRowProps) {
  const { semantic } = useTheme()
  const { formatMoney } = useTerroirMoney()
  const total = formatMoney((priced?.unitPrice ?? line.price) * line.quantity)
  const shopName = line.shopName ?? priced?.shopName ?? null
  return (
    <View style={[styles.lineRow, { borderBottomColor: semantic.borderLight }]}>
      <Thumbnail uri={line.imageUrl} style={styles.lineImage} alt={line.name} />
      <View style={styles.lineBody}>
        {line.kind === 'PACK' && <Text style={[styles.packLabel, { color: colors.earth[600] }]}>Pack</Text>}
        <Text style={[styles.lineName, { color: semantic.textPrimary }]} numberOfLines={2}>{line.name}</Text>
        {shopName && <Text style={[styles.lineShop, { color: semantic.textSecondary }]} numberOfLines={1}>{shopName}</Text>}
        {unavailable && (
          <Text style={[styles.lineShop, { color: colors.coral[600] }]}>Indisponible à l’export : retirez-le pour commander.</Text>
        )}
        <View style={styles.lineFooter}>
          <View style={[styles.stepper, { borderColor: semantic.borderNormal }]}>
            <TouchableOpacity
              style={styles.stepperButton}
              onPress={() => onQuantity(line.key, line.quantity - 1)}
              accessibilityRole="button"
              accessibilityLabel={`Diminuer la quantité de ${line.name}`}
            >
              <Minus size={16} color={semantic.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.stepperValue, { color: semantic.textPrimary }]}>{line.quantity}</Text>
            <TouchableOpacity
              style={styles.stepperButton}
              onPress={() => onQuantity(line.key, line.quantity + 1)}
              accessibilityRole="button"
              accessibilityLabel={`Augmenter la quantité de ${line.name}`}
            >
              <Plus size={16} color={semantic.textPrimary} />
            </TouchableOpacity>
          </View>
          <Text style={[terroirStyles.price, { color: semantic.textPrimary }]}>{total.primary}</Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.removeButton}
        onPress={() => onRemove(line)}
        accessibilityRole="button"
        accessibilityLabel={`Retirer ${line.name} de ma valise`}
      >
        <Trash2 size={18} color={semantic.textSecondary} />
      </TouchableOpacity>
    </View>
  )
}

interface WeightCardProps {
  preview: TerroirPreview
  onAddSuggestion: (suggestion: TerroirSuggestion) => void
  onOpenProduct: (productId: string) => void
}

interface FillGaugeProps {
  weightKg: number
  billedKg: number
}

/** « 3,2 kg sur 5 kg payés », and a bar that stays green while the parcel is under what is paid. */
function FillGauge({ weightKg, billedKg }: FillGaugeProps) {
  const { semantic } = useTheme()
  const ratio = billedKg > 0 ? Math.min(1, weightKg / billedKg) : 0
  const within = weightKg <= billedKg
  const percent = Math.round(ratio * 100)
  return (
    <View style={styles.gauge}>
      <View style={styles.weightHeader}>
        <Scale size={18} color={colors.blue[600]} strokeWidth={2.2} />
        <Text style={[terroirStyles.cardTitle, styles.flex, { color: semantic.textPrimary }]}>
          {`${formatKg(weightKg)} sur ${formatKg(billedKg)} payés`}
        </Text>
      </View>
      <View
        style={[styles.gaugeTrack, { backgroundColor: semantic.borderLight }]}
        accessibilityRole="progressbar"
        accessibilityLabel="Remplissage de votre valise"
        accessibilityValue={{ min: 0, max: 100, now: percent }}
      >
        <View style={[styles.gaugeFill, { width: `${percent}%`, backgroundColor: within ? colors.green[400] : colors.earth[400] }]} />
      </View>
    </View>
  )
}

/** The fill gauge, the free margin and what fits in it (US8). */
function WeightCard({ preview, onAddSuggestion, onOpenProduct }: WeightCardProps) {
  const { semantic } = useTheme()
  const { formatMoney } = useTerroirMoney()
  const weightKg = preview.estimatedWeightG / 1000
  const departure = preview.departures[0] ?? null
  const underMinimum = preview.marginKg > 0
  return (
    <View style={[terroirStyles.card, { backgroundColor: semantic.bgCard }]}>
      {preview.billedKg > 0
        ? <FillGauge weightKg={weightKg} billedKg={preview.billedKg} />
        : (
            <View style={styles.weightHeader}>
              <Scale size={18} color={colors.blue[600]} strokeWidth={2.2} />
              <Text style={[terroirStyles.cardTitle, { color: semantic.textPrimary }]}>{`Votre colis : ${formatKg(weightKg)}`}</Text>
            </View>
          )}
      {preview.billedKg > 0 && underMinimum && (
        <Text style={[styles.weightText, { color: semantic.textSecondary }]}>
          {`Le transport est facturé ${formatKg(preview.billedKg)} minimum.`}
        </Text>
      )}
      {preview.billedKg > 0 && !underMinimum && (
        <Text style={[styles.weightText, { color: semantic.textSecondary }]}>
          {`Palier suivant : ${formatKg(preview.billedKg)}. Jusque-là, le transport ne change pas.`}
        </Text>
      )}
      {underMinimum && (
        <Text style={[styles.marginText, { color: colors.green[600] }]}>
          {`Ajoutez jusqu’à ${formatKg(preview.marginKg)} sans frais de transport en plus.`}
        </Text>
      )}
      {!underMinimum && departure && departure.pricePerKg > 0 && (
        <Text style={[styles.weightText, { color: semantic.textSecondary }]}>
          {`Chaque kilo supplémentaire : ${formatMoney(departure.pricePerKg).primary}`}
        </Text>
      )}
      {underMinimum && preview.suggestions.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestions}>
          {preview.suggestions.map((suggestion) => {
            const money = formatMoney(suggestion.price)
            return (
              <View key={suggestion.productId} style={[styles.suggestion, { borderColor: semantic.borderLight }]}>
                <TouchableOpacity
                  onPress={() => onOpenProduct(suggestion.productId)}
                  accessibilityRole="button"
                  accessibilityLabel={`Voir ${suggestion.name}`}
                >
                  <Thumbnail uri={suggestion.imageUrl} style={styles.suggestionImage} alt={suggestion.name} />
                  <Text style={[styles.suggestionName, { color: semantic.textPrimary }]} numberOfLines={2}>{suggestion.name}</Text>
                </TouchableOpacity>
                {suggestion.weightG !== null && (
                  <Text style={[styles.lineShop, { color: semantic.textTertiary }]}>{formatKg(suggestion.weightG / 1000)}</Text>
                )}
                <Text style={[terroirStyles.priceSecondary, { color: semantic.textPrimary }]}>{money.primary}</Text>
                <TouchableOpacity
                  style={[styles.suggestionAdd, { borderColor: colors.green[600] }]}
                  onPress={() => onAddSuggestion(suggestion)}
                  accessibilityRole="button"
                  accessibilityLabel={`Ajouter ${suggestion.name} à ma valise`}
                >
                  <Plus size={16} color={colors.green[600]} strokeWidth={2.4} />
                  <Text style={[styles.suggestionAddText, { color: colors.green[600] }]}>Ajouter</Text>
                </TouchableOpacity>
              </View>
            )
          })}
        </ScrollView>
      )}
    </View>
  )
}

interface TerroirCartScreenProps {
  /** Absent when the valise is the root of its tab. */
  onBack?: () => void
  onCheckout: () => void
  onOpenProduct: (productId: string) => void
  onBrowse: () => void
}

export function TerroirCartScreen({ onBack, onCheckout, onOpenProduct, onBrowse }: TerroirCartScreenProps) {
  const { semantic } = useTheme()
  const insets = useSafeAreaInsets()
  // The floating tab bar covers the bottom of the screen: the footer sits above it.
  const tabBarHeight = use(BottomTabBarHeightContext) ?? 0
  const { formatMoney, formatServer, displayCurrency } = useTerroirMoney()
  const { lines, country, countryInfo, setQuantity, removeLine, addLine, toInput } = useTerroirCart()

  const previewInput = useMemo<TerroirCheckoutInput | null>(() => lines.length === 0 || !country
    ? null
    : {
        country,
        lines: toInput(),
        departureId: null,
        reception: 'PICKUP',
        pickupPointId: null,
        homeAddress: null,
        insured: false,
        gift: null,
        paymentMethod: 'FEDAPAY',
        displayCurrency,
      }, [lines.length, country, toInput, displayCurrency])
  const { preview, loading, error } = useTerroirPreview(previewInput)

  const unavailableKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const entry of preview?.unavailable ?? []) {
      for (const line of lines) {
        if ((entry.productId && line.productId === entry.productId) || (entry.packId && line.packId === entry.packId))
          keys.add(line.key)
      }
    }
    return keys
  }, [preview?.unavailable, lines])

  const localTotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0)
  const itemsTotal = preview ? formatServer(preview.itemsTotal, preview.display, 'itemsTotal') : formatMoney(localTotal)

  const confirmRemove = (line: TerroirCartLine): void => {
    appAlert('Retirer cet article ?', line.name, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Retirer', style: 'destructive', onPress: () => removeLine(line.key) },
    ])
  }

  const handleAddSuggestion = (suggestion: TerroirSuggestion): void => {
    addLine({
      kind: 'PRODUCT',
      productId: suggestion.productId,
      variantId: null,
      name: suggestion.name,
      imageUrl: suggestion.imageUrl,
      price: suggestion.price,
      // The suggestion names its shop; otherwise the next preview line will.
      shopName: suggestion.shopName,
    })
  }

  if (lines.length === 0) {
    return (
      <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
        <ScreenHeader title="Ma valise" onBack={onBack} />
        <ValiseModeBanner />
        <View style={terroirStyles.centered}>
          <ShoppingBasket size={32} color={colors.green[400]} />
          <Text style={[terroirStyles.cardTitle, { color: semantic.textPrimary }]}>Votre valise est vide</Text>
          <Text style={[terroirStyles.muted, { color: semantic.textSecondary }]}>
            Choisissez des produits du pays à recevoir dans l’un des pays desservis.
          </Text>
          <TouchableOpacity style={terroirStyles.primaryButton} onPress={onBrowse} accessibilityRole="button">
            <Text style={terroirStyles.primaryButtonText}>Remplir ma valise</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  const blocked = unavailableKeys.size > 0 || !country
  return (
    <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader title="Ma valise" subtitle={countryInfo ? `Livré ${countryInfo.inPhrase}` : undefined} onBack={onBack} />
      <ValiseModeBanner />
      <ScrollView contentContainerStyle={styles.content}>
        {/* The gauge first: how full the valise is decides what to add next. */}
        {loading && !preview && <ActivityIndicator color={colors.green[400]} />}
        {error && <Text style={[styles.error, { color: colors.coral[600] }]}>{error}</Text>}
        {preview && <WeightCard preview={preview} onAddSuggestion={handleAddSuggestion} onOpenProduct={onOpenProduct} />}
        <View style={[terroirStyles.card, { backgroundColor: semantic.bgCard }]}>
          {lines.map(line => (
            <CartLineRow
              key={line.key}
              line={line}
              priced={previewLineFor(line, preview)}
              unavailable={unavailableKeys.has(line.key)}
              onQuantity={setQuantity}
              onRemove={confirmRemove}
            />
          ))}
        </View>
      </ScrollView>
      <View style={[styles.footer, { backgroundColor: semantic.bgCard, borderTopColor: semantic.borderLight, paddingBottom: (tabBarHeight || insets.bottom) + spacing[3] }]}>
        <View style={styles.footerTotal}>
          <Text style={[styles.footerLabel, { color: semantic.textSecondary }]}>Produits</Text>
          <Text style={[terroirStyles.price, { color: semantic.textPrimary }]}>{itemsTotal.primary}</Text>
          {itemsTotal.secondary && <Text style={[terroirStyles.priceSecondary, { color: semantic.textTertiary }]}>{itemsTotal.secondary}</Text>}
        </View>
        <TouchableOpacity
          style={[terroirStyles.primaryButton, styles.footerButton, blocked && terroirStyles.disabled]}
          onPress={onCheckout}
          disabled={blocked}
          accessibilityRole="button"
          accessibilityState={{ disabled: blocked }}
        >
          <Text style={terroirStyles.primaryButtonText}>Commander</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: spacing[4],
    gap: spacing[4],
  },
  lineRow: {
    flexDirection: 'row',
    gap: spacing[3],
    paddingBottom: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  lineImage: {
    width: 72,
    height: 54,
    borderRadius: radius.sm,
  },
  lineBody: {
    flex: 1,
    gap: 2,
  },
  packLabel: {
    ...typography.overline,
  },
  lineName: {
    fontFamily: fonts.sansSb,
    fontSize: 14,
  },
  lineShop: {
    ...typography.caption,
  },
  lineFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing[1],
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
  },
  stepperButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    minWidth: 20,
    textAlign: 'center',
    fontFamily: fonts.mono,
    fontSize: 14,
  },
  removeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
  },
  gauge: {
    gap: spacing[2],
  },
  gaugeTrack: {
    height: 8,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  gaugeFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  weightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  weightText: {
    ...typography.bodyS,
  },
  marginText: {
    fontFamily: fonts.sansSb,
    fontSize: 14,
  },
  suggestions: {
    gap: spacing[3],
  },
  suggestion: {
    width: 140,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing[2],
    gap: spacing[1],
  },
  suggestionImage: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radius.sm,
  },
  suggestionName: {
    fontFamily: fonts.sansMd,
    fontSize: 13,
    marginTop: spacing[1],
  },
  suggestionAdd: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[1],
  },
  suggestionAddText: {
    fontFamily: fonts.sansSb,
    fontSize: 13,
  },
  error: {
    ...typography.bodyS,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    borderTopWidth: 1,
  },
  footerTotal: {
    flex: 1,
  },
  footerLabel: {
    ...typography.caption,
  },
  footerButton: {
    flex: 1,
  },
})
