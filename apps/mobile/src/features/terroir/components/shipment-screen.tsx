import type { TerroirCountry, TerroirReorderLine, TerroirShipment, TerroirShipmentLine } from '../terroir-api'
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs'
import Gift from 'lucide-react-native/dist/esm/icons/gift'
import RotateCcw from 'lucide-react-native/dist/esm/icons/rotate-ccw'
import { use, useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { appAlert } from '../../common/components/app-alert'
import { ScreenHeader } from '../../common/components/screen-header'
import { Thumbnail } from '../../common/components/thumbnail'
import { PaymentWebView } from '../../payments/components/payment-web-view'
import { useTerroirMoney } from '../hooks/use-terroir-money'
import { fetchTerroirPack, fetchTerroirShipment, formatDay, formatWindow, payTerroirSupplement, removeTerroirSupplementLine, SHIPMENT_STATUS_LABELS, useTerroirCountries, verifySupplementPayment } from '../terroir-api'
import { useTerroirCart } from '../terroir-cart-context'
import { shipmentHeading, shipmentTotalLabel, StatusPill } from './shipments-list'
import { SupplementCard } from './supplement-card'
import { PickupAddress, terroirStyles } from './terroir-ui'

function formatInstant(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime()))
    return ''
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
}

function readAmount(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value) : value
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null
}

/**
 * Today's FCFA price of a line to order again, for the valise to show before
 * its first preview (which reprices everything anyway). 0 when unknown.
 */
async function currentPrice(line: TerroirReorderLine, currency: string): Promise<number> {
  try {
    if (line.packId)
      return (await fetchTerroirPack(line.packId, currency)).price
    if (!line.productId)
      return 0
    const res = await apiFetch(`/api/products/${line.productId}`)
    if (!res.ok)
      return 0
    const data = await res.json() as Record<string, unknown>
    if (line.variantId && Array.isArray(data.variants)) {
      const variant = (data.variants as Array<Record<string, unknown>>).find(entry => entry.id === line.variantId)
      const variantPrice = readAmount(variant?.price)
      if (variantPrice !== null)
        return variantPrice
    }
    return readAmount(data.promotionalPrice) ?? readAmount(data.pricePerUnit) ?? 0
  }
  catch {
    return 0
  }
}

/** « 2 produits ne sont plus disponibles : Gari, Sodabi. » */
function missingSentence(missing: TerroirReorderLine[]): string | null {
  if (missing.length === 0)
    return null
  const names = missing.map(line => line.name).join(', ')
  return missing.length === 1
    ? `1 produit n’est plus disponible : ${names}.`
    : `${missing.length} produits ne sont plus disponibles : ${names}.`
}

interface ShipmentScreenProps {
  shipmentId: string
  onBack: () => void
  /** The valise was filled again: turn the Valise mode on for this country and open « Ma valise ». */
  onReorder?: (country: TerroirCountry) => void
}

