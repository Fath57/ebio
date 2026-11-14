import type { TerroirShipment } from '../terroir-api'
import Gift from 'lucide-react-native/dist/esm/icons/gift'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { ScreenHeader } from '../../common/components/screen-header'
import { Thumbnail } from '../../common/components/thumbnail'
import { formatXof } from '../../common/hooks/use-money'
import { countryLabel, fetchTerroirShipment, formatDay, formatWindow, SHIPMENT_STATUS_LABELS } from '../terroir-api'
import { shipmentTotalLabel, StatusPill } from './shipments-list'
import { PickupAddress, terroirStyles } from './terroir-ui'

function formatInstant(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime()))
    return ''
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
}

interface ShipmentScreenProps {
  shipmentId: string
  onBack: () => void
}

/** One terroir parcel: where it stands, its dated timeline and where to collect it. */
export function ShipmentScreen({ shipmentId, onBack }: ShipmentScreenProps) {
  const { semantic } = useTheme()
  const [shipment, setShipment] = useState<TerroirShipment | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

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

  if (!shipment) {
    return (
      <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
        <ScreenHeader title="Colis terroir" onBack={onBack} />
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
      <ScreenHeader title="Colis terroir" subtitle={`Vers la ${countryLabel(shipment.country)}`} onBack={onBack} />
      <ScrollView
        contentContainerStyle={styles.content}
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
          <View style={[terroirStyles.card, { backgroundColor: colors.earth[50] }]}>
            <Text style={[terroirStyles.cardTitle, { color: colors.earth[800] }]}>Complément de poids</Text>
            <Text style={[styles.line, { color: colors.earth[800] }]}>
              {`Votre colis pèse plus que prévu : ${formatXof(shipment.supplement.amount)} à régler${shipment.supplement.deadline ? ` avant le ${formatDay(shipment.supplement.deadline)}` : ''}.`}
            </Text>
          </View>
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
