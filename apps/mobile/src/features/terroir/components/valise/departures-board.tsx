import type { ReactNode } from 'react'
import type { DisplayCurrency } from '../../../common/currency-context'
import type { TerroirCountryInfo, TerroirDepartures } from '../../terroir-api'
import type { BoardStatus } from './valise-stores'
import Bell from 'lucide-react-native/dist/esm/icons/bell'
import BellRing from 'lucide-react-native/dist/esm/icons/bell-ring'
import Check from 'lucide-react-native/dist/esm/icons/check'
import PlaneTakeoff from 'lucide-react-native/dist/esm/icons/plane-takeoff'
import Search from 'lucide-react-native/dist/esm/icons/search'
import X from 'lucide-react-native/dist/esm/icons/x'
import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { navigationRef } from '../../../../app/navigation-ref'
import { useSession } from '../../../../lib/auth-client'
import { colors, fonts, radius, spacing } from '../../../../theme/theme'
import { appAlert } from '../../../common/components/app-alert'
import { useCurrency } from '../../../common/currency-context'
import { formatMoney } from '../../../common/hooks/use-money'
import { subscribeDepartureAlert, TerroirError, unsubscribeDepartureAlert, useTerroirCountries } from '../../terroir-api'
import { useTerroirCart } from '../../terroir-cart-context'
import { AirmailBand } from './valise-art'
import {
  BOARD_STATUS_LABELS,
  boardStatus,
  cachedValiseDepartures,
  countryCurrency,
  departureHeadline,
  formatShortDay,
  primeValiseDepartures,
  useValiseDeparturesFor,
} from './valise-stores'

/**
 * « Tableau des départs »: every destination as a row of an airport board,
 * flaps and all. An offered country is chosen with a tap; a country without
 * a departure yet offers the alert of the next one.
 *
 * The board is a physical object, dark in both themes: neutral 900, never
 * pure black, with warm paper-white letters.
 */

const SEARCH_THRESHOLD = 6
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1)
const FLAP_STAGGER_MS = 45
const MAX_STAGGERED = 10

interface BoardRow {
  info: TerroirCountryInfo
  offered: boolean
  currency: DisplayCurrency
  departures: TerroirDepartures | null
  status: BoardStatus
}

const STATUS_STYLES: Record<BoardStatus, { color: string, borderColor: string, backgroundColor: string }> = {
  BOARDING: { color: colors.neutral[900], borderColor: colors.earth[400], backgroundColor: colors.earth[400] },
  ON_TIME: { color: colors.green[200], borderColor: colors.green[200], backgroundColor: 'transparent' },
  FULL: { color: colors.neutral[200], borderColor: colors.neutral[600], backgroundColor: 'transparent' },
  SOON: { color: colors.blue[200], borderColor: colors.blue[400], backgroundColor: 'transparent' },
  LOADING: { color: colors.neutral[400], borderColor: colors.neutral[600], backgroundColor: 'transparent' },
}

function compareRows(a: BoardRow, b: BoardRow): number {
  const dayA = departureHeadline(a.departures)?.departsOn ?? null
  const dayB = departureHeadline(b.departures)?.departsOn ?? null
  if (a.offered !== b.offered)
    return a.offered ? -1 : 1
  if (dayA && dayB && dayA !== dayB)
    return dayA < dayB ? -1 : 1
  if (dayA && !dayB)
    return -1
  if (!dayA && dayB)
    return 1
  return a.info.name.localeCompare(b.info.name, 'fr')
}

/** Lower case, no accents: « etats » finds « États-Unis ». */
function fold(text: string): string {
  // Combining accents (U+0300 to U+036F), spelled out: safer on Hermes than \p{M}.

  return text.normalize('NFD').replace(/[\u0300-\u036F]/g, '').toLowerCase()
}

interface FlapProps {
  label: string
  value: string
  mono?: boolean
}

/** One split-flap cell: a small caption over the value, a seam across the middle. */
function Flap({ label, value, mono = false }: FlapProps) {
  return (
    <View style={styles.flap}>
      <Text style={styles.flapLabel}>{label}</Text>
      <View style={styles.flapValueBox}>
        <Text style={[mono ? styles.flapValueMono : styles.flapValue]}>{value}</Text>
        <View style={styles.flapSeam} />
      </View>
    </View>
  )
}

