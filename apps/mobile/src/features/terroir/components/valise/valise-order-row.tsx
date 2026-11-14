import type { TerroirShipmentStatus, TerroirShipmentSummary } from '../../terroir-api'
import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right'
import Plane from 'lucide-react-native/dist/esm/icons/plane'
import { StyleSheet, Text, View } from 'react-native'
import { fonts, radius, spacing } from '../../../../theme/theme'
import { useTheme } from '../../../../theme/theme-context'
import { ScalePressable } from '../../../../utils/animations'
import { Thumbnail } from '../../../common/components/thumbnail'
import { countryName, countryToPhrase, formatDay, terroirCountryInfo } from '../../terroir-api'
import { shipmentTone, shipmentTotalLabel } from '../shipments-list'
import { LuggageTag } from './luggage-tag'
import { useValisePalette } from './valise-palette'

/** The valise's state, said of « la valise » (feminine), for the orders list. */
export const VALISE_ROW_LABELS: Record<TerroirShipmentStatus, string> = {
  PENDING_PAYMENT: 'En attente de paiement',
  PAID: 'Payée',
  COLLECTING: 'Collecte en cours',
  PACKED: 'Préparée',
  DROPPED_AT_AGENCY: 'Déposée à l’agence',
  DEPARTED: 'Partie',
  ARRIVED: 'Arrivée',
  READY_FOR_PICKUP: 'À retirer',
  OUT_FOR_DELIVERY: 'En livraison',
  HANDED_OVER: 'Remise',
  LOST: 'Perdue',
  DAMAGED: 'Endommagée',
  CANCELLED: 'Annulée',
}

interface ValiseOrderRowProps {
  shipment: TerroirShipmentSummary
  onPress: (shipmentId: string) => void
}

/** « Valise vers la France » or « Pour Awa · France » */
function rowTitle(shipment: TerroirShipmentSummary): string {
  if (shipment.giftName)
    return `Pour ${shipment.giftName} · ${countryName(shipment.country)}`
  const phrase = countryToPhrase(shipment.country)
  return `Valise ${phrase}`
}

/** « Départ le 22 novembre · Agence X » */
function departureLine(shipment: TerroirShipmentSummary): string | null {
  const day = shipment.departsOn ? `Départ le ${formatDay(shipment.departsOn)}` : null
  const parts = [day, shipment.agency].filter((part): part is string => Boolean(part))
  return parts.length > 0 ? parts.join(' · ') : null
}

/**
 * A valise in « Mes commandes », drawn as the luggage tag it travels with:
 * the destination flag, where it stands, its departure and its total. One
 * row stands for the whole parcel, whatever the number of shops it gathers.
 */
export function ValiseOrderRow({ shipment, onPress }: ValiseOrderRowProps) {
  const { semantic } = useTheme()
  const palette = useValisePalette()
  const tone = shipmentTone(shipment.status)
  const flag = terroirCountryInfo(shipment.country)?.flagEmoji ?? null
  const title = rowTitle(shipment)
  const departure = departureLine(shipment)
  const status = VALISE_ROW_LABELS[shipment.status]

  return (
    <ScalePressable
      onPress={() => onPress(shipment.id)}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${status}${departure ? `, ${departure}` : ''}, ${shipmentTotalLabel(shipment)}`}
    >
      <LuggageTag
        colors={{
          fill: palette.paper,
          stroke: palette.paperEdge,
          hole: semantic.bgPage,
          ring: palette.leather,
          string: palette.inkSoft,
          stripeA: palette.stripeA,
          stripeB: palette.stripeB,
        }}
        stripes
        contentStyle={styles.content}
      >
        <Thumbnail uri={shipment.firstImageUrl} style={styles.image} alt="" />
        <View style={styles.body}>
          <View style={styles.topRow}>
            <View style={[styles.stamp, { backgroundColor: palette.skyPaper }]}>
              <Plane size={11} color={palette.skyInk} strokeWidth={2.4} />
              <Text style={[styles.stampText, { color: palette.skyInk }]}>VALISE</Text>
            </View>
            <View style={[styles.pill, { backgroundColor: tone.bg }]}>
              <Text style={[styles.pillText, { color: tone.text }]} numberOfLines={1}>{status}</Text>
            </View>
          </View>
          <Text style={[styles.title, { color: palette.ink }]} numberOfLines={1}>
            {flag ? `${flag} ${title}` : title}
          </Text>
          {departure && (
            <Text style={[styles.line, { color: palette.inkSoft }]} numberOfLines={1}>{departure}</Text>
          )}
          <View style={styles.bottomRow}>
            <Text style={[styles.price, { color: palette.ink }]} numberOfLines={1}>{shipmentTotalLabel(shipment)}</Text>
            <ChevronRight size={16} color={palette.inkSoft} />
          </View>
        </View>
      </LuggageTag>
    </ScalePressable>
  )
}

const styles = StyleSheet.create({
  content: {
    flexDirection: 'row',
    gap: spacing[3],
    paddingTop: spacing[3],
    paddingBottom: spacing[4],
    paddingRight: spacing[3],
  },
  image: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
  },
  body: {
    flex: 1,
    gap: spacing[1],
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  stamp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: radius.xs,
  },
  stampText: {
    fontFamily: fonts.sansSb,
    fontSize: 10,
    letterSpacing: 1,
  },
  pill: {
    flexShrink: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
  },
  pillText: {
    fontFamily: fonts.sansSb,
    fontSize: 11,
    lineHeight: 14,
  },
  title: {
    fontFamily: fonts.sansSb,
    fontSize: 14,
  },
  line: {
    fontFamily: fonts.sansMd,
    fontSize: 12,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  price: {
    fontFamily: fonts.mono,
    fontSize: 13,
    flexShrink: 1,
  },
})
