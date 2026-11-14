import type { TerroirShipmentStatus, TerroirShipmentSummary } from '../terroir-api'
import { useFocusEffect } from '@react-navigation/native'
import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right'
import Package from 'lucide-react-native/dist/esm/icons/package'
import { useCallback, useState } from 'react'
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSession } from '../../../lib/auth-client'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { PressableCard } from '../../common/components/pressable-card'
import { ScreenHeader } from '../../common/components/screen-header'
import { Thumbnail } from '../../common/components/thumbnail'
import { formatCurrencyAmount, formatXof } from '../../common/hooks/use-money'
import { useTabBarClearance } from '../../common/hooks/use-tab-bar-clearance'
import { countryLabel, fetchTerroirShipments, formatDay, formatWindow, SHIPMENT_STATUS_LABELS, useTerroirEnabled } from '../terroir-api'

/** Status pill colours; the label always goes with them, never colour alone. */
export function shipmentTone(status: TerroirShipmentStatus): { bg: string, text: string } {
  if (status === 'HANDED_OVER')
    return { bg: colors.green[100], text: colors.green[800] }
  if (status === 'READY_FOR_PICKUP' || status === 'OUT_FOR_DELIVERY')
    return { bg: colors.green[50], text: colors.green[800] }
  if (status === 'LOST' || status === 'DAMAGED' || status === 'CANCELLED')
    return { bg: colors.coral[50], text: colors.coral[600] }
  if (status === 'PENDING_PAYMENT')
    return { bg: colors.earth[50], text: colors.earth[800] }
  return { bg: colors.blue[50], text: colors.blue[800] }
}

export function StatusPill({ status }: { status: TerroirShipmentStatus }) {
  const tone = shipmentTone(status)
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <Text style={[styles.pillText, { color: tone.text }]}>{SHIPMENT_STATUS_LABELS[status]}</Text>
    </View>
  )
}

export function shipmentTotalLabel(shipment: Pick<TerroirShipmentSummary, 'total' | 'displayTotal' | 'displayCurrency'>): string {
  if (shipment.displayTotal !== null && shipment.displayCurrency)
    return `${formatCurrencyAmount(shipment.displayTotal, shipment.displayCurrency)} · ${formatXof(shipment.total)}`
  return formatXof(shipment.total)
}

/** The buyer's terroir parcels, loaded on focus. */
function useShipments() {
  const { data: session } = useSession()
  const signedIn = Boolean(session?.user)
  const [items, setItems] = useState<TerroirShipmentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (isCancelled: () => boolean) => {
    if (!signedIn) {
      setItems([])
      setLoading(false)
      return
    }
    try {
      const shipments = await fetchTerroirShipments()
      if (!isCancelled()) {
        setItems(shipments)
        setError(null)
      }
    }
    catch (loadError) {
      if (!isCancelled())
        setError(loadError instanceof Error ? loadError.message : 'Impossible de charger vos colis terroir.')
    }
    finally {
      if (!isCancelled())
        setLoading(false)
    }
  }, [signedIn])

  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      void load(() => cancelled)
      return () => {
        cancelled = true
      }
    }, [load]),
  )

  return { items, loading, error, reload: () => load(() => false) }
}

interface TerroirShipmentsEntryProps {
  onPress: () => void
}

