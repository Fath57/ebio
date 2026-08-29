import type { Delivery } from '../types'
import MessageCircle from 'lucide-react-native/dist/esm/icons/message-circle'
import Navigation from 'lucide-react-native/dist/esm/icons/navigation'
import { useState } from 'react'
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { colors, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { openDeliveryConversation } from '../../chat/delivery-chat'
import { appAlert } from '../../common/components/app-alert'
import { DELIVERY_STATUS_LABELS, FAIL_REASON_LABELS } from '../types'

interface DeliveryDetailProps {
  delivery: Delivery
  /** Opens the buyer thread of this delivery (history keeps it readable). */
  onOpenChat?: (conversationId: string, peerName: string) => void
}

const EVENT_LABELS: Record<string, string> = {
  CREATED: 'Course créée',
  BROADCAST: 'Proposée aux livreurs',
  ACCEPTED: 'Acceptée',
  PICKED_UP: 'Commande récupérée',
  IN_TRANSIT: 'En route vers le client',
  DELIVERED: 'Livrée',
  FAILED: 'Échec de livraison',
  REASSIGNED: 'Réattribuée',
  ORDER_CANCELLED: 'Commande annulée',
  SELF_DELIVERED: 'Livrée par le fournisseur',
}

function formatDateTime(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function formatAmount(amount: number): string {
  return `${amount.toLocaleString('fr-FR')} FCFA`
}

/** Read-only recap of a delivery with its full journaled timeline. */
/** Hands the drop-off point to the phone's maps app (Google Maps on Android). */
function openRoute(position: { latitude: number, longitude: number }): void {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${position.latitude},${position.longitude}&travelmode=driving`
  Linking.openURL(url).catch(() => {
    // No maps app: nothing actionable on our side.
  })
}

export function DeliveryDetail({ delivery, onOpenChat }: DeliveryDetailProps) {
  const { semantic } = useTheme()
  const [openingChat, setOpeningChat] = useState(false)
  const failed = delivery.status === 'FAILED'

  async function openChat(): Promise<void> {
    if (openingChat || !onOpenChat) {
      return
    }
    setOpeningChat(true)
    try {
      const conv = await openDeliveryConversation(delivery.id)
      onOpenChat(conv.conversationId, conv.peerName ?? delivery.buyerContact?.name ?? 'Client')
    }
    catch (error) {
      appAlert('Discussion indisponible', error instanceof Error ? error.message : undefined)
    }
    finally {
      setOpeningChat(false)
    }
  }
  const courierFee = delivery.courierFee ?? 0
  // Cash orders: eBio's share of the delivery fee is debited from the wallet.
  const cashCommission = delivery.paymentMethod === 'CASH_ON_DELIVERY'
    ? Math.max(0, (delivery.deliveryFee ?? 0) - courierFee)
    : 0

  return (
    <ScrollView style={{ backgroundColor: semantic.bgPage }} contentContainerStyle={styles.container}>
      <View style={[styles.card, { backgroundColor: semantic.bgCard }]}>
        <View style={styles.headerRow}>
          <Text style={[styles.orderNumber, { color: semantic.textTertiary }]}>{delivery.orderNumber}</Text>
          <View style={[styles.statusBadge, { backgroundColor: failed ? colors.coral[50] : semantic.bgPrimaryLight }]}>
            <Text style={[styles.statusText, { color: failed ? colors.coral[600] : semantic.textPrimaryColor }]}>
              {DELIVERY_STATUS_LABELS[delivery.status]}
            </Text>
          </View>
        </View>

        <Text style={[styles.label, { color: semantic.textTertiary }]}>Retrait</Text>
        <Text style={[styles.value, { color: semantic.textPrimary }]}>
          {`${delivery.supplierShopName} — ${delivery.pickupAddress}`}
        </Text>
        <Text style={[styles.label, { color: semantic.textTertiary }]}>Livraison</Text>
        <Text style={[styles.value, { color: semantic.textPrimary }]}>{delivery.dropoffAddress}</Text>
        {delivery.dropoffPosition && (
          <Pressable
            style={[styles.routeButton, { borderColor: semantic.borderNormal }]}
            onPress={() => openRoute(delivery.dropoffPosition!)}
            accessibilityRole="button"
            accessibilityLabel="Ouvrir l’itinéraire vers le client"
          >
            <Navigation size={16} color={colors.green[600]} strokeWidth={2.2} />
            <Text style={[styles.routeText, { color: colors.green[800] }]}>Itinéraire vers le client</Text>
          </Pressable>
        )}
        {delivery.buyerContact && onOpenChat && (
          <Pressable
            style={[styles.routeButton, { borderColor: semantic.borderNormal }]}
            onPress={openChat}
            disabled={openingChat}
            accessibilityRole="button"
            accessibilityLabel="Voir la discussion avec le client"
          >
            <MessageCircle size={16} color={colors.green[600]} strokeWidth={2.2} />
            <Text style={[styles.routeText, { color: colors.green[800] }]}>Voir la discussion</Text>
          </Pressable>
        )}
        <Text style={[styles.label, { color: semantic.textTertiary }]}>Montant de la commande</Text>
        <Text style={[styles.amount, { color: semantic.textPrimary }]}>{formatAmount(delivery.totalAmount)}</Text>
        <Text style={[styles.label, { color: semantic.textTertiary }]}>Votre gain</Text>
        <Text style={[styles.amount, { color: semantic.textPrimaryColor }]}>{`Vous gagnez ${formatAmount(courierFee)}`}</Text>
        {cashCommission > 0
          ? (
              <Text style={[styles.value, { color: semantic.textSecondary }]}>
                {`Commission eBio de ${formatAmount(cashCommission)} prélevée sur votre portefeuille`}
              </Text>
            )
          : null}

        {failed && delivery.failReason
          ? (
              <View style={[styles.failBox, { backgroundColor: colors.coral[50] }]}>
                <Text style={[styles.failText, { color: colors.coral[800] }]}>
                  {FAIL_REASON_LABELS[delivery.failReason]}
                  {delivery.failComment ? ` — ${delivery.failComment}` : ''}
                </Text>
              </View>
            )
          : null}
      </View>

      <View style={[styles.card, { backgroundColor: semantic.bgCard }]}>
        <Text style={[styles.timelineTitle, { color: semantic.textPrimary }]}>Historique</Text>
        {delivery.events.map((event, index) => (
          <View key={`${event.type}-${event.occurredAt}-${String(index)}`} style={styles.eventRow}>
            <View style={[styles.eventDot, { backgroundColor: colors.green[400] }]} />
            <View style={styles.eventText}>
              <Text style={[styles.eventLabel, { color: semantic.textPrimary }]}>
                {EVENT_LABELS[event.type] ?? event.type}
              </Text>
              <Text style={[styles.eventDate, { color: semantic.textTertiary }]}>{formatDateTime(event.occurredAt)}</Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  routeButton: {
    minHeight: 44,
    marginTop: spacing[2],
    borderWidth: 1,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
  },
  routeText: {
    ...typography.caption,
    fontSize: 13,
  },
  container: {
    padding: spacing[4],
    paddingBottom: spacing[12],
  },
  card: {
    borderRadius: radius.lg,
    padding: spacing[4],
    marginBottom: spacing[3],
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[3],
  },
  orderNumber: {
    ...typography.caption,
  },
  statusBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  statusText: {
    ...typography.caption,
  },
  label: {
    ...typography.overline,
    marginTop: spacing[3],
  },
  value: {
    ...typography.bodyS,
    marginTop: 2,
  },
  amount: {
    ...typography.price,
    marginTop: 2,
  },
  failBox: {
    borderRadius: radius.md,
    padding: spacing[3],
    marginTop: spacing[3],
  },
  failText: {
    ...typography.bodyS,
  },
  timelineTitle: {
    ...typography.h3,
    marginBottom: spacing[3],
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    marginBottom: spacing[3],
  },
  eventDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  eventText: {
    flex: 1,
  },
  eventLabel: {
    ...typography.bodyS,
  },
  eventDate: {
    ...typography.caption,
    marginTop: 1,
  },
})
