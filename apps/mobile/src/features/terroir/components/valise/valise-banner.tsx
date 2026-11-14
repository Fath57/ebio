import ChevronDown from 'lucide-react-native/dist/esm/icons/chevron-down'
import PlaneTakeoff from 'lucide-react-native/dist/esm/icons/plane-takeoff'
import X from 'lucide-react-native/dist/esm/icons/x'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { fonts, radius, spacing, typography } from '../../../../theme/theme'
import { useTerroirMoney } from '../../hooks/use-terroir-money'
import { formatDay, formatKg, formatWindow } from '../../terroir-api'
import { useTerroirCart } from '../../terroir-cart-context'
import { useValiseMode } from '../../valise-mode-context'
import { Collapsible } from './collapsible'
import { DeparturesBoard } from './departures-board'
import { LuggageTag } from './luggage-tag'
import { DottedLine, MiniSuitcase } from './valise-art'
import { useValisePalette } from './valise-palette'
import { departureHeadline, formatShortDay, useValiseDepartures, useValiseFill } from './valise-stores'

/** Folded on each app start; the buyer's unfolding holds for the session only. */
let expandedThisSession = false

function itemsPhrase(count: number): string {
  if (count === 0)
    return 'valise vide'
  return count === 1 ? '1 article' : `${count} articles`
}

/**
 * The mode's luggage tag, at the top of the shopping screens: where the
 * valise goes, how full it is, the next departure. A tap unfolds the
 * departure details (deadline, every open departure) and, with several
 * destinations, the way to the departures board; the cross leaves the mode.
 */
