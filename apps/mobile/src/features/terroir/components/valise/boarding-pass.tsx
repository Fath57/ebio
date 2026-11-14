import type { TerroirCountryInfo } from '../../terroir-api'
import type { ValisePalette } from './valise-palette'
import ChevronDown from 'lucide-react-native/dist/esm/icons/chevron-down'
import Plane from 'lucide-react-native/dist/esm/icons/plane'
import { useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, fonts, radius, spacing } from '../../../../theme/theme'
import { useTheme } from '../../../../theme/theme-context'
import { PressableCard } from '../../../common/components/pressable-card'
import { useTerroirMoney } from '../../hooks/use-terroir-money'
import { useTerroirCart } from '../../terroir-cart-context'
import { Collapsible } from './collapsible'
import { DeparturesBoard } from './departures-board'
import { AirmailBand, DottedLine, OPEN_RATIO, TearLine, VALISE_IMAGES } from './valise-art'
import { useValisePalette } from './valise-palette'
import { departureHeadline, formatShortDay, useValiseDepartures } from './valise-stores'

const THUMB_WIDTH = 56
/** Up to this many destinations, each one shows by name; beyond, flags and a count. */
const NAMED_DESTINATIONS = 4
const FLAGS_SHOWN = 3

/** Folded on each app start; the buyer's unfolding holds for the session only. */
let expandedThisSession = false

interface StubCellProps {
  label: string
  value: string
  mono?: boolean
  ink: string
  inkSoft: string
}

function StubCell({ label, value, mono = false, ink, inkSoft }: StubCellProps) {
  return (
    <View style={styles.stubCell}>
      <Text style={[styles.stubLabel, { color: inkSoft }]}>{label}</Text>
      <Text style={[mono ? styles.stubValueMono : styles.stubValue, { color: ink }]}>{value}</Text>
    </View>
  )
}

interface DestinationsStripProps {
  /** The offered countries other than the selected one. */
  others: TerroirCountryInfo[]
  palette: ValisePalette
  onOpen: () => void
}

/** « Aussi vers 🇧🇪 Belgique », or « 🇧🇪 🇨🇦 🇨🇭 +5 destinations »: a way to the board. */
function DestinationsStrip({ others, palette, onOpen }: DestinationsStripProps) {
  const named = others.length + 1 <= NAMED_DESTINATIONS
  const shown = named ? others : others.slice(0, FLAGS_SHOWN)
  const rest = others.length - shown.length
  const label = named
    ? `Aussi ${others.map(entry => entry.toPhrase).join(', ')}. Ouvrir le tableau des départs`
    : `${others.length} autres destinations. Ouvrir le tableau des départs`
  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [styles.strip, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[styles.stripLead, { color: palette.inkSoft }]}>{named ? 'Aussi vers' : 'Aussi'}</Text>
      {shown.map(entry => (
        <View key={entry.code} style={[styles.miniStub, { borderColor: palette.paperEdge, backgroundColor: palette.skyPaper }]}>
          <Text style={styles.miniFlag} maxFontSizeMultiplier={1.3}>{entry.flagEmoji ?? entry.code}</Text>
          {named && <Text style={[styles.miniName, { color: palette.skyInk }]} numberOfLines={1}>{entry.name}</Text>}
        </View>
      ))}
      {rest > 0 && (
        <Text style={[styles.stripMore, { color: palette.sky }]}>{`+${rest} destination${rest > 1 ? 's' : ''}`}</Text>
      )}
    </Pressable>
  )
}

interface BoardingPassProps {
  /** « en France et en Belgique ». */
  places: string
  onPress: () => void
}

/**
 * The home's way into the Valise mode, as a boarding pass.
 *
 * Folded (the default), it is one compact ticket: the suitcase, the route
 * from Cotonou, the next departure and « Faire ma valise ». The chevron
 * unfolds the stub (deadline, price per kilo) and the other destinations.
 * The airmail edge shows either way: this is not an ordinary card.
 */
