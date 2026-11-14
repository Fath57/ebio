import type { SettlementStatus } from '../../payments/utils/await-settlement'
import type { TerroirCheckoutInput, TerroirCountry, TerroirDeparture, TerroirGiftInput } from '../terroir-api'
import CircleCheck from 'lucide-react-native/dist/esm/icons/circle-check'
import CreditCard from 'lucide-react-native/dist/esm/icons/credit-card'
import Gift from 'lucide-react-native/dist/esm/icons/gift'
import Plane from 'lucide-react-native/dist/esm/icons/plane'
import ShieldCheck from 'lucide-react-native/dist/esm/icons/shield-check'
import Wallet from 'lucide-react-native/dist/esm/icons/wallet'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { appAlert } from '../../common/components/app-alert'
import { KeyboardAwareView } from '../../common/components/keyboard-aware-view'
import { ScreenHeader } from '../../common/components/screen-header'
import { formatCurrencyAmount, formatXof } from '../../common/hooks/use-money'
import { PaymentWebView } from '../../payments/components/payment-web-view'
import { awaitSettlement, readVerifyOutcome } from '../../payments/utils/await-settlement'
import { buildCheckoutHtml, paymentPublicKey } from '../../payments/utils/checkout-widget'
import { useTerroirMoney } from '../hooks/use-terroir-money'
import { useTerroirPreview } from '../hooks/use-terroir-preview'
import { countryLabel, createTerroirCheckout, formatDay, formatKg, formatWindow, TerroirError } from '../terroir-api'
import { useTerroirCart } from '../terroir-cart-context'
import { CountryChips, PickupAddress, terroirStyles } from './terroir-ui'

type PaymentChoice = 'FEDAPAY' | 'WALLET'

const MIN_ADDRESS_LENGTH = 10
const EMAIL_PATTERN = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/
const PHONE_PATTERN = /^\+\d{8,15}$/

export interface TerroirCustomer {
  name: string
  email: string | null
  phone: string | null
}

interface GiftDraft {
  name: string
  email: string
  phone: string
  country: TerroirCountry
  message: string
}

/** The departure offered first: the earliest one still open. */
function nearestDeparture(departures: TerroirDeparture[]): TerroirDeparture | null {
  const open = departures.filter(departure => !departure.full)
  return [...open].sort((a, b) => a.departsOn.localeCompare(b.departsOn))[0] ?? null
}

/** « +33 6 12 34 56 78 » → « +33612345678 »; a leading 00 becomes +. */
function normalizePhone(phone: string): string {
  const compact = phone.replace(/[\s.()-]/g, '')
  return compact.startsWith('00') ? `+${compact.slice(2)}` : compact
}

function giftProblem(gift: GiftDraft): string | null {
  const email = gift.email.trim()
  const phone = normalizePhone(gift.phone)
  if (gift.name.trim().length < 2)
    return 'Indiquez le nom de la personne qui recevra le colis : il sera remis à son nom.'
  if (!email && !phone)
    return 'Indiquez l’e-mail ou le téléphone du destinataire : le suivi lui sera envoyé, sans les prix.'
  if (email && !EMAIL_PATTERN.test(email))
    return 'L’adresse e-mail du destinataire n’est pas valide.'
  if (phone && !PHONE_PATTERN.test(phone))
    return 'Indiquez le téléphone au format international, par exemple +33 6 12 34 56 78.'
  return null
}

function toGiftInput(gift: GiftDraft): TerroirGiftInput {
  const email = gift.email.trim()
  const phone = normalizePhone(gift.phone)
  return { name: gift.name.trim(), email: email || null, phone: phone || null, message: gift.message.trim() || null }
}

interface DepartureOptionProps {
  departure: TerroirDeparture
  selected: boolean
  onSelect: (departureId: string) => void
}

