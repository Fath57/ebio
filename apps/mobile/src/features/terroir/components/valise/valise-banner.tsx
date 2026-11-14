import type { TerroirCountry } from '../../terroir-api'
import Check from 'lucide-react-native/dist/esm/icons/check'
import ChevronDown from 'lucide-react-native/dist/esm/icons/chevron-down'
import X from 'lucide-react-native/dist/esm/icons/x'
import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../../theme/theme'
import { useTheme } from '../../../../theme/theme-context'
import { DragSheet } from '../../../common/components/drag-sheet'
import { useTerroirMoney } from '../../hooks/use-terroir-money'
import { countryChipLabel, formatKg } from '../../terroir-api'
import { useTerroirCart } from '../../terroir-cart-context'
import { useValiseMode } from '../../valise-mode-context'
import { LuggageTag } from './luggage-tag'
import { MiniSuitcase } from './valise-art'
import { useValisePalette } from './valise-palette'
import { departureHeadline, formatShortDay, useValiseDepartures, useValiseFill } from './valise-stores'

interface CountrySheetProps {
  visible: boolean
  onClose: () => void
}

function CountrySheet({ visible, onClose }: CountrySheetProps) {
  const { semantic } = useTheme()
  const { countries, country, setCountry } = useTerroirCart()
  const pick = (code: TerroirCountry): void => {
    setCountry(code)
    onClose()
  }
  return (
    <DragSheet visible={visible} onClose={onClose}>
      <View style={styles.sheet}>
        <Text style={[styles.sheetTitle, { color: semantic.textPrimary }]}>Où envoyer votre valise ?</Text>
        <Text style={[styles.sheetHint, { color: semantic.textSecondary }]}>
          Les produits, les prix et les départs s’adaptent au pays choisi.
        </Text>
        {countries === null && <ActivityIndicator color={colors.green[400]} />}
        <View accessibilityRole="radiogroup">
          {(countries ?? []).map((entry) => {
            const selected = entry.code === country
            return (
              <TouchableOpacity
                key={entry.code}
                style={[styles.sheetRow, { borderBottomColor: semantic.borderLight }]}
                onPress={() => pick(entry.code)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`Valise ${entry.toPhrase}`}
              >
                <View style={styles.sheetRowText}>
                  <Text style={[styles.sheetRowName, { color: semantic.textPrimary }]}>{countryChipLabel(entry)}</Text>
                  <Text style={[styles.sheetRowSub, { color: semantic.textSecondary }]}>{`Valise ${entry.toPhrase}`}</Text>
                </View>
                {selected && <Check size={20} color={semantic.textPrimaryColor} strokeWidth={2.4} />}
              </TouchableOpacity>
            )
          })}
        </View>
      </View>
    </DragSheet>
  )
}

function itemsPhrase(count: number): string {
  if (count === 0)
    return 'valise vide'
  return count === 1 ? '1 article' : `${count} articles`
}

/**
 * The mode's luggage tag, at the top of the shopping screens: where the
 * valise goes, the next departure, how full it is. A tap on the tag changes
 * the country, the cross leaves the mode.
 */
export function ValiseModeBanner() {
  const { active, countryInfo, exit } = useValiseMode()
  const { itemCount } = useTerroirCart()
  const { displayCurrency } = useTerroirMoney()
  const palette = useValisePalette()
  const departures = useValiseDepartures(active ? countryInfo?.code ?? null : null, displayCurrency)
  const fill = useValiseFill()
  const [open, setOpen] = useState(false)
  if (!active || !countryInfo)
    return null

  const headline = departureHeadline(departures)
  // The figures from « Ma valise » hold only for the basket they were computed for.
  const knownFill = fill && fill.itemCount === itemCount && itemCount > 0 && fill.billedKg > 0 ? fill : null
  const ratio = knownFill ? knownFill.weightKg / knownFill.billedKg : null
  const parts = [
    knownFill ? `${formatKg(knownFill.weightKg)} sur ${formatKg(knownFill.billedKg)}` : itemsPhrase(itemCount),
    headline ? `départ le ${formatShortDay(headline.departsOn)}` : null,
  ].filter((part): part is string => Boolean(part))

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
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Valise ${countryInfo.toPhrase}, ${parts.join(', ')}. Changer de pays`}
        >
          {countryInfo.flagEmoji && <Text style={styles.flag} maxFontSizeMultiplier={1.3}>{countryInfo.flagEmoji}</Text>}
          <View style={styles.texts}>
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: palette.ink }]} numberOfLines={1}>{`Valise ${countryInfo.toPhrase}`}</Text>
              <ChevronDown size={16} color={palette.inkSoft} strokeWidth={2.4} />
            </View>
            <Text style={[styles.sub, { color: palette.inkSoft }]} numberOfLines={1}>{parts.join(', ')}</Text>
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
      <CountrySheet visible={open} onClose={() => setOpen(false)} />
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
  sub: {
    fontFamily: fonts.sansMd,
    fontSize: 12,
  },
  close: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing[1],
  },
  sheet: {
    gap: spacing[3],
  },
  sheetTitle: {
    ...typography.h3,
  },
  sheetHint: {
    ...typography.bodyS,
  },
  sheetRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.xs,
  },
  sheetRowText: {
    flex: 1,
    gap: 2,
  },
  sheetRowName: {
    fontFamily: fonts.sansSb,
    fontSize: 15,
  },
  sheetRowSub: {
    ...typography.caption,
  },
})
