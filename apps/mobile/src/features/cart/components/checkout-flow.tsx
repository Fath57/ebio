import ArrowLeft from 'lucide-react-native/dist/esm/icons/arrow-left'
import ArrowRight from 'lucide-react-native/dist/esm/icons/arrow-right'
import CircleCheck from 'lucide-react-native/dist/esm/icons/circle-check'
import MapPin from 'lucide-react-native/dist/esm/icons/map-pin'
import Store from 'lucide-react-native/dist/esm/icons/store'
import Truck from 'lucide-react-native/dist/esm/icons/truck'
import * as React from 'react'
import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { appAlert } from '../../common/components/app-alert'

type CheckoutStep = 'SUMMARY' | 'PAYMENT' | 'SUCCESS'

interface OrderSummary {
  supplierId: string
  supplierName: string
  items: Array<{
    productId: string
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

function buildFedaPayCheckoutHtml(
  publicKey: string,
  amount: number,
  description: string,
  paymentId: string,
  customer: CustomerInfo,
): string {
  const nameParts = customer.name.trim().split(/\s+/)
  const firstname = nameParts[0] ?? ''
  const lastname = nameParts.slice(1).join(' ') || firstname

  const customerBlock = [
    `firstname: '${firstname.replace(/'/g, '\\\'')}'`,
    `lastname: '${lastname.replace(/'/g, '\\\'')}'`,
    customer.email ? `email: '${customer.email.replace(/'/g, '\\\'')}'` : null,
    customer.phone ? `phone_number: { number: '${customer.phone}', country: 'BJ' }` : null,
  ].filter(Boolean).join(',\n          ')

  return `
<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body {
    margin: 0;
    padding: 20px;
    background: #F7F6F2;
    font-family: -apple-system, sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
  }
  .loading { color: #5A5852; font-size: 16px; text-align: center; }
</style>
</head><body>
<p class="loading">Chargement du paiement...</p>
<script src="https://cdn.fedapay.com/checkout.js?v=1.1.7"></script>
<script>
  FedaPay.init({
    public_key: '${publicKey}',
    transaction: {
      amount: ${amount},
      description: '${description.replace(/'/g, '\\\'')}',
      custom_metadata: { payment_id: '${paymentId}' }
    },
    customer: {
      ${customerBlock}
    },
    currency: { iso: 'XOF' },
    onComplete: function(resp) {
      if (resp.reason === 'CHECKOUT_COMPLETED' || (resp.transaction && resp.transaction.status === 'approved')) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'completed',
          transactionId: String(resp.transaction.id)
        }));
      } else {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'failed',
          reason: resp.reason || 'Paiement échoué'
        }));
      }
    },
    onClose: function() {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'closed' }));
    }
  }).open();
</script>
</body></html>`
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
  const [deliverySlot, setDeliverySlot] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const fedapayPublicKey = process.env.EXPO_PUBLIC_FEDAPAY_PUBLIC_KEY ?? null
  const [pendingPaymentId, setPendingPaymentId] = useState<string | null>(null)
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null)
  const [orderNumber, setOrderNumber] = useState<string | null>(null)

  const handleProceedToPayment = useCallback(async () => {
    if (orderSummary.deliveryMode === 'DELIVERY' && !deliveryAddress.trim()) {
      appAlert('Adresse requise', 'Veuillez saisir une adresse de livraison.')
      return
    }

    setIsSubmitting(true)
    try {
      // Create order
      const orderRes = await apiFetch('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          supplierId: orderSummary.supplierId,
          pickupMode: orderSummary.deliveryMode === 'PICKUP' ? 'ON_SITE' : 'DELIVERY',
          paymentMethod: fedapayPublicKey ? 'FEDAPAY' : 'CASH_ON_DELIVERY',
          deliveryAddress: orderSummary.deliveryMode === 'DELIVERY' ? deliveryAddress : undefined,
          deliverySlot: deliverySlot || undefined,
          items: orderSummary.items.map(item => ({
            productId: item.productId,
            ...(item.variantId ? { variantId: item.variantId } : {}),
            quantity: item.quantity,
          })),
        }),
      })

      let order: { id: string, orderNumber?: string }

      if (orderRes.ok) {
        order = await orderRes.json()
      }
      else if (orderRes.status === 409) {
        // Duplicate — find the existing pending order
        const listRes = await apiFetch('/api/orders?status=PLACED&view=buyer')
        const orders = listRes.ok ? await listRes.json() : []
        const existing = (orders.data ?? orders)
          .find((o: { supplierId: string }) => o.supplierId === orderSummary.supplierId)
        if (!existing) {
          appAlert('Erreur', 'Commande existante introuvable. Veuillez réessayer dans 2 minutes.')
          return
        }
        order = existing
      }
      else {
        const error = await orderRes.json().catch(() => null)
        const message = error?.aggregateErrors?.[0]?.message
          ?? error?.message
          ?? 'Impossible de créer la commande. Veuillez réessayer.'
        appAlert('Erreur', message)
        return
      }

      setOrderNumber(order.orderNumber ?? order.id)
      setPendingOrderId(order.id)

      if (!fedapayPublicKey) {
        onComplete(order.orderNumber ?? order.id, order.id)
        return
      }

      // Initiate FedaPay checkout payment
      const paymentRes = await apiFetch('/api/payments/initiate-checkout', {
        method: 'POST',
        body: JSON.stringify({ orderId: order.id }),
      })

      if (!paymentRes.ok) {
        const error = await paymentRes.json().catch(() => null)
        appAlert('Erreur', error?.message ?? 'Impossible d\'initier le paiement.')
        return
      }

      const payment = await paymentRes.json()
      setPendingPaymentId(payment.paymentId)
      setCurrentStep('PAYMENT')
    }
    catch {
      appAlert('Erreur', 'Une erreur est survenue.')
    }
    finally {
      setIsSubmitting(false)
    }
  }, [orderSummary, deliveryAddress, deliverySlot, fedapayPublicKey, orderNumber, onComplete])

  const handleWebViewMessage = useCallback(async (event: { nativeEvent: { data: string } }) => {
    try {
      const data = JSON.parse(event.nativeEvent.data)

      if (data.type === 'completed' && pendingPaymentId && pendingOrderId) {
        // Verify payment
        await apiFetch('/api/payments/verify-checkout', {
          method: 'POST',
          body: JSON.stringify({
            orderId: pendingOrderId,
            paymentId: pendingPaymentId,
            fedapayTransactionId: data.transactionId,
          }),
        })
        if (orderNumber && pendingOrderId) {
          onComplete(orderNumber, pendingOrderId)
        }
      }
      else if (data.type === 'closed') {
        appAlert(
          'Paiement annulé',
          'Le paiement a été annulé. Votre commande reste en attente de paiement.',
          [
            { text: 'OK', onPress: () => setCurrentStep('SUMMARY') },
          ],
        )
      }
      else if (data.type === 'failed') {
        appAlert('Paiement échoué', data.reason ?? 'Le paiement a échoué.')
        setCurrentStep('SUMMARY')
      }
    }
    catch {
      // Ignore parse errors
    }
  }, [pendingPaymentId, pendingOrderId, orderNumber, onComplete])

  // ─── STEP: SUMMARY ─────────────────────────────────────────────────────────

  if (currentStep === 'SUMMARY') {
    return (
      <View style={[styles.container, { backgroundColor: semantic.bgPage }]}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.stepHeader}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={onCancel}
              accessibilityLabel="Retour"
            >
              <ArrowLeft size={22} color={semantic.textPrimary} strokeWidth={2} />
            </TouchableOpacity>
            <Text style={[styles.stepTitle, { color: semantic.textPrimary }]}>
              Validation de la commande
            </Text>
          </View>

          {/* Supplier */}
          <View style={[styles.card, { backgroundColor: semantic.bgCard, borderColor: semantic.borderLight }]}>
            <View style={styles.supplierRow}>
              <View style={[styles.supplierIcon, { backgroundColor: semantic.bgPrimaryLight }]}>
                <Store size={16} color={colors.green[600]} strokeWidth={2} />
              </View>
              <Text style={[styles.supplierName, { color: semantic.textPrimary }]}>
                {orderSummary.supplierName}
              </Text>
            </View>
          </View>

          {/* Delivery mode */}
          <View style={[styles.card, { backgroundColor: semantic.bgCard, borderColor: semantic.borderLight }]}>
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
                  Adresse de livraison *
                </Text>
                <TextInput
                  style={[styles.textInput, { color: semantic.textPrimary, backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }]}
                  placeholder="Saisissez votre adresse complète"
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
          <View style={[styles.card, { backgroundColor: semantic.bgCard, borderColor: semantic.borderLight }]}>
            <Text style={[styles.cardTitle, { color: semantic.textPrimary }]}>
              Récapitulatif
            </Text>

            {orderSummary.items.map((item, index) => (
              <View
                key={index}
                style={[
                  styles.itemRow,
                  index < orderSummary.items.length - 1 && [styles.itemRowBorder, { borderBottomColor: semantic.borderLight }],
                ]}
              >
                <View style={styles.itemInfo}>
                  <Text style={[styles.itemName, { color: semantic.textPrimary }]} numberOfLines={1}>
                    {item.quantity}
                    x
                    {item.name}
                  </Text>
                  <Text style={[styles.itemUnit, { color: semantic.textTertiary }]}>
                    {formatPrice(item.pricePerUnit)}
                    {' '}
                    FCFA /
                    {item.unit}
                  </Text>
                </View>
                <Text style={[styles.itemTotal, { color: semantic.textPrimary }]}>
                  {formatPrice(item.quantity * item.pricePerUnit)}
                  {' '}
                  FCFA
                </Text>
              </View>
            ))}

            <View style={[styles.totalRow, { borderTopColor: semantic.borderNormal }]}>
              <Text style={[styles.totalLabel, { color: semantic.textPrimary }]}>Total</Text>
              <Text style={styles.totalValue}>
                {formatPrice(orderSummary.total)}
                {' '}
                FCFA
              </Text>
            </View>
          </View>

          {/* Payment info */}
          <View style={[styles.paymentInfo, { backgroundColor: semantic.bgSurface, borderColor: semantic.borderLight }]}>
            <CircleCheck size={16} color={colors.green[400]} strokeWidth={2} />
            <Text style={[styles.paymentInfoText, { color: semantic.textSecondary }]}>
              Paiement sécurisé via FedaPay (Mobile Money, Visa, Mastercard)
            </Text>
          </View>
        </ScrollView>

        {/* Bottom bar */}
        <View style={[styles.bottomBar, { backgroundColor: semantic.bgPage, borderTopColor: semantic.borderLight, paddingBottom: Math.max(insets.bottom, spacing[4]) }]}>
          <View style={styles.bottomPriceCol}>
            <Text style={[styles.bottomPriceLabel, { color: semantic.textTertiary }]}>Total</Text>
            <Text style={[styles.bottomPriceValue, { color: semantic.textPrimary }]}>
              {formatPrice(orderSummary.total)}
              {' '}
              FCFA
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.confirmButton, isSubmitting && styles.buttonDisabled]}
            onPress={handleProceedToPayment}
            disabled={isSubmitting}
            activeOpacity={0.8}
          >
            {isSubmitting
              ? <ActivityIndicator size="small" color={colors.neutral[0]} />
              : (
                  <>
                    <Text style={styles.confirmButtonText}>Payer maintenant</Text>
                    <ArrowRight size={18} color={colors.neutral[0]} strokeWidth={2.5} />
                  </>
                )}
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // ─── STEP: PAYMENT (FedaPay WebView) ───────────────────────────────────────

  if (currentStep === 'PAYMENT' && fedapayPublicKey && pendingPaymentId) {
    const checkoutHtml = buildFedaPayCheckoutHtml(
      fedapayPublicKey,
      orderSummary.total,
      `Commande eBio - ${orderSummary.supplierName}`,
      pendingPaymentId,
      customer,
    )

    return (
      <View style={[styles.container, { backgroundColor: semantic.bgPage }]}>
        <View style={[styles.webViewHeader, { paddingTop: insets.top, backgroundColor: semantic.bgCard, borderBottomColor: semantic.borderLight }]}>
          <TouchableOpacity
            style={styles.webViewBackButton}
            onPress={() => {
              appAlert(
                'Annuler le paiement ?',
                'Votre commande restera en attente de paiement.',
                [
                  { text: 'Continuer le paiement', style: 'cancel' },
                  {
                    text: 'Annuler',
                    style: 'destructive',
                    onPress: () => setCurrentStep('SUMMARY'),
                  },
                ],
              )
            }}
          >
            <ArrowLeft size={22} color={semantic.textPrimary} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={[styles.webViewTitle, { color: semantic.textPrimary }]}>
            Paiement sécurisé
          </Text>
          <View style={styles.webViewBackButton} />
        </View>
        <WebView
          source={{ html: checkoutHtml }}
          style={styles.webView}
          onMessage={handleWebViewMessage}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
          renderLoading={() => (
            <View style={[styles.webViewLoading, { backgroundColor: semantic.bgPage }]}>
              <ActivityIndicator size="large" color={colors.green[400]} />
              <Text style={[styles.webViewLoadingText, { color: semantic.textSecondary }]}>
                Chargement du paiement...
              </Text>
            </View>
          )}
        />
      </View>
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
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    paddingBottom: spacing[12],
    gap: spacing[3],
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

  // Cards
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
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
  itemName: {
    fontFamily: fonts.sansMd,
    fontSize: 14,
  },
  itemUnit: {
    ...typography.caption,
  },
  itemTotal: {
    fontFamily: fonts.mono,
    fontSize: 14,
  },

  // Total
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
  paymentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    padding: spacing[4],
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  paymentInfoText: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 12 * 1.6,
  },

  // Bottom bar
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
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
    gap: 2,
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
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    height: 52,
    backgroundColor: colors.green[400],
    borderRadius: radius.lg,
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
