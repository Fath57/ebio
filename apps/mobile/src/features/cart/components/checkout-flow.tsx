import type { OrderPreview, OrderPreviewLine, PreviewDeliveryReason } from '../hooks/use-order-preview'
import ArrowRight from 'lucide-react-native/dist/esm/icons/arrow-right'
import Banknote from 'lucide-react-native/dist/esm/icons/banknote'
import CircleCheck from 'lucide-react-native/dist/esm/icons/circle-check'
import MapPin from 'lucide-react-native/dist/esm/icons/map-pin'
import MapPinCheck from 'lucide-react-native/dist/esm/icons/map-pin-check'
import Store from 'lucide-react-native/dist/esm/icons/store'
import Truck from 'lucide-react-native/dist/esm/icons/truck'
import Wallet from 'lucide-react-native/dist/esm/icons/wallet'
import * as React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { unitShortLabel } from '../../catalog/hooks/use-product-units'
import { appAlert } from '../../common/components/app-alert'
import { KeyboardAwareView } from '../../common/components/keyboard-aware-view'
import { ScreenHeader } from '../../common/components/screen-header'
import { useLocation } from '../../common/location-context'
import { LocationPickerScreen } from '../../map/components/location-picker-screen'
import { geocodeAddress } from '../../map/utils/geocode-address'
import { PaymentWebView } from '../../payments/components/payment-web-view'
import { buildCheckoutHtml, paymentPublicKey } from '../../payments/utils/checkout-widget'
import { useCart } from '../cart-context'
import { useOrderPreview } from '../hooks/use-order-preview'
import { useRecommendations } from '../hooks/use-recommendations'
import { BasketSuggestions } from './basket-suggestions'

type CheckoutStep = 'SUMMARY' | 'PAYMENT' | 'SUCCESS'

type PaymentChoice = 'FEDAPAY' | 'WALLET' | 'CASH'

// Mirrors the API contract (createCheckoutSchema.deliveryAddress), which
// asks for ten characters. It said three, so an address between the two
// passed here and was refused by the server — with a generic failure, since
// nothing on this screen knew the real rule.
const MIN_ADDRESS_LENGTH = 10

/** What `POST /orders/checkout` returns: one cart, N orders. */
interface CheckoutResult {
  checkoutId: string
  orders: Array<{ orderId: string, orderNumber: string, total: number }>
}

interface OrderSummary {
  /** The cart's shops, for the header. A single one most of the time. */
  shopNames: string[]
  items: Array<{
    productId: string
    supplierId: string
    supplierName: string
    variantId?: string
    name: string
    quantity: number
    pricePerUnit: number
    unit: string
  }>
  deliveryMode: 'PICKUP' | 'DELIVERY'
  total: number
}

export interface CustomerInfo {
  name: string
  email: string | null
  phone: string | null
}

export interface CheckoutFlowProps {
  orderSummary: OrderSummary
  customer: CustomerInfo
  onComplete: (orderNumber: string, orderId: string) => void
  onCancel: () => void
}

function formatPrice(value: number): string {
  return value.toLocaleString('fr-FR').replace(/,/g, ' ')
}