function DepartureOption({ departure, selected, onSelect }: DepartureOptionProps) {
  const { semantic } = useTheme()
  const { formatMoney } = useTerroirMoney()
  // The server's own conversion wins over today's rate.
  const price = departure.shippingPrice === null
    ? null
    : departure.displayShippingPrice !== null && departure.displayCurrency
      ? { primary: formatCurrencyAmount(departure.displayShippingPrice, departure.displayCurrency) }
      : formatMoney(departure.shippingPrice)
  return (
    <TouchableOpacity
      style={[
        styles.option,
        selected
          ? { backgroundColor: semantic.bgPrimaryLight, borderColor: colors.green[600] }
          : { backgroundColor: semantic.bgCard, borderColor: semantic.borderNormal },
        departure.full && terroirStyles.disabled,
      ]}
      onPress={() => onSelect(departure.departureId)}
      disabled={departure.full}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: departure.full }}
    >
      <View style={styles.optionHeader}>
        <Text style={[styles.optionTitle, { color: semantic.textPrimary }]}>{departure.agency}</Text>
        {selected && <CircleCheck size={18} color={colors.green[600]} strokeWidth={2.2} />}
      </View>
      <Text style={[styles.optionLine, { color: semantic.textSecondary }]}>{`Départ le ${formatDay(departure.departsOn)}`}</Text>
      {(departure.arrivalFrom || departure.arrivalTo) && (
        <Text style={[styles.optionLine, { color: semantic.textSecondary }]}>
          {`Arrivée estimée : ${formatWindow(departure.arrivalFrom, departure.arrivalTo)}`}
        </Text>
      )}
      {departure.orderBefore && (
        <Text style={[styles.optionLine, { color: semantic.textSecondary }]}>{`Commandez avant le ${formatDay(departure.orderBefore)}`}</Text>
      )}
      {price && (
        <Text style={[terroirStyles.price, { color: semantic.textPrimary }]}>
          {`${price.primary} de transport`}
        </Text>
      )}
      {departure.full && <Text style={[styles.optionLine, { color: semantic.textSecondary }]}>Complet</Text>}
      <Text style={[styles.optionHint, { color: semantic.textTertiary }]}>Droits et taxes inclus</Text>
    </TouchableOpacity>
  )
}

interface RecapRowProps {
  label: string
  primary: string
  secondary?: string | null
  strong?: boolean
}

function RecapRow({ label, primary, secondary, strong = false }: RecapRowProps) {
  const { semantic } = useTheme()
  return (
    <View style={styles.recapRow}>
      <Text style={[strong ? styles.recapLabelStrong : styles.recapLabel, { color: strong ? semantic.textPrimary : semantic.textSecondary }]}>{label}</Text>
      <View style={styles.recapValue}>
        <Text style={[strong ? styles.recapTotal : terroirStyles.price, { color: semantic.textPrimary }]}>{primary}</Text>
        {secondary && <Text style={[terroirStyles.priceSecondary, { color: semantic.textTertiary }]}>{secondary}</Text>}
      </View>
    </View>
  )
}

interface TerroirCheckoutScreenProps {
  customer: TerroirCustomer
  onBack: () => void
  /** Paid (or paid from the wallet): the basket is emptied, the parcel opens. */
  onComplete: (shipmentId: string) => void
}