interface FlapRevealProps {
  index: number
  children: ReactNode
}

/** The row turns down into place like a flap; reduced motion only fades it in. */
function FlapReveal({ index, children }: FlapRevealProps) {
  const reduced = useReducedMotion()
  const progress = useSharedValue(0)
  useEffect(() => {
    const delay = Math.min(index, MAX_STAGGERED) * FLAP_STAGGER_MS
    progress.set(withDelay(delay, withTiming(1, { duration: reduced ? 150 : 300, easing: EASE_OUT })))
  }, [index, progress, reduced])
  const style = useAnimatedStyle(() => reduced
    ? { opacity: progress.get() }
    : {
        opacity: Math.min(1, progress.get() * 2),
        transform: [{ perspective: 700 }, { rotateX: `${(1 - progress.get()) * -80}deg` }],
      })
  return <Animated.View style={[styles.flapOrigin, style]}>{children}</Animated.View>
}

interface BoardRowViewProps {
  row: BoardRow
  current: boolean
  alertBusy: boolean
  onSelect: (row: BoardRow) => void
  onToggleAlert: (row: BoardRow) => void
}

function BoardRowView({ row, current, alertBusy, onSelect, onToggleAlert }: BoardRowViewProps) {
  const { rates } = useCurrency()
  const headline = departureHeadline(row.departures)
  const status = STATUS_STYLES[row.status]
  const statusLabel = BOARD_STATUS_LABELS[row.status]
  const city = headline?.city ?? null
  const kilo = headline?.pricePerKg ? formatMoney(headline.pricePerKg, row.currency, rates).primary : null
  const selectable = row.offered && row.status !== 'FULL'
  const subscribed = row.departures?.alertSubscribed === true

  const summary = [
    row.info.name,
    city ? `retrait à ${city}` : null,
    headline ? `départ le ${formatShortDay(headline.departsOn)}` : null,
    headline?.orderBefore ? `commandez avant le ${formatShortDay(headline.orderBefore)}` : null,
    kilo ? `dès ${kilo} le kilo` : null,
    statusLabel,
    current ? 'destination actuelle' : null,
  ].filter(Boolean).join(', ')

  return (
    <Pressable
      onPress={() => onSelect(row)}
      disabled={!selectable}
      style={({ pressed }) => [styles.row, current && styles.rowCurrent, pressed && styles.rowPressed]}
      accessibilityRole={selectable ? 'radio' : 'text'}
      accessibilityState={selectable ? { selected: current } : undefined}
      accessibilityLabel={summary}
    >
      <View style={styles.rowHead}>
        <Text style={styles.flag} maxFontSizeMultiplier={1.3}>{row.info.flagEmoji ?? '✈'}</Text>
        <View style={styles.rowName}>
          <Text style={styles.country} numberOfLines={1}>{row.info.name}</Text>
          {city && <Text style={styles.city} numberOfLines={1}>{`Retrait à ${city}`}</Text>}
        </View>
        {current && <Check size={18} color={colors.earth[200]} strokeWidth={2.6} />}
        <View style={[styles.status, { borderColor: status.borderColor, backgroundColor: status.backgroundColor }]}>
          <Text style={[styles.statusText, { color: status.color }]} numberOfLines={1}>{statusLabel}</Text>
        </View>
      </View>

      {headline && (
        <View style={styles.flaps}>
          <Flap label="Départ" value={formatShortDay(headline.departsOn)} />
          {headline.orderBefore && <Flap label="Commandez avant" value={formatShortDay(headline.orderBefore)} />}
          {kilo && <Flap label="Transport" value={`dès ${kilo}/kg`} mono />}
        </View>
      )}

      {!row.offered && (
        <Pressable
          onPress={() => onToggleAlert(row)}
          disabled={alertBusy}
          style={({ pressed }) => [styles.alert, pressed && styles.rowPressed, alertBusy && styles.disabled]}
          accessibilityRole="button"
          accessibilityState={{ disabled: alertBusy }}
          accessibilityLabel={subscribed ? `Ne plus être prévenu pour ${row.info.name}` : `Me prévenir du prochain départ ${row.info.toPhrase}`}
        >
          {subscribed
            ? <BellRing size={16} color={colors.blue[200]} strokeWidth={2.2} />
            : <Bell size={16} color={colors.blue[200]} strokeWidth={2.2} />}
          <Text style={styles.alertText}>{subscribed ? 'Ne plus être prévenu' : 'Me prévenir'}</Text>
        </Pressable>
      )}
    </Pressable>
  )
}