export function ValiseModeBanner() {
  const { active, countryInfo, exit } = useValiseMode()
  const { itemCount, countries } = useTerroirCart()
  const { formatMoney, displayCurrency } = useTerroirMoney()
  const palette = useValisePalette()
  const departures = useValiseDepartures(active ? countryInfo?.code ?? null : null, displayCurrency)
  const fill = useValiseFill()
  const [expanded, setExpanded] = useState(expandedThisSession)
  const [boardOpen, setBoardOpen] = useState(false)
  if (!active || !countryInfo)
    return null

  const destinations = countries?.length ?? 0
  const choosable = destinations > 1
  const headline = departureHeadline(departures)
  const openDepartures = departures?.items.filter(item => !item.full) ?? []
  // The figures from « Ma valise » hold only for the basket they were computed for.
  const knownFill = fill && fill.itemCount === itemCount && itemCount > 0 && fill.billedKg > 0 ? fill : null
  const ratio = knownFill ? knownFill.weightKg / knownFill.billedKg : null
  const parts = [
    knownFill ? `${formatKg(knownFill.weightKg)} sur ${formatKg(knownFill.billedKg)}` : itemsPhrase(itemCount),
    headline ? `départ le ${formatShortDay(headline.departsOn)}` : null,
  ].filter((part): part is string => Boolean(part))

  const toggle = (): void => {
    expandedThisSession = !expanded
    setExpanded(!expanded)
  }

  return (
    <View style={styles.wrapper}>
      <LuggageTag
        colors={{
          fill: palette.paper,
          stroke: palette.paperEdge,
          hole: palette.page,
          ring: palette.leather,
          string: palette.inkSoft,
          stripeA: palette.stripeA,
          stripeB: palette.stripeB,
        }}
        stripes
        contentStyle={styles.tagContent}
      >
        <Pressable
          style={({ pressed }) => [styles.main, pressed && styles.pressed]}
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel={`Valise ${countryInfo.toPhrase}, ${parts.join(', ')}${choosable ? `, ${destinations} destinations` : ''}. ${expanded ? 'Masquer les détails' : 'Afficher les détails du départ'}`}
          accessibilityState={{ expanded }}
        >
          {countryInfo.flagEmoji && <Text style={styles.flag} maxFontSizeMultiplier={1.3}>{countryInfo.flagEmoji}</Text>}
          <View style={styles.texts}>
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: palette.ink }]} numberOfLines={1}>{`Valise ${countryInfo.toPhrase}`}</Text>
              <ChevronDown size={16} color={palette.inkSoft} strokeWidth={2.4} style={expanded ? styles.chevronOpen : undefined} />
            </View>
            <Text style={[styles.sub, { color: palette.inkSoft }]} numberOfLines={1}>{parts.join(', ')}</Text>
            {choosable && (
              <Text style={[styles.hint, { color: palette.sky }]} numberOfLines={1}>{`${destinations} destinations`}</Text>
            )}
          </View>
          <MiniSuitcase ratio={ratio} stroke={palette.inkSoft} fill={palette.leather} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
          onPress={exit}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Quitter la Valise du pays"
        >
          <X size={20} color={palette.ink} strokeWidth={2.4} />
        </Pressable>
      </LuggageTag>

      <Collapsible expanded={expanded}>
        <View style={[styles.panel, { backgroundColor: palette.skyPaper, borderColor: palette.paperEdge }]}>
          {headline
            ? (
                <View style={styles.headlineRow}>
                  <PlaneTakeoff size={18} color={palette.skyInk} strokeWidth={2.2} />
                  <Text style={[styles.headline, { color: palette.skyInk }]}>
                    {`Prochain envoi ${headline.city ? `vers ${headline.city}` : countryInfo.toPhrase} : ${formatDay(headline.departsOn)}`}
                    {headline.orderBefore ? `, commandez avant le ${formatDay(headline.orderBefore)}` : ''}
                  </Text>
                </View>
              )
            : (
                <Text style={[styles.headline, { color: palette.skyInk }]}>Aucun départ ouvert pour l’instant.</Text>
              )}
          {openDepartures.map(item => (
            <View key={item.departureId} style={styles.departure}>
              <DottedLine color={palette.paperEdge} variant="dashes" />
              <Text style={[styles.agency, { color: palette.skyInk }]}>{item.agency}</Text>
              <Text style={[styles.line, { color: palette.skyInk }]}>
                {`Départ le ${formatDay(item.departsOn)}${item.orderBefore ? `, commandez avant le ${formatDay(item.orderBefore)}` : ''}`}
              </Text>
              {(item.arrivalFrom || item.arrivalTo) && (
                <Text style={[styles.line, { color: palette.skyInk }]}>
                  {`Arrivée estimée : ${formatWindow(item.arrivalFrom, item.arrivalTo)}`}
                </Text>
              )}
              {item.pricePerKg > 0 && (
                <Text style={[styles.price, { color: palette.skyInk }]}>
                  {`${formatMoney(item.pricePerKg).primary} / kg${item.minBilledKg > 0 ? `, ${formatKg(item.minBilledKg)} minimum` : ''}`}
                </Text>
              )}
            </View>
          ))}
          {choosable && (
            <Pressable
              onPress={() => setBoardOpen(true)}
              style={({ pressed }) => [styles.boardButton, { borderColor: palette.sky }, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Changer de destination, ${destinations} destinations`}
            >
              <Text style={[styles.boardButtonText, { color: palette.sky }]}>{`Changer de destination (${destinations})`}</Text>
            </Pressable>
          )}
        </View>
      </Collapsible>

      {choosable && <DeparturesBoard visible={boardOpen} onClose={() => setBoardOpen(false)} />}
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: spacing[4],
    marginTop: spacing[3],
  },
  tagContent: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
  },
  main: {
    flex: 1,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[2],
  },
  pressed: {
    opacity: 0.7,
  },
  flag: {
    fontSize: 22,
  },
  texts: {
    flex: 1,
    gap: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  title: {
    flexShrink: 1,
    fontFamily: fonts.sansBd,
    fontSize: 15,
  },
  chevronOpen: {
    transform: [{ rotate: '180deg' }],
  },
  sub: {
    fontFamily: fonts.sansMd,
    fontSize: 12,
  },
  hint: {
    fontFamily: fonts.sansSb,
    fontSize: 12,
  },
  close: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing[1],
  },
  panel: {
    marginTop: spacing[2],
    marginLeft: spacing[5],
    padding: spacing[3],
    gap: spacing[2],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  headlineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
  },
  headline: {
    flex: 1,
    fontFamily: fonts.sansSb,
    fontSize: 14,
    lineHeight: 20,
  },
  departure: {
    gap: 2,
  },
  agency: {
    fontFamily: fonts.sansBd,
    fontSize: 13,
    marginTop: spacing[1],
  },
  line: {
    ...typography.bodyS,
  },
  price: {
    fontFamily: fonts.mono,
    fontSize: 13,
  },
  boardButton: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
    marginTop: spacing[1],
  },
  boardButtonText: {
    fontFamily: fonts.sansBd,
    fontSize: 14,
  },
})
