import type { Delivery, DeliveryFailReason } from '../types'
import HandCoins from 'lucide-react-native/dist/esm/icons/hand-coins'
import MapPin from 'lucide-react-native/dist/esm/icons/map-pin'
import MessageCircle from 'lucide-react-native/dist/esm/icons/message-circle'
import Navigation from 'lucide-react-native/dist/esm/icons/navigation'
import Phone from 'lucide-react-native/dist/esm/icons/phone'
import Store from 'lucide-react-native/dist/esm/icons/store'
import { useState } from 'react'
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { colors, radius, shadows, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { openDeliveryConversation } from '../../chat/delivery-chat'
import { appAlert } from '../../common/components/app-alert'
import { useLiveLocation } from '../hooks/use-live-location'
import { FAIL_REASON_LABELS } from '../types'

interface ActiveDeliveryScreenProps {
  delivery: Delivery
  pendingCount: number
  onTransition: (action: 'pickup' | 'start' | 'fail', body?: Record<string, unknown>) => Promise<{ ok: boolean, queued: boolean, errorMessage?: string }>
  onProof: () => void
  onChanged: () => void
  /** Called with the buyer thread once created/fetched. */
  onOpenChat: (conversationId: string, peerName: string) => void
}

const STEPS: Array<{ status: Delivery['status'], label: string }> = [
  { status: 'ACCEPTED', label: 'Acceptée' },
  { status: 'PICKED_UP', label: 'Récupérée' },
  { status: 'IN_TRANSIT', label: 'En livraison' },
  { status: 'DELIVERED', label: 'Livrée' },
]

/**
 * Turn-by-turn to the exact point when the buyer (or the shop) pinned one;
 * the free-text address is only the fallback — « Cotonou » is not a door.
 */
function openItinerary(address: string, position: { latitude: number, longitude: number } | null) {
  if (position) {
    const dest = `${position.latitude},${position.longitude}`
    Linking.openURL(`google.navigation:q=${dest}`).catch(() => {
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`)
    })
    return
  }
  const encoded = encodeURIComponent(address)
  Linking.openURL(`geo:0,0?q=${encoded}`).catch(() => {
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encoded}`)
  })
}

function formatAmount(amount: number): string {
  return `${amount.toLocaleString('fr-FR')} FCFA`
}

function callNumber(phone: string | null) {
  if (phone) {
    Linking.openURL(`tel:${phone}`)
  }
}

const FAIL_REASONS = Object.keys(FAIL_REASON_LABELS) as DeliveryFailReason[]

/** The courier's current job: itinerary, contacts and step transitions. */
export function ActiveDeliveryScreen({ delivery, pendingCount, onTransition, onProof, onChanged, onOpenChat }: ActiveDeliveryScreenProps) {
  const { semantic } = useTheme()
  const [openingChat, setOpeningChat] = useState(false)

  async function openChat(): Promise<void> {
    if (openingChat) {
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
  // Live position for the buyer's tracking map, only while on the road
  useLiveLocation(
    delivery.status === 'ACCEPTED' || delivery.status === 'PICKED_UP' || delivery.status === 'IN_TRANSIT',
  )
  const [failVisible, setFailVisible] = useState(false)

  const currentIndex = STEPS.findIndex(step => step.status === delivery.status)
  const isCancelled = delivery.status === 'CANCELLED'
  const courierFee = delivery.courierFee ?? 0
  // Cash orders: eBio's share of the delivery fee is debited from the wallet.
  const cashCommission = delivery.paymentMethod === 'CASH_ON_DELIVERY'
    ? Math.max(0, (delivery.deliveryFee ?? 0) - courierFee)
    : 0

  async function runTransition(action: 'pickup' | 'start') {
    const result = await onTransition(action)
    if (result.ok) {
      onChanged()
    }
    else if (result.queued) {
      appAlert('Hors connexion', 'Votre action sera synchronisée dès le retour du réseau.')
      onChanged()
    }
    else {
      appAlert('Erreur', result.errorMessage ?? 'La mise à jour a échoué. Réessayez.')
    }
  }

  async function reportFail(reason: DeliveryFailReason) {
    setFailVisible(false)
    const result = await onTransition('fail', { reason })
    if (result.ok || result.queued) {
      onChanged()
    }
    else {
      appAlert('Erreur', result.errorMessage ?? 'Le signalement a échoué. Réessayez.')
    }
  }

  if (isCancelled) {
    return (
      <View style={[styles.cancelled, { backgroundColor: semantic.bgPage }]}>
        <Text style={[styles.cancelledTitle, { color: semantic.textPrimary }]}>Course annulée</Text>
        <Text style={[styles.cancelledBody, { color: semantic.textSecondary }]}>
          {`La commande ${delivery.orderNumber} a été annulée. Cette course est retirée de votre liste.`}
        </Text>
        <Pressable style={styles.primary} onPress={onChanged} accessibilityRole="button" accessibilityLabel="Revenir aux courses">
          <Text style={styles.primaryText}>Revenir aux courses</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <ScrollView style={{ backgroundColor: semantic.bgPage }} contentContainerStyle={styles.container}>
      {pendingCount > 0
        ? (
            <View style={[styles.pendingBanner, { backgroundColor: colors.earth[50] }]}>
              <Text style={[styles.pendingText, { color: colors.earth[600] }]}>
                {`${pendingCount} action${pendingCount > 1 ? 's' : ''} en attente de synchronisation`}
              </Text>
            </View>
          )
        : null}

      <View style={[styles.card, { backgroundColor: semantic.bgCard }, shadows.sm]}>
        <Text style={[styles.orderNumber, { color: semantic.textTertiary }]}>{delivery.orderNumber}</Text>

        <View style={styles.stepper}>
          {STEPS.map((step, index) => {
            const done = index <= currentIndex
            return (
              <View key={step.status} style={styles.stepItem}>
                <View style={[styles.stepDot, { backgroundColor: done ? colors.green[400] : semantic.borderNormal }]} />
                <Text style={[styles.stepLabel, { color: done ? semantic.textPrimary : semantic.textTertiary }]}>{step.label}</Text>
              </View>
            )
          })}
        </View>

        <View style={[styles.divider, { backgroundColor: semantic.borderLight }]} />
        <View style={styles.addressRow}>
          <HandCoins size={18} color={colors.green[600]} strokeWidth={2} />
          <View style={styles.addressText}>
            <Text style={[styles.addressValue, { color: semantic.textPrimaryColor }]}>
              {`Vous gagnez ${formatAmount(courierFee)}`}
            </Text>
            {cashCommission > 0
              ? (
                  <Text style={[styles.contactName, { color: semantic.textSecondary }]}>
                    {`Commission eBio de ${formatAmount(cashCommission)} prélevée sur votre portefeuille`}
                  </Text>
                )
              : null}
          </View>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: semantic.bgCard }]}>
        <View style={styles.addressRow}>
          <Store size={18} color={colors.green[600]} strokeWidth={2} />
          <View style={styles.addressText}>
            <Text style={[styles.addressLabel, { color: semantic.textTertiary }]}>Retrait</Text>
            <Text style={[styles.addressValue, { color: semantic.textPrimary }]}>
              {`${delivery.supplierShopName} — ${delivery.pickupAddress}`}
            </Text>
          </View>
          <Pressable
            style={[styles.itineraryButton, { backgroundColor: semantic.bgPrimaryLight }]}
            onPress={() => openItinerary(delivery.pickupAddress, delivery.pickupPosition)}
            accessibilityRole="button"
            accessibilityLabel="Itinéraire vers le point de retrait"
          >
            <Navigation size={18} color={colors.green[600]} strokeWidth={2} />
          </Pressable>
        </View>

        <View style={[styles.divider, { backgroundColor: semantic.borderLight }]} />

        <View style={styles.addressRow}>
          <MapPin size={18} color={colors.coral[400]} strokeWidth={2} />
          <View style={styles.addressText}>
            <Text style={[styles.addressLabel, { color: semantic.textTertiary }]}>Livraison</Text>
            <Text style={[styles.addressValue, { color: semantic.textPrimary }]}>{delivery.dropoffAddress}</Text>
            {delivery.buyerContact
              ? <Text style={[styles.contactName, { color: semantic.textSecondary }]}>{delivery.buyerContact.name}</Text>
              : null}
          </View>
          <View style={styles.actionColumn}>
            <Pressable
              style={[styles.itineraryButton, { backgroundColor: semantic.bgPrimaryLight }]}
              onPress={() => openItinerary(delivery.dropoffAddress, delivery.dropoffPosition)}
              accessibilityRole="button"
              accessibilityLabel="Itinéraire vers le client"
            >
              <Navigation size={18} color={colors.green[600]} strokeWidth={2} />
            </Pressable>
            {delivery.buyerContact?.phone
              ? (
                  <Pressable
                    style={[styles.itineraryButton, { backgroundColor: semantic.bgPrimaryLight }]}
                    onPress={() => callNumber(delivery.buyerContact?.phone ?? null)}
                    accessibilityRole="button"
                    accessibilityLabel="Appeler le client"
                  >
                    <Phone size={18} color={colors.green[600]} strokeWidth={2} />
                  </Pressable>
                )
              : null}
            {delivery.buyerContact
              ? (
                  <Pressable
                    style={[styles.itineraryButton, { backgroundColor: semantic.bgPrimaryLight }]}
                    onPress={openChat}
                    disabled={openingChat}
                    accessibilityRole="button"
                    accessibilityLabel="Envoyer un message au client"
                  >
                    <MessageCircle size={18} color={colors.green[600]} strokeWidth={2} />
                  </Pressable>
                )
              : null}
          </View>
        </View>
      </View>

      {delivery.status === 'ACCEPTED'
        ? (
            <Pressable style={styles.primary} onPress={() => runTransition('pickup')} accessibilityRole="button" accessibilityLabel="Marquer la commande comme récupérée">
              <Text style={styles.primaryText}>Commande récupérée</Text>
            </Pressable>
          )
        : null}
      {delivery.status === 'PICKED_UP'
        ? (
            <Pressable style={styles.primary} onPress={() => runTransition('start')} accessibilityRole="button" accessibilityLabel="Démarrer la livraison">
              <Text style={styles.primaryText}>En route vers le client</Text>
            </Pressable>
          )
        : null}
      {delivery.status === 'IN_TRANSIT'
        ? (
            <Pressable style={styles.primary} onPress={onProof} accessibilityRole="button" accessibilityLabel="Confirmer la livraison">
              <Text style={styles.primaryText}>Confirmer la livraison</Text>
            </Pressable>
          )
        : null}

      <Pressable
        style={[styles.danger, { borderColor: colors.coral[400] }]}
        onPress={() => setFailVisible(true)}
        accessibilityRole="button"
        accessibilityLabel="Signaler un problème de livraison"
      >
        <Text style={[styles.dangerText, { color: colors.coral[400] }]}>Signaler un échec</Text>
      </Pressable>

      <Modal visible={failVisible} transparent animationType="fade" onRequestClose={() => setFailVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: semantic.bgCard }]}>
            <Text style={[styles.modalTitle, { color: semantic.textPrimary }]}>Motif de l'échec</Text>
            {FAIL_REASONS.map(reason => (
              <Pressable
                key={reason}
                style={[styles.modalOption, { borderColor: semantic.borderLight }]}
                onPress={() => reportFail(reason)}
                accessibilityRole="button"
                accessibilityLabel={FAIL_REASON_LABELS[reason]}
              >
                <Text style={[styles.modalOptionText, { color: semantic.textPrimary }]}>{FAIL_REASON_LABELS[reason]}</Text>
              </Pressable>
            ))}
            <Pressable
              style={styles.modalCancel}
              onPress={() => setFailVisible(false)}
              accessibilityRole="button"
              accessibilityLabel="Annuler"
            >
              <Text style={[styles.modalCancelText, { color: semantic.textTertiary }]}>Annuler</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: spacing[4],
    paddingBottom: spacing[12],
  },
  pendingBanner: {
    borderRadius: radius.md,
    padding: spacing[3],
    marginBottom: spacing[3],
  },
  pendingText: {
    ...typography.caption,
    textAlign: 'center',
  },
  card: {
    borderRadius: radius.lg,
    padding: spacing[4],
    marginBottom: spacing[3],
  },
  orderNumber: {
    ...typography.caption,
    marginBottom: spacing[3],
  },
  stepper: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stepItem: {
    alignItems: 'center',
    flex: 1,
  },
  stepDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginBottom: spacing[1],
  },
  stepLabel: {
    ...typography.caption,
    fontSize: 10,
    textAlign: 'center',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  addressText: {
    flex: 1,
  },
  addressLabel: {
    ...typography.overline,
  },
  addressValue: {
    ...typography.bodyS,
    marginTop: 2,
  },
  contactName: {
    ...typography.caption,
    marginTop: 2,
  },
  actionColumn: {
    gap: spacing[2],
  },
  itineraryButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    marginVertical: spacing[3],
  },
  primary: {
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.green[400],
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing[2],
  },
  primaryText: {
    ...typography.caption,
    fontSize: 13,
    color: colors.neutral[0],
  },
  danger: {
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing[3],
  },
  dangerText: {
    ...typography.caption,
    fontSize: 13,
  },
  cancelled: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[6],
  },
  cancelledTitle: {
    ...typography.h2,
  },
  cancelledBody: {
    ...typography.bodyL,
    textAlign: 'center',
    marginTop: spacing[2],
    marginBottom: spacing[5],
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[5],
  },
  modalCard: {
    alignSelf: 'stretch',
    borderRadius: radius.lg,
    padding: spacing[4],
  },
  modalTitle: {
    ...typography.h3,
    marginBottom: spacing[3],
  },
  modalOption: {
    minHeight: 44,
    justifyContent: 'center',
    borderBottomWidth: 1,
  },
  modalOptionText: {
    ...typography.bodyL,
  },
  modalCancel: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing[2],
  },
  modalCancelText: {
    ...typography.caption,
    fontSize: 13,
  },
})