interface DeparturesBoardProps {
  visible: boolean
  onClose: () => void
}

function BoardContent({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets()
  const { rates } = useCurrency()
  const { data: session } = useSession()
  const { countries, country, setCountry } = useTerroirCart()
  const allCountries = useTerroirCountries(true)
  const [query, setQuery] = useState('')
  const [busyCode, setBusyCode] = useState<string | null>(null)

  // Offered countries first, then every other active one (« Bientôt »).
  const entries = useMemo(() => {
    const offered = countries ?? []
    const offeredCodes = new Set(offered.map(entry => entry.code))
    const others = (allCountries ?? []).filter(entry => !offeredCodes.has(entry.code))
    return [
      ...offered.map(info => ({ info, offered: true, currency: countryCurrency(info, rates) })),
      ...others.map(info => ({ info, offered: false, currency: countryCurrency(info, rates) })),
    ]
  }, [countries, allCountries, rates])

  const departuresByCountry = useValiseDeparturesFor(entries.map(entry => ({ country: entry.info.code, currency: entry.currency })))

  const rows: BoardRow[] = entries
    .map((entry) => {
      const departures = departuresByCountry[entry.info.code] ?? null
      return { ...entry, departures, status: boardStatus(entry.offered, departures) }
    })
    .sort(compareRows)

  const folded = fold(query.trim())
  const visibleRows = folded
    ? rows.filter(row => fold(`${row.info.name} ${departureHeadline(row.departures)?.city ?? ''} ${row.info.code}`).includes(folded))
    : rows

  const handleSelect = (row: BoardRow): void => {
    setCountry(row.info.code)
    onClose()
  }

  const handleToggleAlert = async (row: BoardRow): Promise<void> => {
    if (!session?.user) {
      onClose()
      if (navigationRef.isReady())
        navigationRef.navigate('Accueil', { screen: 'Login' })
      return
    }
    const subscribed = row.departures?.alertSubscribed === true
    setBusyCode(row.info.code)
    try {
      if (subscribed)
        await unsubscribeDepartureAlert(row.info.code)
      else
        await subscribeDepartureAlert(row.info.code)
      const known = cachedValiseDepartures(row.info.code, row.currency)
      primeValiseDepartures(row.info.code, row.currency, known
        ? { ...known, alertSubscribed: !subscribed }
        : { next: null, items: [], alertSubscribed: !subscribed })
      if (!subscribed)
        appAlert('C’est noté', `Nous vous préviendrons dès qu’un départ ${row.info.toPhrase} sera ouvert.`)
    }
    catch (error) {
      appAlert('Alerte', error instanceof TerroirError ? error.message : 'Vérifiez votre connexion et réessayez.')
    }
    finally {
      setBusyCode(null)
    }
  }

  return (
    <View style={[styles.board, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <PlaneTakeoff size={22} color={colors.earth[200]} strokeWidth={2.2} />
        <View style={styles.headerText}>
          <Text style={styles.title}>Tableau des départs</Text>
          <Text style={styles.subtitle}>Depuis Cotonou, par nos agences partenaires</Text>
        </View>
        <Pressable
          onPress={onClose}
          hitSlop={4}
          style={({ pressed }) => [styles.close, pressed && styles.rowPressed]}
          accessibilityRole="button"
          accessibilityLabel="Fermer le tableau des départs"
        >
          <X size={22} color={colors.neutral[50]} strokeWidth={2.4} />
        </Pressable>
      </View>
      <AirmailBand height={6} colorA={colors.earth[400]} colorB={colors.blue[400]} />

      {rows.length > SEARCH_THRESHOLD && (
        <View style={styles.searchField}>
          <Search size={16} color={colors.neutral[400]} strokeWidth={2.2} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Rechercher un pays ou une ville"
            placeholderTextColor={colors.neutral[400]}
            autoCorrect={false}
            accessibilityLabel="Rechercher une destination"
          />
        </View>
      )}

      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing[6] }]}
        keyboardShouldPersistTaps="handled"
        accessibilityRole="radiogroup"
      >
        {countries === null && <ActivityIndicator color={colors.earth[200]} style={styles.loader} />}
        {visibleRows.map((row, index) => (
          <FlapReveal key={row.info.code} index={index}>
            <BoardRowView
              row={row}
              current={row.offered && row.info.code === country}
              alertBusy={busyCode === row.info.code}
              onSelect={handleSelect}
              onToggleAlert={(target) => {
                void handleToggleAlert(target)
              }}
            />
          </FlapReveal>
        ))}
        {folded !== '' && visibleRows.length === 0 && (
          <Text style={styles.empty}>Aucune destination ne correspond à cette recherche.</Text>
        )}
      </ScrollView>
    </View>
  )
}

