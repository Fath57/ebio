import Plane from 'lucide-react-native/dist/esm/icons/plane'
import { Image, StyleSheet, Text, View } from 'react-native'
import { colors, fonts, radius, spacing } from '../../../../theme/theme'
import { useTheme } from '../../../../theme/theme-context'
import { PressableCard } from '../../../common/components/pressable-card'
import { useTerroirMoney } from '../../hooks/use-terroir-money'
import { useTerroirCart } from '../../terroir-cart-context'
import { AirmailBand, DottedLine, OPEN_RATIO, TearLine, VALISE_IMAGES } from './valise-art'
import { useValisePalette } from './valise-palette'
import { departureHeadline, formatShortDay, useValiseDepartures } from './valise-stores'

const HERO_WIDTH = 118

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

interface BoardingPassProps {
  /** « en France et en Belgique ». */
  places: string
  onPress: () => void
}

/**
 * The home's way into the Valise mode, as a boarding pass: Cotonou to the
 * destination, the next departure and its deadline on the stub, and the
 * open suitcase as the picture. A tap plays the entry effect.
 */
export function BoardingPass({ places, onPress }: BoardingPassProps) {
  const { semantic } = useTheme()
  const palette = useValisePalette()
  const { countryInfo } = useTerroirCart()
  const { formatMoney, displayCurrency } = useTerroirMoney()
  const departures = useValiseDepartures(countryInfo?.code ?? null, displayCurrency)
  const headline = departureHeadline(departures)
  const lede = `Le goût du pays, livré ${places}`
  const kiloPrice = headline?.pricePerKg ? formatMoney(headline.pricePerKg).primary : null
  const destinationName = headline?.city ?? countryInfo?.name ?? null

  const summary = [
    'La Valise du pays',
    lede,
    countryInfo ? `de Cotonou ${countryInfo.toPhrase}` : null,
    headline ? `prochain départ le ${formatShortDay(headline.departsOn)}` : null,
    headline?.orderBefore ? `commandez avant le ${formatShortDay(headline.orderBefore)}` : null,
    kiloPrice ? `transport dès ${kiloPrice} le kilo` : null,
  ].filter(Boolean).join(', ')

  return (
    <PressableCard
      style={[styles.pass, { backgroundColor: palette.paper, borderColor: palette.paperEdge }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={summary}
      accessibilityHint="Passe l’application en mode Valise du pays"
    >
      <AirmailBand height={6} colorA={palette.stripeA} colorB={palette.stripeB} />

      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={[styles.eyebrow, { color: palette.inkSoft }]}>Carte d’embarquement</Text>
          <Text style={[styles.title, { color: palette.ink }]}>La Valise du pays</Text>
          <Text style={[styles.lede, { color: palette.inkSoft }]}>{lede}</Text>
          <View style={styles.cta}>
            <Text style={styles.ctaText}>Faire ma valise</Text>
          </View>
        </View>
        <Image
          source={VALISE_IMAGES.open}
          style={styles.hero}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      </View>

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
          <View style={[styles.airport, styles.airportRight]}>
            <Text style={[styles.code, { color: palette.ink }]}>{countryInfo.code}</Text>
            <Text style={[styles.airportName, styles.right, { color: palette.inkSoft }]} numberOfLines={1}>{destinationName}</Text>
          </View>
        </View>
      )}

      <TearLine notchColor={semantic.bgPage} edgeColor={palette.paperEdge} />

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
    </PressableCard>
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
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingLeft: spacing[4],
    paddingTop: spacing[3],
    gap: spacing[2],
  },
  headText: {
    flex: 1,
    gap: spacing[1],
    paddingBottom: spacing[2],
  },
  eyebrow: {
    fontFamily: fonts.sansSb,
    fontSize: 12,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 32,
  },
  lede: {
    fontFamily: fonts.sansMd,
    fontSize: 13,
    lineHeight: 19,
  },
  cta: {
    alignSelf: 'flex-start',
    marginTop: spacing[2],
    minHeight: 36,
    paddingHorizontal: spacing[4],
    borderRadius: radius.md,
    backgroundColor: colors.green[400],
    justifyContent: 'center',
  },
  ctaText: {
    fontFamily: fonts.sansBd,
    fontSize: 14,
    color: colors.neutral[0],
  },
  hero: {
    width: HERO_WIDTH,
    height: Math.round(HERO_WIDTH * OPEN_RATIO),
    marginRight: spacing[2],
  },
  route: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    paddingBottom: spacing[3],
  },
  airport: {
    maxWidth: '32%',
  },
  airportRight: {
    alignItems: 'flex-end',
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