/** « Colis terroir » in the Orders tab: shown when the buyer has parcels or the module is open. */
export function TerroirShipmentsEntry({ onPress }: TerroirShipmentsEntryProps) {
  const { semantic } = useTheme()
  const enabled = useTerroirEnabled()
  const { items } = useShipments()
  if (!enabled && items.length === 0)
    return null
  const active = items.filter(item => !['HANDED_OVER', 'CANCELLED', 'LOST', 'DAMAGED'].includes(item.status)).length
  return (
    <TouchableOpacity
      style={[styles.entry, { backgroundColor: semantic.bgCard, borderColor: semantic.borderLight }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={active > 0 ? `Colis terroir, ${active} en cours` : 'Colis terroir'}
    >
      <Package size={18} color={colors.earth[600]} strokeWidth={2.2} />
      <Text style={[styles.entryText, { color: semantic.textPrimary }]}>Colis terroir</Text>
      {active > 0 && <Text style={[styles.entryCount, { color: semantic.textSecondary }]}>{`${active} en cours`}</Text>}
      <ChevronRight size={18} color={semantic.textSecondary} strokeWidth={2.2} />
    </TouchableOpacity>
  )
}

interface ShipmentsListProps {
  onBack: () => void
  onOpenShipment: (shipmentId: string) => void
}

export function ShipmentsList({ onBack, onOpenShipment }: ShipmentsListProps) {
  const { semantic } = useTheme()
  const bottomClearance = useTabBarClearance()
  const { items, loading, error, reload } = useShipments()
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await reload()
    setRefreshing(false)
  }, [reload])

  return (
    <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader title="Colis terroir" onBack={onBack} />
      {loading
        ? <ActivityIndicator style={styles.loader} color={colors.green[400]} />
        : (
            <FlatList
              data={items}
              keyExtractor={item => item.id}
              contentContainerStyle={[styles.list, { paddingBottom: bottomClearance + spacing[6] }]}
              refreshing={refreshing}
              onRefresh={() => {
                void handleRefresh()
              }}
              renderItem={({ item }) => (
                <PressableCard
                  style={[styles.card, { backgroundColor: semantic.bgCard }]}
                  onPress={() => onOpenShipment(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Colis vers la ${countryLabel(item.country)}, ${SHIPMENT_STATUS_LABELS[item.status]}`}
                >
                  <Thumbnail uri={item.firstImageUrl} style={styles.image} alt="" />
                  <View style={styles.body}>
                    <StatusPill status={item.status} />
                    <Text style={[styles.title, { color: semantic.textPrimary }]}>
                      {item.giftName ? `Pour ${item.giftName} · ${countryLabel(item.country)}` : `Vers la ${countryLabel(item.country)}`}
                    </Text>
                    {item.agency && (
                      <Text style={[styles.line, { color: semantic.textSecondary }]}>
                        {`${item.agency}${item.departsOn ? ` · départ le ${formatDay(item.departsOn)}` : ''}`}
                      </Text>
                    )}
                    {(item.arrivalFrom || item.arrivalTo) && (
                      <Text style={[styles.line, { color: semantic.textSecondary }]}>
                        {`Arrivée estimée : ${formatWindow(item.arrivalFrom, item.arrivalTo)}`}
                      </Text>
                    )}
                    <Text style={[styles.price, { color: semantic.textPrimary }]}>{shipmentTotalLabel(item)}</Text>
                  </View>
                </PressableCard>
              )}
              ListEmptyComponent={(
                <View style={styles.empty}>
                  <Package size={32} color={colors.earth[400]} />
                  <Text style={[styles.title, { color: semantic.textPrimary }]}>{error ?? 'Aucun colis terroir'}</Text>
                  {!error && (
                    <Text style={[styles.line, styles.centerText, { color: semantic.textSecondary }]}>
                      Vos envois vers la France et la Belgique apparaîtront ici.
                    </Text>
                  )}
                </View>
              )}
            />
          )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  loader: {
    marginTop: spacing[10],
  },
  list: {
    padding: spacing[4],
    gap: spacing[3],
  },
  card: {
    flexDirection: 'row',
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: radius.lg,
  },
  image: {
    width: 72,
    height: 54,
    borderRadius: radius.sm,
  },
  body: {
    flex: 1,
    gap: spacing[1],
  },
  title: {
    fontFamily: fonts.sansSb,
    fontSize: 15,
  },
  line: {
    ...typography.bodyS,
  },
  price: {
    fontFamily: fonts.mono,
    fontSize: 13,
  },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing[3],
    minHeight: 22,
    justifyContent: 'center',
  },
  pillText: {
    fontFamily: fonts.sansSb,
    fontSize: 11,
  },
  empty: {
    alignItems: 'center',
    gap: spacing[2],
    paddingTop: spacing[10],
  },
  centerText: {
    textAlign: 'center',
  },
  entry: {
    marginHorizontal: spacing[4],
    marginTop: spacing[2],
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  entryText: {
    flex: 1,
    fontFamily: fonts.sansSb,
    fontSize: 14,
  },
  entryCount: {
    ...typography.caption,
  },
})