export function TerroirCheckoutScreen({ customer, onBack, onComplete }: TerroirCheckoutScreenProps) {
  const { semantic } = useTheme()
  const insets = useSafeAreaInsets()
  const { formatMoney, formatServer, displayCurrency } = useTerroirMoney()
  const { lines, country, toInput, clear } = useTerroirCart()

  const [giftOn, setGiftOn] = useState(false)
  const [gift, setGift] = useState<GiftDraft>({ name: '', email: '', phone: '', country, message: '' })
  const [departureId, setDepartureId] = useState<string | null>(null)
  const [reception, setReception] = useState<'PICKUP' | 'HOME'>('PICKUP')
  const [pickupPointId, setPickupPointId] = useState<string | null>(null)
  const [homeAddress, setHomeAddress] = useState('')
  const [insured, setInsured] = useState(false)
  const [paymentChoice, setPaymentChoice] = useState<PaymentChoice>('FEDAPAY')
  const [walletBalance, setWalletBalance] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Card payment in flight.
  const [pendingCheckoutId, setPendingCheckoutId] = useState<string | null>(null)
  const [pendingShipmentId, setPendingShipmentId] = useState<string | null>(null)
  const [hostedPaymentUrl, setHostedPaymentUrl] = useState<string | null>(null)
  const [providerTransactionId, setProviderTransactionId] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [amountDue, setAmountDue] = useState<number | null>(null)
  const lastPolledRef = useRef<SettlementStatus>('pending')

  // Departures follow the recipient's country for a gift (US10).
  const targetCountry: TerroirCountry = giftOn ? gift.country : country

  useEffect(() => {
    setDepartureId(null)
    setPickupPointId(null)
  }, [targetCountry])

  useEffect(() => {
    let cancelled = false
    async function loadBalance(): Promise<void> {
      try {
        const res = await apiFetch('/api/wallet/me')
        if (res.ok && !cancelled) {
          const data = await res.json() as { balance?: number }
          setWalletBalance(typeof data.balance === 'number' ? data.balance : 0)
        }
      }
      catch {
        // the wallet stays hidden; the card is unaffected
      }
    }
    loadBalance()
    return () => {
      cancelled = true
    }
  }, [])

  const trimmedAddress = homeAddress.trim()
  const giftPayload = useMemo(() => giftOn && !giftProblem(gift) ? toGiftInput(gift) : null, [giftOn, gift])

  const previewInput = useMemo<TerroirCheckoutInput | null>(() => lines.length === 0
    ? null
    : {
        country: targetCountry,
        lines: toInput(),
        departureId,
        reception,
        pickupPointId,
        homeAddress: reception === 'HOME' && trimmedAddress.length >= MIN_ADDRESS_LENGTH ? trimmedAddress : null,
        insured,
        gift: giftPayload,
        paymentMethod: paymentChoice,
        displayCurrency,
      }, [lines.length, targetCountry, toInput, departureId, reception, pickupPointId, trimmedAddress, insured, giftPayload, paymentChoice, displayCurrency])
  const { preview, loading: previewLoading, error: previewError } = useTerroirPreview(previewInput)

  const departures = useMemo(() => preview?.departures ?? [], [preview?.departures])
  const serverDepartureId = preview?.departureId ?? null
  // The nearest departure is preselected as soon as the list arrives: the
  // server's own pick first, else the earliest still open.
  useEffect(() => {
    if (departureId && departures.some(departure => departure.departureId === departureId && !departure.full))
      return
    const fallback = departures.find(departure => departure.departureId === serverDepartureId && !departure.full) ?? nearestDeparture(departures)
    if (fallback)
      setDepartureId(fallback.departureId)
  }, [departures, departureId, serverDepartureId])

  const selected = departures.find(departure => departure.departureId === departureId) ?? null
  const homeAvailable = selected?.homeDeliveryFee !== null && selected?.homeDeliveryFee !== undefined
  useEffect(() => {
    if (!homeAvailable && reception === 'HOME')
      setReception('PICKUP')
  }, [homeAvailable, reception])

  const pickupPoints = useMemo(() => selected?.pickupPoints ?? [], [selected])
  useEffect(() => {
    if (pickupPoints.length === 0)
      return
    if (!pickupPoints.some(point => point.id === pickupPointId))
      setPickupPointId(pickupPoints[0]?.id ?? null)
  }, [pickupPoints, pickupPointId])

  const total = preview?.total ?? 0
  const walletAvailable = walletBalance !== null && preview !== null && walletBalance >= total
  const effectiveChoice: PaymentChoice = paymentChoice === 'WALLET' && !walletAvailable ? 'FEDAPAY' : paymentChoice
  const noDeparture = preview !== null && nearestDeparture(departures) === null
  const canSubmit = preview !== null && !previewLoading && selected !== null && !submitting && preview.unavailable.length === 0

  const finish = useCallback((shipmentId: string) => {
    clear()
    onComplete(shipmentId)
  }, [clear, onComplete])

  const handleSubmit = useCallback(async () => {
    if (!preview || !selected)
      return
    if (giftOn) {
      const problem = giftProblem(gift)
      if (problem) {
        appAlert('Offrir à quelqu’un', problem)
        return
      }
    }
    if (reception === 'HOME' && trimmedAddress.length < MIN_ADDRESS_LENGTH) {
      appAlert('Adresse de livraison', 'Indiquez l’adresse complète : numéro, rue, code postal et ville.')
      return
    }
    setSubmitting(true)
    try {
      const result = await createTerroirCheckout({
        country: targetCountry,
        lines: toInput(),
        departureId: selected.departureId,
        reception,
        pickupPointId,
        homeAddress: reception === 'HOME' ? trimmedAddress : null,
        insured,
        gift: giftOn ? toGiftInput(gift) : null,
        paymentMethod: effectiveChoice,
        displayCurrency,
      })
      if (effectiveChoice === 'WALLET') {
        finish(result.shipmentId)
        return
      }
      const paymentRes = await apiFetch('/api/payments/cart/initiate', {
        method: 'POST',
        body: JSON.stringify({ checkoutId: result.checkoutId }),
      })
      if (!paymentRes.ok) {
        const error = await paymentRes.json().catch(() => null) as { message?: string } | null
        appAlert('Paiement', error?.message ?? 'Impossible d’ouvrir le paiement. Réessayez.')
        return
      }
      const payment = await paymentRes.json() as { paymentUrl?: string | null, providerTransactionId?: string | null }
      lastPolledRef.current = 'pending'
      setAmountDue(total)
      setPendingCheckoutId(result.checkoutId)
      setPendingShipmentId(result.shipmentId)
      setHostedPaymentUrl(payment.paymentUrl ?? result.paymentUrl)
      setProviderTransactionId(payment.providerTransactionId ?? null)
      setPaying(true)
    }
    catch (error) {
      appAlert('Commande impossible', error instanceof TerroirError ? error.message : 'Vérifiez votre connexion et réessayez.')
    }
    finally {
      setSubmitting(false)
    }
  }, [preview, selected, giftOn, gift, reception, trimmedAddress, targetCountry, toInput, pickupPointId, insured, effectiveChoice, displayCurrency, finish, total])

  const verifyCart = useCallback(async (checkoutId: string, reference: string): Promise<SettlementStatus> => {
    const res = await apiFetch('/api/payments/cart/verify', {
      method: 'POST',
      body: JSON.stringify({ checkoutId, fedapayTransactionId: reference }),
    })
    return readVerifyOutcome(res)
  }, [])

  const pollStatus = useCallback(async (): Promise<SettlementStatus> => {
    if (!pendingCheckoutId || !providerTransactionId)
      return 'pending'
    const status = await verifyCart(pendingCheckoutId, providerTransactionId)
    lastPolledRef.current = status
    return status
  }, [pendingCheckoutId, providerTransactionId, verifyCart])

  const confirmPayment = useCallback(async (reference: string) => {
    if (!pendingCheckoutId)
      return
    setPaying(false)
    setConfirming(true)
    const status = await awaitSettlement(() => verifyCart(pendingCheckoutId, reference))
    setConfirming(false)
    if (status === 'settled' && pendingShipmentId) {
      finish(pendingShipmentId)
      return
    }
    if (status === 'failed') {
      appAlert('Paiement échoué', 'Le paiement n’a pas abouti. Aucun montant n’a été débité.')
      return
    }
    appAlert(
      'Paiement en cours de confirmation',
      'Ne payez pas une seconde fois : votre colis apparaîtra dans « Colis terroir » dès que le paiement sera confirmé.',
    )
    onBack()
  }, [pendingCheckoutId, pendingShipmentId, verifyCart, finish, onBack])

  const cancelPayment = useCallback(async () => {
    setPaying(false)
    const checkoutId = pendingCheckoutId
    const reference = providerTransactionId
    if (!checkoutId || !reference || lastPolledRef.current === 'failed')
      return
    try {
      const status = await verifyCart(checkoutId, reference)
      if (status === 'settled' && pendingShipmentId)
        finish(pendingShipmentId)
      else if (status === 'failed')
        appAlert('Paiement échoué', 'Le paiement n’a pas abouti. Aucun montant n’a été débité.')
    }
    catch {
      // offline: the server's reconciliation takes over
    }
  }, [pendingCheckoutId, providerTransactionId, pendingShipmentId, verifyCart, finish])

  if (confirming) {
    return (
      <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
        <View style={terroirStyles.centered}>
          <ActivityIndicator size="large" color={colors.green[400]} />
          <Text style={[terroirStyles.muted, { color: semantic.textSecondary }]}>Confirmation du paiement en cours…</Text>
        </View>
      </View>
    )
  }

  const publicKey = paymentPublicKey()
  if (paying && pendingCheckoutId && (hostedPaymentUrl || publicKey)) {
    return (
      <PaymentWebView
        url={hostedPaymentUrl}
        html={hostedPaymentUrl || !publicKey
          ? null
          : buildCheckoutHtml({
              publicKey,
              amount: amountDue ?? total,
              description: 'Colis terroir eBio',
              customer,
              metadata: { payment_id: pendingCheckoutId },
            })}
        transactionId={providerTransactionId}
        onSettled={confirmPayment}
        onCancel={() => {
          void cancelPayment()
        }}
        pollStatus={pollStatus}
      />
    )
  }

  const display = preview?.display ?? null
  const itemsTotal = preview ? formatServer(preview.itemsTotal, display, 'itemsTotal') : null
  const shipping = preview ? formatServer(preview.shippingPrice, display, 'shippingPrice') : null
  const insurance = preview && preview.insurancePrice > 0 ? formatServer(preview.insurancePrice, display, 'insurancePrice') : null
  const insuranceOffer = preview && preview.optionInsurancePrice > 0 ? formatMoney(preview.optionInsurancePrice) : null
  const home = preview && preview.homeDeliveryFee > 0 ? formatServer(preview.homeDeliveryFee, display, 'homeDeliveryFee') : null
  const totalMoney = preview ? formatServer(preview.total, display, 'total') : null

  return (
    <KeyboardAwareView style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader title="Commander" subtitle={`Colis vers la ${countryLabel(targetCountry)}`} onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Gift (US10) */}
        <View style={[terroirStyles.card, { backgroundColor: semantic.bgCard }]}>
          <View style={styles.switchRow}>
            <Gift size={18} color={colors.earth[600]} strokeWidth={2.2} />
            <Text style={[styles.switchLabel, { color: semantic.textPrimary }]}>Offrir à quelqu’un</Text>
            <Switch
              value={giftOn}
              onValueChange={setGiftOn}
              trackColor={{ true: colors.green[400], false: semantic.borderNormal }}
              accessibilityLabel="Offrir à quelqu’un"
            />
          </View>
          {giftOn && (
            <View style={styles.form}>
              <CountryChips value={gift.country} onChange={value => setGift(current => ({ ...current, country: value }))} label="Pays du destinataire" />
              <Text style={[styles.inputLabel, { color: semantic.textSecondary }]}>Nom du destinataire *</Text>
              <TextInput
                style={[styles.input, { color: semantic.textPrimary, borderColor: semantic.borderNormal, backgroundColor: semantic.bgSurface }]}
                value={gift.name}
                onChangeText={value => setGift(current => ({ ...current, name: value }))}
                placeholder="Le colis sera remis à ce nom"
                placeholderTextColor={semantic.textTertiary}
                accessibilityLabel="Nom du destinataire"
              />
              <Text style={[styles.optionHint, { color: semantic.textSecondary }]}>Indiquez au moins l’e-mail ou le téléphone.</Text>
              <Text style={[styles.inputLabel, { color: semantic.textSecondary }]}>E-mail du destinataire</Text>
              <TextInput
                style={[styles.input, { color: semantic.textPrimary, borderColor: semantic.borderNormal, backgroundColor: semantic.bgSurface }]}
                value={gift.email}
                onChangeText={value => setGift(current => ({ ...current, email: value }))}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Le suivi y sera envoyé, sans les prix"
                placeholderTextColor={semantic.textTertiary}
                accessibilityLabel="E-mail du destinataire"
              />
              <Text style={[styles.inputLabel, { color: semantic.textSecondary }]}>Téléphone du destinataire</Text>
              <TextInput
                style={[styles.input, { color: semantic.textPrimary, borderColor: semantic.borderNormal, backgroundColor: semantic.bgSurface }]}
                value={gift.phone}
                onChangeText={value => setGift(current => ({ ...current, phone: value }))}
                keyboardType="phone-pad"
                placeholder={gift.country === 'BE' ? '+32 …' : '+33 …'}
                placeholderTextColor={semantic.textTertiary}
                accessibilityLabel="Téléphone du destinataire"
              />
              <Text style={[styles.inputLabel, { color: semantic.textSecondary }]}>Message (facultatif)</Text>
              <TextInput
                style={[styles.input, styles.multiline, { color: semantic.textPrimary, borderColor: semantic.borderNormal, backgroundColor: semantic.bgSurface }]}
                value={gift.message}
                onChangeText={value => setGift(current => ({ ...current, message: value.slice(0, 300) }))}
                multiline
                placeholder="Joyeux anniversaire, un peu du pays"
                placeholderTextColor={semantic.textTertiary}
                accessibilityLabel="Message pour le destinataire"
              />
            </View>
          )}
        </View>

        {/* Departures */}
        <View style={[terroirStyles.card, { backgroundColor: semantic.bgCard }]}>
          <View style={styles.switchRow}>
            <Plane size={18} color={colors.blue[600]} strokeWidth={2.2} />
            <Text style={[terroirStyles.cardTitle, styles.flex, { color: semantic.textPrimary }]}>Départ</Text>
          </View>
          {preview && (
            <Text style={[styles.optionLine, { color: semantic.textSecondary }]}>
              {`Poids estimé du colis : ${formatKg(preview.estimatedWeightG / 1000)}${preview.billedKg > 0 ? ` · facturé ${formatKg(preview.billedKg)}` : ''}`}
            </Text>
          )}
          {previewLoading && !preview && <ActivityIndicator color={colors.green[400]} />}
          {noDeparture && (
            <Text style={[styles.optionLine, { color: semantic.textPrimary }]}>
              {`Aucun envoi n’est programmé vers la ${countryLabel(targetCountry)} pour l’instant. Revenez bientôt ou activez l’alerte depuis l’espace Terroir.`}
            </Text>
          )}
          <View style={styles.options} accessibilityRole="radiogroup">
            {departures.map(departure => (
              <DepartureOption
                key={departure.departureId}
                departure={departure}
                selected={departure.departureId === departureId}
                onSelect={setDepartureId}
              />
            ))}
          </View>
        </View>

        {/* Reception */}
        {selected && (
          <View style={[terroirStyles.card, { backgroundColor: semantic.bgCard }]}>
            <Text style={[terroirStyles.cardTitle, { color: semantic.textPrimary }]}>Réception</Text>
            <View style={styles.options} accessibilityRole="radiogroup">
              <TouchableOpacity
                style={[styles.option, reception === 'PICKUP'
                  ? { backgroundColor: semantic.bgPrimaryLight, borderColor: colors.green[600] }
                  : { backgroundColor: semantic.bgCard, borderColor: semantic.borderNormal }]}
                onPress={() => setReception('PICKUP')}
                accessibilityRole="radio"
                accessibilityState={{ selected: reception === 'PICKUP' }}
              >
                <View style={styles.optionHeader}>
                  <Text style={[styles.optionTitle, { color: semantic.textPrimary }]}>Retrait à l’agence</Text>
                  {reception === 'PICKUP' && <CircleCheck size={18} color={colors.green[600]} strokeWidth={2.2} />}
                </View>
                <Text style={[styles.optionHint, { color: semantic.textTertiary }]}>Sans supplément</Text>
              </TouchableOpacity>
              {homeAvailable && (
                <TouchableOpacity
                  style={[styles.option, reception === 'HOME'
                    ? { backgroundColor: semantic.bgPrimaryLight, borderColor: colors.green[600] }
                    : { backgroundColor: semantic.bgCard, borderColor: semantic.borderNormal }]}
                  onPress={() => setReception('HOME')}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: reception === 'HOME' }}
                >
                  <View style={styles.optionHeader}>
                    <Text style={[styles.optionTitle, { color: semantic.textPrimary }]}>Livraison à domicile</Text>
                    {reception === 'HOME' && <CircleCheck size={18} color={colors.green[600]} strokeWidth={2.2} />}
                  </View>
                  <Text style={[terroirStyles.priceSecondary, { color: semantic.textPrimary }]}>
                    {`+ ${formatMoney(selected.homeDeliveryFee ?? 0).primary}`}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            {reception === 'PICKUP' && pickupPoints.length > 0 && (
              <View style={styles.options} accessibilityRole="radiogroup">
                {pickupPoints.map(point => (
                  <TouchableOpacity
                    key={point.id ?? point.address}
                    style={[styles.option, point.id === pickupPointId
                      ? { backgroundColor: semantic.bgPrimaryLight, borderColor: colors.green[600] }
                      : { backgroundColor: semantic.bgCard, borderColor: semantic.borderNormal }]}
                    onPress={() => setPickupPointId(point.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: point.id === pickupPointId }}
                  >
                    <PickupAddress address={point.address} openingHours={point.openingHours} city={point.city} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {reception === 'PICKUP' && pickupPoints.length === 0 && (
              <Text style={[styles.optionLine, { color: semantic.textSecondary }]}>
                L’adresse et les horaires du point de retrait vous seront indiqués dans le suivi du colis.
              </Text>
            )}
            {reception === 'HOME' && (
              <View style={styles.form}>
                <Text style={[styles.inputLabel, { color: semantic.textSecondary }]}>Adresse de livraison *</Text>
                <TextInput
                  style={[styles.input, styles.multiline, { color: semantic.textPrimary, borderColor: semantic.borderNormal, backgroundColor: semantic.bgSurface }]}
                  value={homeAddress}
                  onChangeText={setHomeAddress}
                  multiline
                  placeholder="Numéro, rue, code postal, ville"
                  placeholderTextColor={semantic.textTertiary}
                  accessibilityLabel="Adresse de livraison"
                />
              </View>
            )}
          </View>
        )}

        {/* Insurance */}
        <View style={[terroirStyles.card, { backgroundColor: semantic.bgCard }]}>
          <View style={styles.switchRow}>
            <ShieldCheck size={18} color={colors.green[600]} strokeWidth={2.2} />
            <View style={styles.flex}>
              <Text style={[styles.switchLabel, { color: semantic.textPrimary }]}>Assurer mon colis</Text>
              <Text style={[styles.optionHint, { color: semantic.textSecondary }]}>
                {(insurance ?? insuranceOffer) ? `${(insurance ?? insuranceOffer)?.primary ?? ''}, remboursé en cas de perte ou de casse` : 'Remboursé en cas de perte ou de casse'}
              </Text>
            </View>
            <Switch
              value={insured}
              onValueChange={setInsured}
              trackColor={{ true: colors.green[400], false: semantic.borderNormal }}
              accessibilityLabel="Assurer mon colis"
            />
          </View>
        </View>

        {/* Payment */}
        <View style={[terroirStyles.card, { backgroundColor: semantic.bgCard }]}>
          <Text style={[terroirStyles.cardTitle, { color: semantic.textPrimary }]}>Paiement</Text>
          <View style={styles.options} accessibilityRole="radiogroup">
            <TouchableOpacity
              style={[styles.payOption, effectiveChoice === 'FEDAPAY'
                ? { backgroundColor: semantic.bgPrimaryLight, borderColor: colors.green[600] }
                : { backgroundColor: semantic.bgCard, borderColor: semantic.borderNormal }]}
              onPress={() => setPaymentChoice('FEDAPAY')}
              accessibilityRole="radio"
              accessibilityState={{ selected: effectiveChoice === 'FEDAPAY' }}
            >
              <CreditCard size={18} color={semantic.textSecondary} strokeWidth={2} />
              <View style={styles.flex}>
                <Text style={[styles.optionTitle, { color: semantic.textPrimary }]}>Carte bancaire</Text>
                <Text style={[styles.optionHint, { color: semantic.textSecondary }]}>Paiement en ligne sécurisé, Visa ou Mastercard</Text>
              </View>
              {effectiveChoice === 'FEDAPAY' && <CircleCheck size={18} color={colors.green[600]} strokeWidth={2.2} />}
            </TouchableOpacity>
            {walletAvailable && (
              <TouchableOpacity
                style={[styles.payOption, effectiveChoice === 'WALLET'
                  ? { backgroundColor: semantic.bgPrimaryLight, borderColor: colors.green[600] }
                  : { backgroundColor: semantic.bgCard, borderColor: semantic.borderNormal }]}
                onPress={() => setPaymentChoice('WALLET')}
                accessibilityRole="radio"
                accessibilityState={{ selected: effectiveChoice === 'WALLET' }}
              >
                <Wallet size={18} color={semantic.textSecondary} strokeWidth={2} />
                <View style={styles.flex}>
                  <Text style={[styles.optionTitle, { color: semantic.textPrimary }]}>Mon portefeuille</Text>
                  <Text style={[styles.optionHint, { color: semantic.textSecondary }]}>{`Solde : ${formatXof(walletBalance ?? 0)}, débit immédiat`}</Text>
                </View>
                {effectiveChoice === 'WALLET' && <CircleCheck size={18} color={colors.green[600]} strokeWidth={2.2} />}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Recap */}
        <View style={[terroirStyles.card, { backgroundColor: semantic.bgCard }]}>
          <Text style={[terroirStyles.cardTitle, { color: semantic.textPrimary }]}>Récapitulatif</Text>
          {previewError && <Text style={[styles.optionLine, { color: colors.coral[600] }]}>{previewError}</Text>}
          {preview && preview.unavailable.length > 0 && (
            <Text style={[styles.optionLine, { color: colors.coral[600] }]}>
              Un article n’est plus disponible à l’export : retirez-le de votre panier terroir.
            </Text>
          )}
          {itemsTotal && <RecapRow label="Produits" primary={itemsTotal.primary} secondary={itemsTotal.secondary} />}
          {shipping && <RecapRow label="Transport (droits et taxes inclus)" primary={shipping.primary} secondary={shipping.secondary} />}
          {home && <RecapRow label="Livraison à domicile" primary={home.primary} secondary={home.secondary} />}
          {insured && insurance && <RecapRow label="Assurance" primary={insurance.primary} secondary={insurance.secondary} />}
          {totalMoney && <RecapRow label="Total" primary={totalMoney.primary} secondary={totalMoney.secondary} strong />}
          {display && preview && (
            <Text style={[styles.optionHint, { color: semantic.textSecondary }]}>
              {`Le montant prélevé par votre banque peut différer légèrement ; vous serez débité de ${formatXof(preview.total)}.`}
            </Text>
          )}
          {(selected?.collectBefore ?? selected?.orderBefore) && (
            <Text style={[styles.optionHint, { color: semantic.textSecondary }]}>
              {`eBio collecte vos produits auprès des boutiques avant le ${formatDay(selected?.collectBefore ?? selected?.orderBefore ?? null)}.`}
            </Text>
          )}
        </View>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: semantic.bgCard, borderTopColor: semantic.borderLight, paddingBottom: insets.bottom + spacing[3] }]}>
        <TouchableOpacity
          style={[terroirStyles.primaryButton, !canSubmit && terroirStyles.disabled]}
          onPress={() => {
            void handleSubmit()
          }}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit, busy: submitting }}
        >
          {submitting
            ? <ActivityIndicator color={colors.neutral[0]} />
            : (
                <Text style={terroirStyles.primaryButtonText}>
                  {effectiveChoice === 'WALLET' ? 'Payer avec le portefeuille' : 'Payer par carte'}
                  {totalMoney ? ` · ${totalMoney.primary}` : ''}
                </Text>
              )}
        </TouchableOpacity>
      </View>
    </KeyboardAwareView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: spacing[4],
    gap: spacing[4],
    paddingBottom: spacing[8],
  },
  flex: {
    flex: 1,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    minHeight: 44,
  },
  switchLabel: {
    flex: 1,
    fontFamily: fonts.sansSb,
    fontSize: 15,
  },
  form: {
    gap: spacing[2],
  },
  inputLabel: {
    ...typography.caption,
    marginTop: spacing[1],
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    fontFamily: fonts.sans,
    fontSize: 15,
  },
  multiline: {
    minHeight: 88,
    paddingTop: spacing[3],
    textAlignVertical: 'top',
  },
  options: {
    gap: spacing[2],
  },
  option: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing[3],
    gap: 2,
    minHeight: 44,
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  optionTitle: {
    fontFamily: fonts.sansSb,
    fontSize: 14,
  },
  optionLine: {
    ...typography.bodyS,
  },
  optionHint: {
    ...typography.caption,
  },
  payOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing[3],
    minHeight: 44,
  },
  recapRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  recapLabel: {
    ...typography.bodyS,
    flex: 1,
  },
  recapLabelStrong: {
    fontFamily: fonts.sansBd,
    fontSize: 16,
    flex: 1,
  },
  recapValue: {
    alignItems: 'flex-end',
  },
  recapTotal: {
    fontFamily: fonts.mono,
    fontSize: 18,
  },
  footer: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    borderTopWidth: 1,
  },
})