/** One terroir parcel: where it stands, its dated timeline and where to collect it. */
export function ShipmentScreen({ shipmentId, onBack, onReorder }: ShipmentScreenProps) {
  const { semantic } = useTheme()
  // The floating tab bar covers the bottom of the screen: the last button must clear it.
  const tabBarHeight = use(BottomTabBarHeightContext) ?? 0
  const { lines: valiseLines, addLine, clear } = useTerroirCart()
  const { displayCurrency } = useTerroirMoney()
  const [reordering, setReordering] = useState(false)
  // Fills the names the country helpers read.
  useTerroirCountries(true)
  const [shipment, setShipment] = useState<TerroirShipment | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState(false)
  // Hosted payment page of the weight supplement, while it is open.
  const [payment, setPayment] = useState<{ url: string, transactionId: string | null, topupId: string | null } | null>(null)

  const load = useCallback(async (): Promise<void> => {
    try {
      setShipment(await fetchTerroirShipment(shipmentId))
      setError(null)
    }
    catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Impossible de charger ce colis.')
    }
  }, [shipmentId])

  useEffect(() => {
    void load()
  }, [load])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  const startPayment = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      const result = await payTerroirSupplement(shipmentId)
      if (!result.paymentUrl) {
        appAlert('Paiement indisponible', 'La page de paiement n’a pas pu être ouverte. Réessayez dans un instant.')
        return
      }
      setPayment({ url: result.paymentUrl, transactionId: result.providerTransactionId, topupId: result.topupId })
    }
    catch (payError) {
      appAlert('Erreur', payError instanceof Error ? payError.message : 'Impossible de lancer le paiement du complément.')
    }
    finally {
      setBusy(false)
    }
  }, [shipmentId])

  // The card payment rides on a wallet top-up: verifying it settles the
  // supplement at once; the shipment then says whether it is paid.
  const pollSupplement = useCallback(async (): Promise<'settled' | 'pending' | 'failed'> => {
    const fresh = await fetchTerroirShipment(shipmentId)
    return fresh.supplement?.status === 'PAID' ? 'settled' : 'pending'
  }, [shipmentId])

  const finishPayment = useCallback(async (): Promise<void> => {
    const current = payment
    setPayment(null)
    if (current?.topupId && current.transactionId)
      await verifySupplementPayment(current.topupId, current.transactionId)
    // The return URL alone proves nothing: the shipment says whether it was paid.
    const paid = await pollSupplement().catch(() => 'pending' as const) === 'settled'
    await load()
    if (paid)
      appAlert('Complément réglé', 'Merci ! Votre colis poursuit sa route.')
    else
      appAlert('Paiement en cours de vérification', 'Nous confirmons votre paiement. Tirez l’écran vers le bas dans un instant pour voir le complément réglé.')
  }, [load, pollSupplement, payment])

  const closePayment = useCallback(() => {
    setPayment(null)
    void load()
  }, [load])

  const removeLine = useCallback(async (line: TerroirShipmentLine & { id: string }): Promise<void> => {
    setBusy(true)
    try {
      await removeTerroirSupplementLine(shipmentId, line.id)
      await load()
      appAlert('Produit retiré', `« ${line.name} » ne partira pas : il vous sera remboursé.`)
    }
    catch (removeError) {
      appAlert('Erreur', removeError instanceof Error ? removeError.message : 'Impossible de retirer ce produit.')
    }
    finally {
      setBusy(false)
    }
  }, [shipmentId, load])

  const refill = useCallback(async (available: TerroirReorderLine[], replace: boolean, country: TerroirCountry): Promise<void> => {
    setReordering(true)
    try {
      const prices = await Promise.all(available.map(line => currentPrice(line, displayCurrency)))
      if (replace)
        clear()
      available.forEach((line, index) => {
        addLine(line.packId
          ? { kind: 'PACK', packId: line.packId, name: line.name, imageUrl: line.imageUrl, price: prices[index] ?? 0, shopName: line.shopName, quantity: line.quantity }
          : { kind: 'PRODUCT', productId: line.productId ?? undefined, variantId: line.variantId, name: line.name, imageUrl: line.imageUrl, price: prices[index] ?? 0, shopName: line.shopName, quantity: line.quantity })
      })
      onReorder?.(country)
    }
    finally {
      setReordering(false)
    }
  }, [displayCurrency, clear, addLine, onReorder])

  const handleReorder = useCallback(() => {
    if (!shipment)
      return
    const available = shipment.reorderLines.filter(line => line.available)
    const missingNote = missingSentence(shipment.reorderLines.filter(line => !line.available))
    if (available.length === 0) {
      appAlert('Valise indisponible', missingNote ?? 'Aucun produit de cette valise ne peut repartir pour le moment.')
      return
    }
    const run = (replace: boolean): void => {
      void refill(available, replace, shipment.country)
    }
    if (valiseLines.length > 0) {
      const message = ['Votre valise contient déjà des produits. Voulez-vous la remplacer, ou y ajouter ceux de cet envoi ?', missingNote]
        .filter((part): part is string => part !== null)
        .join('\n\n')
      appAlert('Refaire cette valise', message, [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Ajouter', onPress: () => run(false) },
        { text: 'Remplacer', style: 'destructive', onPress: () => run(true) },
      ])
      return
    }
    if (missingNote) {
      appAlert('Refaire cette valise', missingNote, [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Continuer', onPress: () => run(false) },
      ])
      return
    }
    run(false)
  }, [shipment, valiseLines.length, refill])

  if (payment) {
    return (
      <PaymentWebView
        url={payment.url}
        transactionId={payment.transactionId}
        title="Complément de poids"
        onSettled={finishPayment}
        onCancel={closePayment}
        pollStatus={pollSupplement}
      />
    )
  }

  if (!shipment) {
    return (
      <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
        <ScreenHeader title="Ma valise envoyée" onBack={onBack} />
        <View style={terroirStyles.centered}>
          {error
            ? <Text style={[terroirStyles.muted, { color: semantic.textSecondary }]}>{error}</Text>
            : <ActivityIndicator color={colors.green[400]} />}
        </View>
      </View>
    )
  }

  const events = [...shipment.events].sort((a, b) => b.at.localeCompare(a.at))
  return (
    <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader title="Ma valise envoyée" subtitle={shipmentHeading(shipment.country)} onBack={onBack} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + spacing[6] }]}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void handleRefresh()
            }}
          />
        )}
      >
        <View style={[terroirStyles.card, { backgroundColor: semantic.bgCard }]}>
          <StatusPill status={shipment.status} />
          {shipment.agency && (
            <Text style={[styles.line, { color: semantic.textPrimary }]}>
              {`${shipment.agency}${shipment.departsOn ? ` · départ le ${formatDay(shipment.departsOn)}` : ''}`}
            </Text>
          )}
          {(shipment.arrivalFrom || shipment.arrivalTo) && (
            <Text style={[styles.line, { color: semantic.textSecondary }]}>
              {`Arrivée estimée : ${formatWindow(shipment.arrivalFrom, shipment.arrivalTo)}`}
            </Text>
          )}
          {shipment.giftName && (
            <View style={styles.giftRow}>
              <Gift size={16} color={colors.earth[600]} strokeWidth={2.2} />
              <Text style={[styles.line, styles.flex, { color: semantic.textPrimary }]}>
                {`Offert à ${shipment.giftName} : le colis lui sera remis à son nom.`}
              </Text>
            </View>
          )}
          {shipment.giftMessage && (
            <Text style={[styles.line, { color: semantic.textSecondary }]}>{`« ${shipment.giftMessage} »`}</Text>
          )}
        </View>

        {shipment.supplement && (
          <SupplementCard
            supplement={shipment.supplement}
            lines={shipment.lines}
            busy={busy}
            onPay={() => {
              void startPayment()
            }}
            onRemoveLine={(line) => {
              void removeLine(line)
            }}
          />
        )}

        <View style={[terroirStyles.card, { backgroundColor: semantic.bgCard }]}>
          <Text style={[terroirStyles.cardTitle, { color: semantic.textPrimary }]}>
            {shipment.reception === 'HOME' ? 'Livraison à domicile' : 'Retrait'}
          </Text>
          {shipment.reception === 'PICKUP' && shipment.pickupPoint && (
            <PickupAddress address={shipment.pickupPoint.address} openingHours={shipment.pickupPoint.openingHours} city={shipment.pickupPoint.city} />
          )}
          {shipment.reception === 'PICKUP' && !shipment.pickupPoint && (
            <Text style={[styles.line, { color: semantic.textSecondary }]}>L’adresse de retrait sera indiquée à l’arrivée du colis.</Text>
          )}
          {shipment.reception === 'HOME' && shipment.homeAddress && (
            <Text style={[styles.line, { color: semantic.textPrimary }]}>{shipment.homeAddress}</Text>
          )}
        </View>

        <View style={[terroirStyles.card, { backgroundColor: semantic.bgCard }]}>
          <Text style={[terroirStyles.cardTitle, { color: semantic.textPrimary }]}>Suivi</Text>
          {events.length === 0 && (
            <Text style={[styles.line, { color: semantic.textSecondary }]}>Les étapes de votre colis s’afficheront ici.</Text>
          )}
          {events.map((event, index) => (
            <View key={`${event.at}-${index}`} style={styles.event}>
              <View style={[styles.dot, { backgroundColor: index === 0 ? colors.green[600] : semantic.borderNormal }]} />
              <View style={styles.flex}>
                {event.step && (
                  <Text style={[styles.eventTitle, { color: semantic.textPrimary }]}>{SHIPMENT_STATUS_LABELS[event.step]}</Text>
                )}
                {event.message && <Text style={[styles.line, { color: semantic.textPrimary }]}>{event.message}</Text>}
                {event.pickupPoint && <Text style={[styles.line, { color: semantic.textSecondary }]}>{event.pickupPoint}</Text>}
                <Text style={[styles.eventDate, { color: semantic.textTertiary }]}>{formatInstant(event.at)}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={[terroirStyles.card, { backgroundColor: semantic.bgCard }]}>
          <Text style={[terroirStyles.cardTitle, { color: semantic.textPrimary }]}>Contenu</Text>
          {shipment.lines.map((line, index) => (
            <View key={`${line.name}-${index}`} style={styles.lineRow}>
              <Thumbnail uri={line.imageUrl} style={styles.lineImage} alt={line.name} />
              <View style={styles.flex}>
                <Text style={[styles.eventTitle, { color: semantic.textPrimary }]}>{`${line.quantity} × ${line.name}`}</Text>
                {line.shopName && <Text style={[styles.eventDate, { color: semantic.textSecondary }]}>{line.shopName}</Text>}
              </View>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={[styles.eventTitle, { color: semantic.textPrimary }]}>Total</Text>
            <Text style={[styles.total, { color: semantic.textPrimary }]}>{shipmentTotalLabel(shipment)}</Text>
          </View>
          {shipment.insured && <Text style={[styles.eventDate, { color: semantic.textSecondary }]}>Colis assuré</Text>}
        </View>

        {onReorder && shipment.reorderLines.length > 0 && (
          <TouchableOpacity
            style={[terroirStyles.primaryButton, reordering && terroirStyles.disabled]}
            onPress={handleReorder}
            disabled={reordering}
            accessibilityRole="button"
            accessibilityState={{ disabled: reordering, busy: reordering }}
          >
            {reordering
              ? <ActivityIndicator color={colors.neutral[0]} />
              : <RotateCcw size={18} color={colors.neutral[0]} strokeWidth={2.2} />}
            <Text style={terroirStyles.primaryButtonText}>Refaire cette valise</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
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
    paddingBottom: spacing[10],
  },
  flex: {
    flex: 1,
  },
  line: {
    ...typography.bodyS,
  },
  giftRow: {
    flexDirection: 'row',
    gap: spacing[2],
    alignItems: 'flex-start',
  },
  event: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    marginTop: spacing[1],
  },
  eventTitle: {
    fontFamily: fonts.sansSb,
    fontSize: 14,
  },
  eventDate: {
    ...typography.caption,
  },
  lineRow: {
    flexDirection: 'row',
    gap: spacing[3],
    alignItems: 'center',
  },
  lineImage: {
    width: 56,
    height: 42,
    borderRadius: radius.sm,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  total: {
    fontFamily: fonts.mono,
    fontSize: 14,
    flexShrink: 1,
    textAlign: 'right',
  },
})
