import type { TransitionResult } from '../hooks/use-offline-queue'
import type { ActiveRun, ActiveRunStop } from '../types'
import Banknote from 'lucide-react-native/dist/esm/icons/banknote'
import CheckCircle2 from 'lucide-react-native/dist/esm/icons/check-circle-2'
import HandCoins from 'lucide-react-native/dist/esm/icons/hand-coins'
import MapPin from 'lucide-react-native/dist/esm/icons/map-pin'
import Navigation from 'lucide-react-native/dist/esm/icons/navigation'
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { colors, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { appAlert } from '../../common/components/app-alert'
import { useLiveLocation } from '../hooks/use-live-location'

interface ActiveRunScreenProps {
  run: ActiveRun
  pendingCount: number
  /** Collecte d'une boutique : une seule commande avance. */
  onCollect: (deliveryId: string) => Promise<TransitionResult>
  /** Remise unique : ouvre la saisie du code, qui clôt toute la tournée. */
  onDeliver: () => void
  onChanged: () => void
}

function formatAmount(amount: number): string {
  return `${amount.toLocaleString('fr-FR').replace(/\u202F/g, ' ')} FCFA`
}

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

interface StopRowProps {
  stop: ActiveRunStop
  index: number
  /** La prochaine à collecter : la seule qui porte un bouton. */
  isNext: boolean
  onCollect: () => void
}

/**
 * Une collecte. Un seul bouton à l'écran, sur la prochaine boutique : donner
 * le choix inviterait à collecter dans le désordre, et l'ordre est justement
 * ce qui raccourcit le trajet.
 */
function StopRow({ stop, index, isNext, onCollect }: StopRowProps) {
  const { semantic } = useTheme()
  const done = stop.status !== 'ACCEPTED'
  return (
    <View style={[styles.stop, { borderColor: semantic.borderLight }]}>
      <View style={styles.stopHead}>
        <View style={[styles.stopIndex, done ? styles.stopIndexDone : null]}>
          {done
            ? <CheckCircle2 size={14} color={colors.neutral[0]} strokeWidth={2.4} />
            : <Text style={styles.stopIndexText}>{index + 1}</Text>}
        </View>
        <View style={styles.stopBody}>
          <Text style={[styles.stopShop, { color: semantic.textPrimary }]} numberOfLines={1}>{stop.shopName}</Text>
          <Text style={[styles.stopAddress, { color: semantic.textSecondary }]} numberOfLines={2}>{stop.pickupAddress}</Text>
          <Text style={[styles.stopMeta, { color: semantic.textTertiary }]}>
            {`${stop.orderNumber} · ${stop.itemsCount} article${stop.itemsCount > 1 ? 's' : ''}`}
          </Text>
        </View>
        {done
          ? null
          : (
              <Pressable
                style={styles.iconButton}
                onPress={() => openItinerary(stop.pickupAddress, stop.pickupPosition)}
                accessibilityRole="button"
                accessibilityLabel={`Itinéraire vers ${stop.shopName}`}
              >
                <Navigation size={18} color={colors.green[600]} strokeWidth={2} />
              </Pressable>
            )}
      </View>
      {isNext
        ? (
            <Pressable
              style={styles.primary}
              onPress={onCollect}
              accessibilityRole="button"
              accessibilityLabel={`Marquer la collecte chez ${stop.shopName}`}
            >
              <Text style={styles.primaryText}>{`Colis récupéré chez ${stop.shopName}`}</Text>
            </Pressable>
          )
        : null}
    </View>
  )
}

/**
 * La tournée en cours : les collectes dans l'ordre, puis une seule remise.
 *
 * Le livreur ne voit jamais deux courses séparées — il a un trajet et un
 * client au bout. Les numéros de commande restent affichés parce que les
 * boutiques les demandent au retrait.
 */
export function ActiveRunScreen({ run, pendingCount, onCollect, onDeliver, onChanged }: ActiveRunScreenProps) {
  const { semantic } = useTheme()
  useLiveLocation(run.status === 'ACCEPTED' || run.status === 'COLLECTING' || run.status === 'DELIVERING')

  const isCash = run.paymentMethod === 'CASH_ON_DELIVERY'
  const nextIndex = run.stops.findIndex(stop => stop.status === 'ACCEPTED')
  const allCollected = nextIndex === -1
  const collected = run.stops.filter(stop => stop.status !== 'ACCEPTED').length

  async function collect(deliveryId: string) {
    const result = await onCollect(deliveryId)
    if (result.ok) {
      onChanged()
    }
    else if (result.queued) {
      appAlert('Hors connexion', 'Votre collecte sera synchronisée dès le retour du réseau.')
      onChanged()
    }
    else {
      appAlert('Erreur', result.errorMessage ?? 'La mise à jour a échoué. Réessayez.')
    }
  }

  return (
    <ScrollView style={{ backgroundColor: semantic.bgPage }} contentContainerStyle={styles.content}>
      <View style={[styles.card, { backgroundColor: semantic.bgCard }]}>
        <Text style={[styles.progress, { color: semantic.textPrimaryColor }]}>
          {allCollected
            ? 'Tout est chargé — direction le client'
            : `${collected} sur ${run.shopCount} boutique${run.shopCount > 1 ? 's' : ''} collectée${collected > 1 ? 's' : ''}`}
        </Text>
        <View style={styles.line}>
          <HandCoins size={16} color={colors.green[600]} strokeWidth={2} />
          <Text style={[styles.lineText, { color: semantic.textPrimaryColor }]}>
            {`Vous gagnez ${formatAmount(run.courierFee)} pour la tournée`}
          </Text>
        </View>
        {isCash && run.cashToShop !== null
          ? (
              <View style={styles.line}>
                <Banknote size={16} color={colors.earth[600]} strokeWidth={2} />
                <Text style={[styles.lineText, { color: colors.earth[800] }]}>
                  {`Vous avancez ${formatAmount(run.cashToShop)} aux boutiques · le client vous remet ${formatAmount(run.cashToCollect ?? run.totalAmount)}`}
                </Text>
              </View>
            )
          : null}
        {pendingCount > 0
          ? (
              <Text style={[styles.pending, { color: semantic.textTertiary }]}>
                {`${pendingCount} action${pendingCount > 1 ? 's' : ''} en attente de réseau`}
              </Text>
            )
          : null}
      </View>

      {run.stops.map((stop, index) => (
        <StopRow
          key={stop.deliveryId}
          stop={stop}
          index={index}
          isNext={index === nextIndex}
          onCollect={() => collect(stop.deliveryId)}
        />
      ))}

      <View style={[styles.card, { backgroundColor: semantic.bgCard }]}>
        <View style={styles.stopHead}>
          <MapPin size={20} color={colors.coral[400]} strokeWidth={2} />
          <View style={styles.stopBody}>
            <Text style={[styles.stopShop, { color: semantic.textPrimary }]} numberOfLines={2}>{run.dropoffAddress}</Text>
            <Text style={[styles.stopMeta, { color: semantic.textTertiary }]}>
              {run.shopCount > 1 ? 'Une seule remise pour toutes les boutiques' : 'Remise au client'}
            </Text>
          </View>
          <Pressable
            style={styles.iconButton}
            onPress={() => openItinerary(run.dropoffAddress, run.dropoffPosition)}
            accessibilityRole="button"
            accessibilityLabel="Itinéraire vers le client"
          >
            <Navigation size={18} color={colors.green[600]} strokeWidth={2} />
          </Pressable>
        </View>
        {allCollected
          ? (
              <Pressable
                style={styles.primary}
                onPress={onDeliver}
                accessibilityRole="button"
                accessibilityLabel="Confirmer la remise de la tournée"
              >
                <Text style={styles.primaryText}>Remettre au client</Text>
              </Pressable>
            )
          : (
              <Text style={[styles.stopMeta, { color: semantic.textTertiary }]}>
                Collectez toutes les boutiques avant la remise
              </Text>
            )}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: {
    padding: spacing[4],
    gap: spacing[3],
  },
  card: {
    borderRadius: radius.lg,
    padding: spacing[4],
    gap: spacing[2],
  },
  progress: {
    ...typography.bodyL,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  lineText: {
    ...typography.bodyS,
    flex: 1,
  },
  pending: {
    ...typography.caption,
  },
  stop: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing[4],
    gap: spacing[3],
  },
  stopHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
  },
  stopIndex: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green[600],
  },
  stopIndexDone: {
    backgroundColor: colors.neutral[400],
  },
  stopIndexText: {
    ...typography.caption,
    color: colors.neutral[0],
  },
  stopBody: {
    flex: 1,
    gap: 2,
  },
  stopShop: {
    ...typography.bodyL,
  },
  stopAddress: {
    ...typography.bodyS,
  },
  stopMeta: {
    ...typography.caption,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green[50],
  },
  primary: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green[600],
    paddingHorizontal: spacing[4],
  },
  primaryText: {
    ...typography.bodyL,
    color: colors.neutral[0],
  },
})