export function BoardingPass({ places, onPress }: BoardingPassProps) {
  const { semantic } = useTheme()
  const palette = useValisePalette()
  const { countryInfo, countries } = useTerroirCart()
  const { formatMoney, displayCurrency } = useTerroirMoney()
  const departures = useValiseDepartures(countryInfo?.code ?? null, displayCurrency)
  const [expanded, setExpanded] = useState(expandedThisSession)
  const [boardOpen, setBoardOpen] = useState(false)

  const headline = departureHeadline(departures)
  const others = (countries ?? []).filter(entry => entry.code !== countryInfo?.code)
  const choosable = countryInfo !== null && others.length > 0
  const lede = `Le goût du pays, livré ${places}`
  const kiloPrice = headline?.pricePerKg ? formatMoney(headline.pricePerKg).primary : null
  const destinationName = headline?.city ?? countryInfo?.name ?? null

  const toggle = (): void => {
    expandedThisSession = !expanded
    setExpanded(!expanded)
  }

  const route = countryInfo
    ? `COO ✈ ${countryInfo.flagEmoji ? `${countryInfo.flagEmoji} ` : ''}${countryInfo.code}${destinationName ? ` ${destinationName}` : ''}`
    : null
  const summary = [
    'La Valise du pays, faire ma valise',
    countryInfo ? `de Cotonou ${countryInfo.toPhrase}${destinationName ? `, retrait à ${destinationName}` : ''}` : lede,
    headline ? `prochain départ le ${formatShortDay(headline.departsOn)}` : null,
  ].filter(Boolean).join(', ')

  return (
    <View style={[styles.pass, { backgroundColor: palette.paper, borderColor: palette.paperEdge }]}>
      <AirmailBand height={6} colorA={palette.stripeA} colorB={palette.stripeB} />

      <View style={styles.ticket}>
        <PressableCard
          style={styles.main}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={summary}
          accessibilityHint="Passe l’application en mode Valise du pays"
        >
          <Image source={VALISE_IMAGES.open} style={styles.thumb} resizeMode="contain" accessibilityIgnoresInvertColors />
          <View style={styles.mainText}>
            <Text style={[styles.title, { color: palette.ink }]} numberOfLines={1}>La Valise du pays</Text>
            <Text style={[styles.routeLine, { color: palette.ink }]} numberOfLines={1}>{route ?? lede}</Text>
            <View style={styles.actionRow}>
              {headline && (
                <Text style={[styles.departLine, { color: palette.inkSoft }]} numberOfLines={1}>
                  {`Départ ${formatShortDay(headline.departsOn)}`}
                </Text>
              )}
              <View style={styles.cta}>
                <Text style={styles.ctaText} numberOfLines={1}>Faire ma valise</Text>
              </View>
            </View>
          </View>
        </PressableCard>
        <Pressable
          onPress={toggle}
          style={({ pressed }) => [styles.chevron, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Masquer les détails' : 'Afficher les détails du départ'}
          accessibilityState={{ expanded }}
        >
          <ChevronDown
            size={22}
            color={palette.ink}
            strokeWidth={2.4}
            style={expanded ? styles.chevronOpen : undefined}
          />
        </Pressable>
      </View>

      <Collapsible expanded={expanded}>
        <TearLine notchColor={semantic.bgPage} edgeColor={palette.paperEdge} />
        <Text style={[styles.lede, { color: palette.inkSoft }]}>{lede}</Text>

        {countryInfo && (
          <View style={styles.route}>
            <View style={styles.airport}>
              <Text style={[styles.code, { color: palette.ink }]}>COO</Text>
              <Text style={[styles.airportName, { color: palette.inkSoft }]} numberOfLines={1}>Cotonou</Text>
            </View>
            <View style={styles.flight}>
              <DottedLine color={palette.sky} style={styles.flightLine} />
              <Plane size={18} color={palette.sky} strokeWidth={2} fill={palette.sky} style={styles.planeIcon} />
              <DottedLine color={palette.sky} style={styles.flightLine} />
            </View>
            {choosable
              ? (
                  <Pressable
                    onPress={() => setBoardOpen(true)}
                    style={({ pressed }) => [styles.airport, styles.airportRight, styles.destinationButton, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`Destination : ${countryInfo.name}${destinationName ? `, retrait à ${destinationName}` : ''}. Changer de destination`}
                  >
                    <Text style={[styles.code, { color: palette.ink }]}>{countryInfo.code}</Text>
                    <Text style={[styles.airportName, styles.right, { color: palette.inkSoft }]} numberOfLines={1}>{destinationName}</Text>
                    <View style={styles.change}>
                      <Text style={[styles.changeText, { color: palette.sky }]}>Changer</Text>
                      <ChevronDown size={14} color={palette.sky} strokeWidth={2.4} />
                    </View>
                  </Pressable>
                )
              : (
                  <View style={[styles.airport, styles.airportRight]}>
                    <Text style={[styles.code, { color: palette.ink }]}>{countryInfo.code}</Text>
                    <Text style={[styles.airportName, styles.right, { color: palette.inkSoft }]} numberOfLines={1}>{destinationName}</Text>
                  </View>
                )}
          </View>
        )}

        {choosable && <DestinationsStrip others={others} palette={palette} onOpen={() => setBoardOpen(true)} />}

        <View style={styles.stub}>
          {headline
            ? (
                <>
                  <StubCell label="Départ" value={formatShortDay(headline.departsOn)} ink={palette.ink} inkSoft={palette.inkSoft} />
                  {headline.orderBefore && (
                    <StubCell label="Commandez avant" value={formatShortDay(headline.orderBefore)} ink={palette.ink} inkSoft={palette.inkSoft} />
                  )}
                  {kiloPrice && (
                    <StubCell label="Transport" value={`dès ${kiloPrice}/kg`} mono ink={palette.ink} inkSoft={palette.inkSoft} />
                  )}
                </>
              )
            : (
                <Text style={[styles.stubEmpty, { color: palette.inkSoft }]}>
                  Envoi en un seul colis par une agence partenaire, depuis Cotonou.
                </Text>
              )}
        </View>
      </Collapsible>

      {choosable && <DeparturesBoard visible={boardOpen} onClose={() => setBoardOpen(false)} />}
    </View>
  )
}

const styles = StyleSheet.create({
  pass: {
    marginHorizontal: spacing[4],
    marginTop: spacing[5],
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  ticket: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingLeft: spacing[3],
    paddingVertical: spacing[2],
  },
  thumb: {
    width: THUMB_WIDTH,
    height: Math.round(THUMB_WIDTH * OPEN_RATIO),
  },
  mainText: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 20,
    lineHeight: 24,
  },
  routeLine: {
    fontFamily: fonts.sansBd,
    fontSize: 13,
    letterSpacing: 0.3,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing[2],
    marginTop: 2,
  },
  departLine: {
    fontFamily: fonts.sansMd,
    fontSize: 12,
  },
  cta: {
    minHeight: 28,
    paddingHorizontal: spacing[3],
    borderRadius: radius.sm,
    backgroundColor: colors.green[400],
    justifyContent: 'center',
  },
  ctaText: {
    fontFamily: fonts.sansBd,
    fontSize: 12,
    color: colors.neutral[0],
  },
  chevron: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing[1],
  },
  chevronOpen: {
    transform: [{ rotate: '180deg' }],
  },
  pressed: {
    opacity: 0.7,
  },
  lede: {
    fontFamily: fonts.sansMd,
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[1],
  },
  route: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
  },
  airport: {
    maxWidth: '32%',
  },
  airportRight: {
    alignItems: 'flex-end',
  },
  destinationButton: {
    minHeight: 44,
    justifyContent: 'center',
  },
  code: {
    fontFamily: fonts.sansBd,
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: 1,
  },
  airportName: {
    fontFamily: fonts.sansMd,
    fontSize: 12,
  },
  right: {
    textAlign: 'right',
  },
  change: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  changeText: {
    fontFamily: fonts.sansBd,
    fontSize: 12,
  },
  flight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingBottom: spacing[4],
  },
  flightLine: {
    flex: 1,
  },
  planeIcon: {
    transform: [{ rotate: '45deg' }],
  },
  strip: {
    minHeight: 44,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing[2],
    marginHorizontal: spacing[4],
  },
  stripLead: {
    fontFamily: fonts.sansMd,
    fontSize: 12,
  },
  miniStub: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    minHeight: 28,
    paddingHorizontal: spacing[2],
    borderRadius: radius.xs,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  miniFlag: {
    fontSize: 15,
  },
  miniName: {
    fontFamily: fonts.sansSb,
    fontSize: 12,
  },
  stripMore: {
    fontFamily: fonts.sansBd,
    fontSize: 12,
  },
  stub: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[4],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    paddingBottom: spacing[4],
  },
  stubCell: {
    gap: 2,
  },
  stubLabel: {
    fontFamily: fonts.sansMd,
    fontSize: 12,
  },
  stubValue: {
    fontFamily: fonts.sansBd,
    fontSize: 15,
  },
  stubValueMono: {
    fontFamily: fonts.mono,
    fontSize: 15,
  },
  stubEmpty: {
    flex: 1,
    fontFamily: fonts.sansMd,
    fontSize: 13,
    lineHeight: 19,
  },
})