/** The departures board, full screen. */
export function DeparturesBoard({ visible, onClose }: DeparturesBoardProps) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      {visible && <BoardContent onClose={onClose} />}
    </Modal>
  )
}

const styles = StyleSheet.create({
  board: {
    flex: 1,
    backgroundColor: colors.neutral[900],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingLeft: spacing[4],
    paddingRight: spacing[2],
    paddingVertical: spacing[3],
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 26,
    lineHeight: 30,
    color: colors.neutral[50],
  },
  subtitle: {
    fontFamily: fonts.sansMd,
    fontSize: 13,
    color: colors.neutral[200],
  },
  close: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginHorizontal: spacing[4],
    marginTop: spacing[4],
    paddingHorizontal: spacing[3],
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.neutral[600],
    backgroundColor: colors.neutral[800],
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.neutral[50],
  },
  list: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    gap: spacing[3],
  },
  loader: {
    marginTop: spacing[8],
  },
  flapOrigin: {
    transformOrigin: 'top',
  },
  row: {
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.neutral[800],
    backgroundColor: colors.neutral[900],
  },
  rowCurrent: {
    borderWidth: 2,
    borderColor: colors.earth[200],
  },
  rowPressed: {
    opacity: 0.75,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  flag: {
    fontSize: 26,
  },
  rowName: {
    flex: 1,
    gap: 1,
  },
  country: {
    fontFamily: fonts.sansBd,
    fontSize: 16,
    color: colors.neutral[50],
  },
  city: {
    fontFamily: fonts.sansMd,
    fontSize: 12,
    color: colors.neutral[200],
  },
  status: {
    minHeight: 24,
    paddingHorizontal: spacing[2],
    borderRadius: radius.xs,
    borderWidth: 1,
    justifyContent: 'center',
  },
  statusText: {
    fontFamily: fonts.sansBd,
    fontSize: 11,
  },
  flaps: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  flap: {
    gap: 2,
  },
  flapLabel: {
    fontFamily: fonts.sansMd,
    fontSize: 11,
    color: colors.neutral[400],
  },
  flapValueBox: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: radius.xs,
    backgroundColor: colors.neutral[800],
    overflow: 'hidden',
  },
  flapValue: {
    fontFamily: fonts.sansBd,
    fontSize: 15,
    color: colors.neutral[50],
  },
  flapValueMono: {
    fontFamily: fonts.mono,
    fontSize: 15,
    color: colors.neutral[50],
  },
  flapSeam: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: 1,
    opacity: 0.6,
    backgroundColor: colors.neutral[900],
  },
  alert: {
    alignSelf: 'flex-start',
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.blue[400],
  },
  alertText: {
    fontFamily: fonts.sansSb,
    fontSize: 14,
    color: colors.blue[200],
  },
  disabled: {
    opacity: 0.5,
  },
  empty: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.neutral[200],
    textAlign: 'center',
    marginTop: spacing[6],
  },
})