function formatKm(value: number): string {
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`
}

/**
 * Reasons the API genuinely refuses the order — it cannot price the
 * en chiffrer la livraison (`deliveryPriceable`, orders.service.ts).
 *
 * `NO_SHOP_POSITION` is not one of them: when the *shop* has no
 * position, the server applies the flat fee and accepts the order.
 * Blocking here forbade the purchase over data missing on the seller's
 * side, which the buyer cannot supply — they kept re-pinning their
 * position on the map while the message never changed.
 */
const BLOCKING_DELIVERY_REASONS: PreviewDeliveryReason[] = ['NO_POSITION', 'OUT_OF_RANGE']

/** Label of the confirm button; a blocking delivery reason replaces the payment verb. */
function confirmLabel(choice: PaymentChoice, blockedReason: PreviewDeliveryReason | null): string {
  if (blockedReason === 'OUT_OF_RANGE') {
    return 'Hors zone'
  }
  if (blockedReason !== null) {
    return 'Point de livraison requis'
  }
  if (choice === 'CASH') {
    return 'Commander'
  }
  if (choice === 'WALLET') {
    return 'Payer avec le portefeuille'
  }
  return 'Payer maintenant'
}

interface DeliveryFeeValueProps {
  preview: OrderPreview | null
  loading: boolean
  textColor: string
  mutedColor: string
}

/** Right-hand side of the "Livraison" summary line: an amount, a waiver, or why there is none yet. */
function DeliveryFeeValue({ preview, loading, textColor, mutedColor }: DeliveryFeeValueProps) {
  if (loading || !preview) {
    return <Text style={[styles.feeValue, { color: mutedColor }]}>…</Text>
  }
  const { deliveryReason, deliveryFee, deliveryDistanceKm } = preview
  if (deliveryReason === 'NO_POSITION') {
    return <Text style={[styles.feeValue, styles.feeBlocked]}>Position à choisir</Text>
  }
  // The shop has no position: the server charges the flat fee. The amount
  // is real, and the buyer deserves to see it rather than a block.
  if (deliveryReason === 'NO_SHOP_POSITION') {
    return (
      <Text style={[styles.feeValue, { color: textColor }]}>
        {`${formatPrice(deliveryFee ?? 0)} FCFA`}
        <Text style={[styles.feeDistance, { color: mutedColor }]}> · forfait</Text>
      </Text>
    )
  }
  if (deliveryReason === 'OUT_OF_RANGE') {
    const detail = deliveryDistanceKm !== null ? ` (${formatKm(deliveryDistanceKm)})` : ''
    return <Text style={[styles.feeValue, styles.feeBlocked]}>{`Hors zone${detail}`}</Text>
  }
  if (deliveryReason === 'FREE_PROMO') {
    return (
      <Text style={[styles.feeValue, { color: colors.green[600] }]}>
        {preview.deliverySponsor === 'PLATFORM' ? 'Offerte par eBio' : 'Offerte par la boutique'}
      </Text>
    )
  }
  if (deliveryReason === 'FREE_THRESHOLD' || deliveryFee === 0) {
    return <Text style={[styles.feeValue, { color: colors.green[600] }]}>Offerte</Text>
  }
  // Several runs: say "2 deliveries" rather than a distance, which
  // would mean nothing added up over two separate rides.
  const runCount = preview.deliveryRunCount
  const showDistance = runCount <= 1
    && (deliveryReason === 'DISTANCE' || deliveryReason === 'ZONE')
    && deliveryDistanceKm !== null
  return (
    <Text style={[styles.feeValue, { color: textColor }]}>
      {`${formatPrice(deliveryFee)} FCFA`}
      {showDistance && (
        <Text style={[styles.feeDistance, { color: mutedColor }]}>{` · ${formatKm(deliveryDistanceKm ?? 0)}`}</Text>
      )}
      {runCount > 1 && (
        <Text style={[styles.feeDistance, { color: mutedColor }]}>{` · ${runCount} livraisons`}</Text>
      )}
    </Text>
  )
}

interface SummaryLineProps {
  line: OrderPreviewLine
  unit: string
  isLast: boolean
}

/** One basket line: a gift is free, a price promotion shows the regular price struck through. */
function SummaryLine({ line, unit, isLast }: SummaryLineProps) {
  const { semantic } = useTheme()
  const hasPricePromo = !line.isGift && line.unitPrice < line.regularPrice
  return (
    <View style={[styles.itemRow, !isLast && [styles.itemRowBorder, { borderBottomColor: semantic.borderLight }]]}>
      <View style={styles.itemInfo}>
        <View style={styles.itemNameRow}>
          <Text style={[styles.itemName, { color: semantic.textPrimary }]} numberOfLines={1}>
            {`${line.quantity}x ${line.name}`}
          </Text>
          {line.isGift && (
            <View style={styles.giftBadge}>
              <Text style={styles.giftBadgeText}>Offert</Text>
            </View>
          )}
        </View>
        <Text style={[styles.itemUnit, { color: semantic.textTertiary }]}>
          {line.isGift
            ? (
                <Text style={styles.itemRegularPrice}>{`${formatPrice(line.regularPrice)} FCFA / ${unitShortLabel(unit)}`}</Text>
              )
            : (
                <>
                  {`${formatPrice(line.unitPrice)} FCFA / ${unitShortLabel(unit)}`}
                  {hasPricePromo && (
                    <Text style={styles.itemRegularPrice}>{`  ${formatPrice(line.regularPrice)} FCFA`}</Text>
                  )}
                </>
              )}
        </Text>
      </View>
      <Text style={[styles.itemTotal, { color: line.isGift ? colors.green[600] : semantic.textPrimary }]}>
        {line.isGift ? 'Offert' : `${formatPrice(line.totalPrice)} FCFA`}
      </Text>
    </View>
  )
}

/** Basket as typed by the buyer, shown until the server preview lands. */
function toLocalLines(items: OrderSummary['items']): OrderPreviewLine[] {
  return items.map(item => ({
    productId: item.productId,
    variantId: item.variantId ?? null,
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.pricePerUnit,
    regularPrice: item.pricePerUnit,
    totalPrice: item.pricePerUnit * item.quantity,
    isGift: false,
    promotionType: null,
  }))
}

export function CheckoutFlow({
  orderSummary,
  customer,
  onComplete,
  onCancel,
}: CheckoutFlowProps) {
  const { semantic } = useTheme()
  const insets = useSafeAreaInsets()

  const [currentStep, setCurrentStep] = useState<CheckoutStep>('SUMMARY')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  // Drop-off point on the map: the single most useful thing for the courier,
  // and what the platform prices the delivery on.
  const [deliveryPosition, setDeliveryPosition] = useState<{ latitude: number, longitude: number } | null>(null)
  /** Address of the pinned point, from the map's reverse geocoding. */
  const [deliveryPlaceLabel, setDeliveryPlaceLabel] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  /** The provider's own payment page, when it hands one over up front. */
  const [hostedPaymentUrl, setHostedPaymentUrl] = useState<string | null>(null)
  /** Known before the buyer pays, so confirmation never trusts the page. */
  const [providerTransactionId, setProviderTransactionId] = useState<string | null>(null)
  // Where the map opens when no point is pinned yet: the typed address if it
  // geocodes, otherwise the device position (a buyer ordering for elsewhere
  // would otherwise be priced from where they stand).
  const [pickerStart, setPickerStart] = useState<{ latitude: number, longitude: number } | null>(null)
  const [locatingAddress, setLocatingAddress] = useState(false)

  const openPicker = useCallback(async () => {
    if (!deliveryPosition && deliveryAddress.trim().length >= 3) {
      setLocatingAddress(true)
      const found = await geocodeAddress(deliveryAddress)
      setLocatingAddress(false)
      if (found)
        setPickerStart({ latitude: found.latitude, longitude: found.longitude })
    }
    setPickerOpen(true)
  }, [deliveryPosition, deliveryAddress])
  const skipPositionRef = useRef(false)
  // The upsell is offered once per checkout, on the way to the payment.
  const upsellShownRef = useRef(false)
  const [upsellOpen, setUpsellOpen] = useState(false)
  const { latitude: currentLatitude, longitude: currentLongitude } = useLocation()
  const [deliverySlot, setDeliverySlot] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Whichever provider this build ships with; the name stays so the
  // payment-choice logic below reads as before.
  const fedapayPublicKey = paymentPublicKey()
  // Wallet checkout: the balance decides whether the option is even offered.
  const [walletBalance, setWalletBalance] = useState<number | null>(null)
  const [paymentChoice, setPaymentChoice] = useState<PaymentChoice>('FEDAPAY')
  // Cash on delivery: the server caps the amount; 0 means the option is off.
  const [cashMaxAmount, setCashMaxAmount] = useState(0)
  // Promo code: server-checked before the order, priced by the preview,
  // re-checked at creation.
  const [promoInput, setPromoInput] = useState('')
  const [appliedPromo, setAppliedPromo] = useState<{ code: string } | null>(null)
  const [promoError, setPromoError] = useState<string | null>(null)
  const [checkingPromo, setCheckingPromo] = useState(false)
  /** The checkout being paid: one for the whole cart. */
  const [pendingCheckoutId, setPendingCheckoutId] = useState<string | null>(null)
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null)
  const [orderNumber, setOrderNumber] = useState<string | null>(null)
  // Amount as the server settled it, delivery fee included. The payment widget
  // must charge that, never a total recomputed on the phone.
  const [amountDue, setAmountDue] = useState<number | null>(null)

  const isPickup = orderSummary.deliveryMode === 'PICKUP'
  // `orderSummary` is a snapshot taken when leaving the cart; the basket keeps
  // living in the cart context (suggestions add to it from this very screen).
  const { items: liveItems } = useCart()
  const basketItems = useMemo<OrderSummary['items']>(
    () => liveItems.length > 0
      ? liveItems.map(item => ({
          productId: item.productId,
          supplierId: item.supplierId,
          supplierName: item.supplierName,
          name: item.name,
          quantity: item.quantity,
          pricePerUnit: item.pricePerUnit,
          unit: item.unit,
        }))
      : orderSummary.items,
    [liveItems, orderSummary.items],
  )
  const basketProductIds = useMemo(() => basketItems.map(item => item.productId), [basketItems])
  // Suggestions stay the first shop's: they only make sense
  // against one catalogue.
  const { items: upsellItems } = useRecommendations(basketItems[0]?.supplierId ?? '', basketProductIds, 4)
  // Single source of truth for the summary: promotions, gifts, promo code and
  // delivery fee are all priced by the API.
  const previewInput = useMemo(() => ({
    pickupMode: isPickup ? 'ON_SITE' as const : 'DELIVERY' as const,
    position: isPickup ? null : deliveryPosition,
    promoCode: appliedPromo?.code ?? null,
    items: basketItems.map(item => ({
      productId: item.productId,
      ...(item.variantId ? { variantId: item.variantId } : {}),
      quantity: item.quantity,
    })),
  }), [basketItems, isPickup, deliveryPosition, appliedPromo?.code])
  const { preview, loading: previewLoading, error: previewError } = useOrderPreview(previewInput)

  useEffect(() => {
    let cancelled = false
    async function loadBalance() {
      try {
        const res = await apiFetch('/api/wallet/me')
        if (res.ok && !cancelled) {
          const data = await res.json() as { balance?: number }
          setWalletBalance(typeof data.balance === 'number' ? data.balance : 0)
        }
      }
      catch {
        // wallet stays unavailable; FedaPay/cash path is unaffected
      }
    }
    async function loadCashCap() {
      try {
        const res = await apiFetch('/api/settings/public')
        if (res.ok && !cancelled) {
          const data = await res.json() as { cashOnDeliveryMaxAmount?: number }
          setCashMaxAmount(typeof data.cashOnDeliveryMaxAmount === 'number' ? data.cashOnDeliveryMaxAmount : 0)
        }
      }
      catch {
        // cash stays hidden; online payment is unaffected
      }
    }
    loadBalance()
    loadCashCap()
    return () => {
      cancelled = true
    }
  }, [])

  // The platform cannot price the delivery yet (no drop-off point, or too
  // far): the order cannot be placed until that changes.
  const blockedReason: PreviewDeliveryReason | null = preview && BLOCKING_DELIVERY_REASONS.includes(preview.deliveryReason)
    ? preview.deliveryReason
    : null
  const quoteBlocked = !isPickup && (previewLoading || preview === null || blockedReason !== null)
  // Pickup never waits on the server: the typed basket stands in until the preview lands.
  const localTotal = useMemo(
    () => basketItems.reduce((sum, item) => sum + item.pricePerUnit * item.quantity, 0),
    [basketItems],
  )
  const orderTotal = preview?.total ?? localTotal
  const summaryLines = preview?.lines ?? toLocalLines(basketItems)
  const unitByProductId = useMemo(
    () => new Map(basketItems.map(item => [item.productId, item.unit])),
    [basketItems],
  )
  const cashAvailable = cashMaxAmount > 0 && orderTotal <= cashMaxAmount
  const walletAvailable = walletBalance !== null && walletBalance >= orderTotal
  // A choice that stops being affordable (promo removed, fee changed) falls back to online payment.
  const effectiveChoice: PaymentChoice = (paymentChoice === 'CASH' && !cashAvailable) || (paymentChoice === 'WALLET' && !walletAvailable)
    ? 'FEDAPAY'
    : paymentChoice

  const handleApplyPromo = useCallback(async () => {
    const code = promoInput.trim()
    if (!code) {
      return
    }
    setCheckingPromo(true)
    setPromoError(null)
    try {
      const res = await apiFetch('/api/promo-codes/validate', {
        method: 'POST',
        // A code belongs to one shop: we check against the first.
        // Past one shop, the server refuses the code at checkout time.
        body: JSON.stringify({ code, supplierId: basketItems[0]?.supplierId, itemsTotal: orderSummary.total }),
      })
      const data = await res.json().catch(() => null) as { valid?: boolean, message?: string | null } | null
      if (res.ok && data?.valid) {
        // Amount shown comes from the preview, which re-prices the whole basket.
        setAppliedPromo({ code })
      }
      else {
        setAppliedPromo(null)
        setPromoError(data?.message ?? 'Code invalide')
      }
    }
    catch {
      setPromoError('Vérification impossible. Réessayez.')
    }
    finally {
      setCheckingPromo(false)
    }
  }, [promoInput, basketItems, orderSummary.total])

  const handleProceedToPayment = useCallback(async () => {
    const trimmedAddress = deliveryAddress.trim()
    // The button is disabled meanwhile; this guards the alert-driven re-entry.
    if (quoteBlocked) {
      return
    }
    if (orderSummary.deliveryMode === 'DELIVERY' && !trimmedAddress) {
      appAlert('Adresse requise', 'Veuillez saisir une adresse de livraison.')
      return
    }
    if (orderSummary.deliveryMode === 'DELIVERY' && trimmedAddress.length < MIN_ADDRESS_LENGTH) {
      appAlert('Adresse trop courte', 'Indiquez le quartier et un repère (ex. en face de la pharmacie) pour que le livreur vous trouve.')
      return
    }
    // One last chance to round out the basket, just before paying.
    if (!upsellShownRef.current && upsellItems.length > 0) {
      upsellShownRef.current = true
      setUpsellOpen(true)
      return
    }

    // Insist on the map point without blocking: an address alone is often
    // not enough for the courier to find the door.
    if (orderSummary.deliveryMode === 'DELIVERY' && !deliveryPosition && !skipPositionRef.current) {
      appAlert(
        'Position sur la carte',
        'Sans repère sur la carte, le livreur risque de ne pas vous trouver. Placez le repère à votre porte : cela ne prend que quelques secondes.',
        [
          { text: 'Choisir sur la carte', onPress: () => { void openPicker() } },
          {
            text: 'Continuer sans',
            style: 'cancel',
            onPress: () => {
              skipPositionRef.current = true
              void handleProceedToPayment()
            },
          },
        ],
      )
      return
    }

    setIsSubmitting(true)
    try {
      // Create order
      // A single call for the whole cart: the server creates one order per
      // shop and collects only once.
      const orderRes = await apiFetch('/api/orders/checkout', {
        method: 'POST',
        body: JSON.stringify({
          pickupMode: orderSummary.deliveryMode === 'PICKUP' ? 'ON_SITE' : 'DELIVERY',
          paymentMethod: effectiveChoice === 'CASH'
            ? 'CASH_ON_DELIVERY'
            : effectiveChoice === 'WALLET'
              ? 'WALLET'
              : fedapayPublicKey ? 'FEDAPAY' : 'CASH_ON_DELIVERY',
          promoCode: appliedPromo?.code,
          deliveryAddress: orderSummary.deliveryMode === 'DELIVERY' ? trimmedAddress : undefined,
          deliveryLatitude: orderSummary.deliveryMode === 'DELIVERY' ? deliveryPosition?.latitude : undefined,
          deliveryLongitude: orderSummary.deliveryMode === 'DELIVERY' ? deliveryPosition?.longitude : undefined,
          deliverySlot: deliverySlot || undefined,
          items: basketItems.map(item => ({
            productId: item.productId,
            ...(item.variantId ? { variantId: item.variantId } : {}),
            quantity: item.quantity,
          })),
        }),
      })

      let checkout: CheckoutResult | null = null
      let order: { id: string, orderNumber?: string, totalAmount?: number }

      if (orderRes.ok) {
        const created = await orderRes.json() as CheckoutResult
        checkout = created
        // Tracking stays per order: we keep the first for the confirmation
        // screen, and the amount is the cart's.
        const first = created.orders[0]
        order = {
          id: first.orderId,
          orderNumber: created.orders.length > 1
            ? `${created.orders.length} commandes`
            : first.orderNumber,
          totalAmount: created.orders.reduce((sum, entry) => sum + entry.total, 0),
        }
      }
      else if (orderRes.status === 409) {
        // Duplicate — find the existing order still waiting (placed, or an
        // online payment that never completed and can be retried).
        const listRes = await apiFetch('/api/orders?view=buyer')
        const orders = listRes.ok ? await listRes.json() : []
        const existing = (orders.data ?? orders)
          .find((o: { supplierId: string, status?: string }) =>
            basketItems.some(item => item.supplierId === o.supplierId)
            && (o.status === 'PLACED' || o.status === 'PENDING_PAYMENT'))
        if (!existing) {
          appAlert('Erreur', 'Commande existante introuvable. Veuillez réessayer dans 2 minutes.')
          return
        }
        order = existing
      }
      else {
        const error = await orderRes.json().catch(() => null)
        // A validation failure carries its reason in one of two shapes
        // depending on the layer that raised it; a generic message would
        // hide exactly what the buyer has to change.
        const message = error?.aggregateErrors?.[0]?.message
          ?? error?.errors?.[0]?.message
          ?? (error?.message === 'Validation failed' ? undefined : error?.message)
          ?? 'Impossible de créer la commande. Veuillez réessayer.'
        // Cash cap or cash disabled: the server explains, the buyer picks another way.
        if (orderRes.status === 400 && effectiveChoice === 'CASH' && typeof error?.message === 'string') {
          appAlert('Paiement en espèces', error.message)
          return
        }
        appAlert('Erreur', message)
        return
      }

      setOrderNumber(order.orderNumber ?? order.id)
      if (typeof order.totalAmount === 'number') {
        setAmountDue(order.totalAmount)
      }
      setPendingOrderId(order.id)

      // Wallet and cash orders need no payment widget: the order is already placed.
      if (effectiveChoice !== 'FEDAPAY' || !fedapayPublicKey) {
        onComplete(order.orderNumber ?? order.id, order.id)
        return
      }

      // A single collection for the cart, whatever the number of
      // shops: that is this screen's whole promise.
      const paymentRes = await apiFetch('/api/payments/cart/initiate', {
        method: 'POST',
        body: JSON.stringify({ checkoutId: checkout?.checkoutId }),
      })

      if (!paymentRes.ok) {
        const error = await paymentRes.json().catch(() => null)
        appAlert('Erreur', error?.message ?? 'Impossible d\'initier le paiement.')
        return
      }

      // The payment itself does not exist yet: it is born at confirmation,
      // one per order. What we keep here is the checkout, plus the page the
      // provider opened for it and the reference it gave the server.
      const payment = await paymentRes.json() as { paymentUrl?: string | null, providerTransactionId?: string | null }
      setPendingCheckoutId(checkout?.checkoutId ?? null)
      setHostedPaymentUrl(payment.paymentUrl ?? null)
      setProviderTransactionId(payment.providerTransactionId ?? null)
      setCurrentStep('PAYMENT')
    }
    catch {
      appAlert('Erreur', 'Une erreur est survenue.')
    }
    finally {
      setIsSubmitting(false)
    }
  }, [orderSummary, basketItems, deliveryAddress, deliveryPosition, deliverySlot, fedapayPublicKey, effectiveChoice, appliedPromo, orderNumber, onComplete, quoteBlocked, upsellItems])

  /**
   * Confirms the collection once the payment screen says it is over.
   *
   * The reference comes from the server, which opened the payment: the page
   * the buyer used could claim any transaction was paid, and this is where
   * that claim would have been believed.
   */
  /** Silent check: the verify endpoint only succeeds once the money landed. */
  const pollCartStatus = useCallback(async (): Promise<'settled' | 'pending' | 'failed'> => {
    if (!pendingCheckoutId || !providerTransactionId) {
      return 'pending'
    }
    const res = await apiFetch('/api/payments/cart/verify', {
      method: 'POST',
      body: JSON.stringify({ checkoutId: pendingCheckoutId, fedapayTransactionId: providerTransactionId }),
    })
    if (res.ok) {
      return 'settled'
    }
    const body = await res.json().catch(() => null) as { code?: string } | null
    return body?.code === 'payment_failed' ? 'failed' : 'pending'
  }, [pendingCheckoutId, providerTransactionId])

  const confirmCartPayment = useCallback(async (reference: string) => {
    if (!pendingCheckoutId) {
      return
    }
    try {
      const res = await apiFetch('/api/payments/cart/verify', {
        method: 'POST',
        body: JSON.stringify({ checkoutId: pendingCheckoutId, fedapayTransactionId: reference }),
      })
      if (!res.ok) {
        const error = await res.json().catch(() => null) as { message?: string } | null
        appAlert('Paiement non confirmé', error?.message ?? 'Le paiement n\'a pas abouti.')
        setCurrentStep('SUMMARY')
        return
      }
      if (orderNumber && pendingOrderId) {
        onComplete(orderNumber, pendingOrderId)
      }
    }
    catch {
      appAlert('Erreur', 'La confirmation du paiement a échoué.')
      setCurrentStep('SUMMARY')
    }
  }, [pendingCheckoutId, pendingOrderId, orderNumber, onComplete])

  // ─── STEP: SUMMARY ─────────────────────────────────────────────────────────

  if (currentStep === 'SUMMARY') {
    return (
      <KeyboardAwareView style={[styles.container, { backgroundColor: semantic.bgPage }]}>
        <ScreenHeader title="Votre commande" onBack={onCancel} />
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >

          {/* Supplier */}
          <View style={[styles.card, { backgroundColor: semantic.bgCard }]}>
            <View style={styles.supplierRow}>
              <View style={[styles.supplierIcon, { backgroundColor: semantic.bgPrimaryLight }]}>
                <Store size={16} color={colors.green[600]} strokeWidth={2} />
              </View>
              <Text style={[styles.supplierName, { color: semantic.textPrimary }]}>
                {orderSummary.shopNames.length > 1
                  ? `${orderSummary.shopNames.length} boutiques`
                  : orderSummary.shopNames[0] ?? ''}
              </Text>
            </View>
          </View>

          {/* Delivery mode */}
          <View style={[styles.card, { backgroundColor: semantic.bgCard }]}>
            <View style={styles.deliveryRow}>
              {orderSummary.deliveryMode === 'DELIVERY'
                ? <Truck size={18} color={colors.green[600]} strokeWidth={2} />
                : <MapPin size={18} color={colors.green[600]} strokeWidth={2} />}
              <Text style={[styles.deliveryLabel, { color: semantic.textPrimary }]}>
                {orderSummary.deliveryMode === 'DELIVERY' ? 'Livraison à domicile' : 'Retrait sur place'}
              </Text>
            </View>

            {orderSummary.deliveryMode === 'DELIVERY' && (
              <View style={styles.addressSection}>
                <Text style={[styles.inputLabel, { color: semantic.textSecondary }]}>
                  Position de livraison
                </Text>
                <TouchableOpacity
                  style={[
                    styles.positionCard,
                    deliveryPosition
                      ? { backgroundColor: semantic.bgPrimaryLight, borderColor: colors.green[400] }
                      : { backgroundColor: colors.green[400], borderColor: colors.green[400] },
                  ]}
                  onPress={() => { void openPicker() }}
                  disabled={locatingAddress}
                  accessibilityRole="button"
                  accessibilityLabel={deliveryPosition ? 'Modifier ma position sur la carte' : 'Choisir ma position sur la carte'}
                >
                  {deliveryPosition
                    ? <MapPinCheck size={22} color={colors.green[800]} strokeWidth={2.2} />
                    : <MapPin size={22} color={colors.neutral[0]} strokeWidth={2.2} />}
                  <View style={styles.positionText}>
                    <Text style={[styles.positionTitle, { color: deliveryPosition ? colors.green[800] : colors.neutral[0] }]}>
                      {deliveryPosition ? 'Position enregistrée' : 'Choisir ma position sur la carte'}
                    </Text>
                    <Text style={[styles.positionHint, { color: deliveryPosition ? semantic.textSecondary : colors.green[50] }]}>
                      {deliveryPosition
                        ? `${deliveryPlaceLabel ?? `${deliveryPosition.latitude.toFixed(5)}, ${deliveryPosition.longitude.toFixed(5)}`} · Le tarif est calculé depuis ce point · Appuyez pour modifier`
                        : 'Recommandé : placez le repère à votre porte pour guider le livreur'}
                    </Text>
                  </View>
                </TouchableOpacity>

                <Text style={[styles.inputLabel, { color: semantic.textSecondary }]}>
                  Adresse de livraison *
                </Text>
                <TextInput
                  style={[styles.textInput, { color: semantic.textPrimary, backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }]}
                  placeholder="Quartier, rue, repère (ex. en face de la pharmacie)"
                  placeholderTextColor={semantic.textTertiary}
                  value={deliveryAddress}
                  onChangeText={setDeliveryAddress}
                  multiline
                />

                <Text style={[styles.inputLabel, { color: semantic.textSecondary }]}>
                  Créneau souhaité (optionnel)
                </Text>
                <TextInput
                  style={[styles.textInput, { color: semantic.textPrimary, backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }]}
                  placeholder="Ex: Demain matin entre 8h et 12h"
                  placeholderTextColor={semantic.textTertiary}
                  value={deliverySlot}
                  onChangeText={setDeliverySlot}
                />
              </View>
            )}
          </View>

          {/* Order items */}
          <View style={[styles.card, { backgroundColor: semantic.bgCard }]}>
            <Text style={[styles.cardTitle, { color: semantic.textPrimary }]}>
              Récapitulatif
            </Text>

            {summaryLines.map((line, index) => (
              <SummaryLine
                key={`${line.productId}-${line.variantId ?? ''}-${line.isGift ? 'gift' : 'paid'}`}
                line={line}
                unit={unitByProductId.get(line.productId) ?? ''}
                isLast={index === summaryLines.length - 1}
              />
            ))}

            {/* Promo code */}
            <View style={styles.promoRow}>
              <TextInput
                style={[styles.promoInput, { color: semantic.textPrimary, backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }]}
                placeholder="Code promo"
                placeholderTextColor={semantic.textTertiary}
                autoCapitalize="characters"
                autoCorrect={false}
                value={promoInput}
                editable={!appliedPromo}
                onChangeText={(text) => {
                  setPromoInput(text)
                  setPromoError(null)
                }}
              />
              {appliedPromo
                ? (
                    <TouchableOpacity
                      style={[styles.promoButton, { backgroundColor: semantic.bgSurface, borderWidth: 1, borderColor: semantic.borderNormal }]}
                      onPress={() => {
                        setAppliedPromo(null)
                        setPromoInput('')
                      }}
                    >
                      <Text style={[styles.promoButtonText, { color: semantic.textSecondary }]}>Retirer</Text>
                    </TouchableOpacity>
                  )
                : (
                    <TouchableOpacity
                      style={[styles.promoButton, { backgroundColor: colors.green[400] }, (checkingPromo || !promoInput.trim()) && { opacity: 0.5 }]}
                      disabled={checkingPromo || !promoInput.trim()}
                      onPress={handleApplyPromo}
                    >
                      {checkingPromo
                        ? <ActivityIndicator size="small" color={colors.neutral[0]} />
                        : <Text style={[styles.promoButtonText, { color: colors.neutral[0] }]}>Appliquer</Text>}
                    </TouchableOpacity>
                  )}
            </View>
            {promoError && (
              <Text style={styles.promoError}>{promoError}</Text>
            )}
            {appliedPromo && preview?.promoCodeMessage && (
              <Text style={styles.promoError}>{preview.promoCodeMessage}</Text>
            )}
            {appliedPromo && (
              <View style={styles.feeRow}>
                <Text style={[styles.feeLabel, { color: colors.green[600] }]}>
                  {`Code ${appliedPromo.code}`}
                </Text>
                <Text style={[styles.feeValue, { color: preview ? colors.green[600] : semantic.textTertiary }]}>
                  {preview ? `−${formatPrice(preview.discount)} FCFA` : '…'}
                </Text>
              </View>
            )}
            {previewError && (
              <Text style={styles.promoError}>{previewError}</Text>
            )}

            {orderSummary.deliveryMode === 'DELIVERY' && (
              <View style={styles.feeRow}>
                <Text style={[styles.feeLabel, { color: semantic.textSecondary }]}>Livraison</Text>
                <DeliveryFeeValue preview={preview} loading={previewLoading} textColor={semantic.textPrimary} mutedColor={semantic.textTertiary} />
              </View>
            )}

            {/* Le motif seul ne dit pas quoi faire : on nomme le geste et le
                bouton exact à utiliser, plus haut dans la page. */}
            {blockedReason !== null && (
              <Text style={styles.blockedHelp}>
                {blockedReason === 'OUT_OF_RANGE'
                  ? `Votre position est trop loin de la boutique pour être livrée. Choisissez « Retrait sur place » plus haut, ou déplacez le repère avec « Modifier ma position sur la carte ».`
                  : `Appuyez sur « Choisir ma position sur la carte », plus haut, et placez le repère à votre porte : les frais de livraison se calculent depuis ce point.`}
              </Text>
            )}

            <View style={[styles.totalRow, { borderTopColor: semantic.borderNormal }]}>
              <Text style={[styles.totalLabel, { color: semantic.textPrimary }]}>Total</Text>
              <Text style={styles.totalValue}>
                {formatPrice(orderTotal)}
                {' '}
                FCFA
              </Text>
            </View>
          </View>

          {/* Payment method */}
          {walletAvailable && (
            <TouchableOpacity
              style={[
                styles.card,
                styles.walletOption,
                { backgroundColor: effectiveChoice === 'WALLET' ? semantic.bgPrimaryLight : semantic.bgCard },
              ]}
              onPress={() => setPaymentChoice(previous => (previous === 'WALLET' ? 'FEDAPAY' : 'WALLET'))}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ selected: effectiveChoice === 'WALLET' }}
            >
              <Wallet size={18} color={effectiveChoice === 'WALLET' ? colors.green[600] : semantic.textSecondary} strokeWidth={2} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.walletOptionTitle, { color: semantic.textPrimary }]}>
                  Payer avec mon portefeuille
                </Text>
                <Text style={[styles.walletOptionHint, { color: semantic.textSecondary }]}>
                  Solde :
                  {' '}
                  {formatPrice(walletBalance ?? 0)}
                  {' '}
                  FCFA — débit immédiat, sans frais
                </Text>
              </View>
              {effectiveChoice === 'WALLET' && <CircleCheck size={18} color={colors.green[600]} strokeWidth={2} />}
            </TouchableOpacity>
          )}

          {cashMaxAmount > 0 && (
            <TouchableOpacity
              style={[
                styles.card,
                styles.walletOption,
                { backgroundColor: effectiveChoice === 'CASH' ? semantic.bgPrimaryLight : semantic.bgCard },
                !cashAvailable && styles.buttonDisabled,
              ]}
              onPress={() => setPaymentChoice(previous => (previous === 'CASH' ? 'FEDAPAY' : 'CASH'))}
              disabled={!cashAvailable}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ selected: effectiveChoice === 'CASH', disabled: !cashAvailable }}
            >
              <Banknote size={18} color={effectiveChoice === 'CASH' ? colors.green[600] : semantic.textSecondary} strokeWidth={2} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.walletOptionTitle, { color: semantic.textPrimary }]}>
                  {isPickup ? 'Espèces au retrait' : 'Espèces à la livraison'}
                </Text>
                <Text style={[styles.walletOptionHint, { color: semantic.textSecondary }]}>
                  {!cashAvailable
                    ? `Disponible jusqu'à ${formatPrice(cashMaxAmount)} FCFA par commande`
                    : isPickup
                      ? 'Vous payez la boutique en retirant votre commande'
                      : 'Vous payez le livreur à la réception, montant exact de préférence'}
                </Text>
              </View>
              {effectiveChoice === 'CASH' && <CircleCheck size={18} color={colors.green[600]} strokeWidth={2} />}
            </TouchableOpacity>
          )}

          {effectiveChoice === 'FEDAPAY' && (
            <View style={styles.paymentInfo}>
              <CircleCheck size={14} color={semantic.textTertiary} strokeWidth={2} />
              <Text style={[styles.paymentInfoText, { color: semantic.textTertiary }]}>
                Paiement sécurisé via FedaPay (Mobile Money, Visa, Mastercard)
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Bottom bar */}
        <View style={[styles.bottomBar, { backgroundColor: semantic.bgPage, borderTopColor: semantic.borderLight, paddingBottom: Math.max(insets.bottom, spacing[4]) }]}>
          <View style={styles.bottomPriceCol}>
            <Text style={[styles.bottomPriceLabel, { color: semantic.textTertiary }]}>Total</Text>
            <Text style={[styles.bottomPriceValue, { color: semantic.textPrimary }]}>
              {formatPrice(orderTotal)}
              {' '}
              FCFA
            </Text>
          </View>
          {/* Full width, below the amount: the only action of the screen is
              not something to aim at with a thumb. */}
          <TouchableOpacity
            style={[styles.confirmButton, (isSubmitting || quoteBlocked) && styles.buttonDisabled]}
            onPress={handleProceedToPayment}
            disabled={isSubmitting || quoteBlocked}
            activeOpacity={0.8}
            accessibilityState={{ disabled: isSubmitting || quoteBlocked }}
          >
            {isSubmitting || (!isPickup && previewLoading)
              ? <ActivityIndicator size="small" color={colors.neutral[0]} />
              : (
                  <>
                    <Text style={styles.confirmButtonText}>
                      {confirmLabel(effectiveChoice, quoteBlocked ? blockedReason ?? 'NO_POSITION' : null)}
                    </Text>
                    {!quoteBlocked && <ArrowRight size={18} color={colors.neutral[0]} strokeWidth={2.5} />}
                  </>
                )}
          </TouchableOpacity>
        </View>

        <Modal
          visible={upsellOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setUpsellOpen(false)}
        >
          <View style={styles.upsellBackdrop}>
            <View style={[styles.upsellSheet, { backgroundColor: semantic.bgPage }]}>
              <Text style={[styles.upsellTitle, { color: semantic.textPrimary }]}>Avant de valider</Text>
              <Text style={[styles.upsellSubtitle, { color: semantic.textSecondary }]}>
                Ces produits accompagnent souvent une commande comme la vôtre. Ajoutez-les en un geste, votre total se met à jour.
              </Text>
              <BasketSuggestions
                supplierId={basketItems[0]?.supplierId ?? ''}
                supplierName={basketItems[0]?.supplierName ?? ''}
                productIds={basketProductIds}
                items={upsellItems}
                hideTitle
              />
              <TouchableOpacity
                style={styles.upsellContinue}
                onPress={() => {
                  setUpsellOpen(false)
                  void handleProceedToPayment()
                }}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Continuer vers le paiement"
              >
                <Text style={styles.upsellContinueText}>Continuer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
          <LocationPickerScreen
            initialLatitude={deliveryPosition?.latitude ?? pickerStart?.latitude ?? currentLatitude}
            initialLongitude={deliveryPosition?.longitude ?? pickerStart?.longitude ?? currentLongitude}
            onConfirm={(coords) => {
              setDeliveryPosition({ latitude: coords.latitude, longitude: coords.longitude })
              setDeliveryPlaceLabel(coords.label ?? null)
              setPickerOpen(false)
            }}
            onGoBack={() => setPickerOpen(false)}
          />
        </Modal>
      </KeyboardAwareView>
    )
  }

  // ─── STEP: PAYMENT (widget du prestataire, en WebView) ─────────────────────

  if (currentStep === 'PAYMENT' && fedapayPublicKey && pendingCheckoutId) {
    return (
      <PaymentWebView
        url={hostedPaymentUrl}
        html={hostedPaymentUrl
          ? null
          : buildCheckoutHtml({
              publicKey: fedapayPublicKey,
              amount: amountDue ?? orderTotal,
              description: orderSummary.shopNames.length > 1
                ? `Panier eBio — ${orderSummary.shopNames.length} boutiques`
                : `Commande eBio - ${orderSummary.shopNames[0] ?? ''}`,
              customer,
              metadata: { payment_id: pendingCheckoutId },
            })}
        transactionId={providerTransactionId}
        onSettled={confirmCartPayment}
        onCancel={() => setCurrentStep('SUMMARY')}
        pollStatus={pollCartStatus}
      />
    )
  }

  // ─── FALLBACK: No FedaPay key (cash on delivery flow) ─────────────────────

  return (
    <View style={[styles.container, { backgroundColor: semantic.bgPage }]}>
      <View style={styles.fallbackContainer}>
        <ActivityIndicator size="large" color={colors.green[400]} />
        <Text style={[styles.fallbackText, { color: semantic.textSecondary }]}>
          Traitement de votre commande...
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: {
    // No horizontal padding: the surfaces run edge to edge, and the gap lets
    // the page show through between them in place of a card outline.
    paddingBottom: spacing[12],
    gap: spacing[2],
  },

  // Header
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[2],
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepTitle: {
    ...typography.h2,
    flex: 1,
  },

  // Bands
  card: {
    padding: spacing[4],
    gap: spacing[3],
  },
  cardTitle: {
    ...typography.h3,
  },

  // Supplier
  supplierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  supplierIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  supplierName: {
    fontFamily: fonts.sansSb,
    fontSize: 15,
  },

  // Delivery
  deliveryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  deliveryLabel: {
    fontFamily: fonts.sansSb,
    fontSize: 14,
  },
  addressSection: {
    gap: spacing[2],
  },
  positionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: 64,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  positionText: {
    flex: 1,
  },
  positionTitle: {
    ...typography.bodyL,
    fontFamily: fonts.sansSb,
  },
  positionHint: {
    ...typography.caption,
    marginTop: 2,
  },
  inputLabel: {
    ...typography.caption,
    marginTop: spacing[1],
  },
  textInput: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    fontFamily: fonts.sans,
    fontSize: 15,
  },

  // Items
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing[2],
  },
  itemRowBorder: {
    borderBottomWidth: 1,
  },
  itemInfo: {
    flex: 1,
    gap: 2,
    marginRight: spacing[3],
  },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  itemName: {
    fontFamily: fonts.sansMd,
    fontSize: 14,
    flexShrink: 1,
  },
  itemUnit: {
    ...typography.caption,
  },
  itemRegularPrice: {
    textDecorationLine: 'line-through',
  },
  giftBadge: {
    backgroundColor: colors.green[50],
    borderRadius: radius.pill,
    paddingHorizontal: spacing[2],
    paddingVertical: 1,
  },
  giftBadgeText: {
    fontFamily: fonts.sansSb,
    fontSize: 10,
    color: colors.green[800],
  },
  itemTotal: {
    fontFamily: fonts.mono,
    fontSize: 14,
  },

  // Total
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing[2],
  },
  feeLabel: {
    fontFamily: fonts.sans,
    fontSize: 14,
  },
  feeValue: {
    fontFamily: fonts.sansSb,
    fontSize: 14,
  },
  blockedHelp: {
    ...typography.bodyS,
    color: colors.coral[600],
    marginTop: spacing[2],
  },
  feeBlocked: {
    color: colors.coral[600],
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: spacing[3],
  },
  feeDistance: {
    fontFamily: fonts.sans,
    fontSize: 13,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing[3],
    borderTopWidth: 1,
  },
  totalLabel: {
    fontFamily: fonts.sansBd,
    fontSize: 16,
  },
  totalValue: {
    fontFamily: fonts.mono,
    fontSize: 20,
    color: colors.green[600],
  },

  // Payment info
  upsellBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  upsellSheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing[5],
    paddingBottom: spacing[6],
  },
  upsellTitle: {
    ...typography.h2,
    paddingHorizontal: spacing[4],
  },
  upsellSubtitle: {
    ...typography.bodyS,
    paddingHorizontal: spacing[4],
    marginTop: spacing[1],
  },
  upsellContinue: {
    marginHorizontal: spacing[4],
    marginTop: spacing[2],
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.green[400],
    alignItems: 'center',
    justifyContent: 'center',
  },
  upsellContinueText: {
    ...typography.h3,
    color: colors.neutral[0],
  },
  promoRow: {
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[3],
  },
  promoInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    ...typography.bodyL,
  },
  promoButton: {
    borderRadius: radius.md,
    paddingHorizontal: spacing[4],
    justifyContent: 'center',
    minWidth: 96,
    alignItems: 'center',
  },
  promoButtonText: { ...typography.bodyS, fontFamily: fonts.sansSb },
  promoError: { ...typography.caption, color: colors.coral[600], marginTop: spacing[1] },

  walletOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  walletOptionTitle: { ...typography.h3 },
  walletOptionHint: { ...typography.bodyS, marginTop: 2 },

  paymentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  paymentInfoText: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 11,
    lineHeight: 11 * 1.6,
  },

  // Bottom bar
  bottomBar: {
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    borderTopWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 8 },
    }),
  },
  bottomPriceCol: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  bottomPriceLabel: {
    fontFamily: fonts.sans,
    fontSize: 11,
  },
  bottomPriceValue: {
    fontFamily: fonts.mono,
    fontSize: 18,
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    height: 52,
    backgroundColor: colors.green[400],
    borderRadius: radius.pill,
  },
  confirmButtonText: {
    fontFamily: fonts.sansBd,
    fontSize: 16,
    color: colors.neutral[0],
  },
  buttonDisabled: {
    opacity: 0.5,
  },

  // WebView
  webViewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    borderBottomWidth: 1,
  },
  webViewBackButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  webViewTitle: {
    fontFamily: fonts.sansSb,
    fontSize: 16,
  },
  webView: {
    flex: 1,
  },
  webViewLoading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing[3],
  },
  webViewLoadingText: {
    fontFamily: fonts.sansMd,
    fontSize: 14,
  },

  // Fallback
  fallbackContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing[4],
  },
  fallbackText: {
    fontFamily: fonts.sansMd,
    fontSize: 14,
  },
})
