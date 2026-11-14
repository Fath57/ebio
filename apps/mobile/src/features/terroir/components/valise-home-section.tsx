import type { TerroirCatalogItem, TerroirCountry, TerroirDepartures } from '../terroir-api'
import Bell from 'lucide-react-native/dist/esm/icons/bell'
import BellOff from 'lucide-react-native/dist/esm/icons/bell-off'
import Calendar from 'lucide-react-native/dist/esm/icons/calendar'
import ChevronDown from 'lucide-react-native/dist/esm/icons/chevron-down'
import ChevronUp from 'lucide-react-native/dist/esm/icons/chevron-up'
import Package from 'lucide-react-native/dist/esm/icons/package'
import Plane from 'lucide-react-native/dist/esm/icons/plane'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSession } from '../../../lib/auth-client'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { appAlert } from '../../common/components/app-alert'
import { PressableCard } from '../../common/components/pressable-card'
import { Thumbnail } from '../../common/components/thumbnail'
import { useTerroirMoney } from '../hooks/use-terroir-money'
import {
  fetchTerroirCatalog,
  fetchTerroirDepartures,
  formatDay,
  formatWindow,
  subscribeDepartureAlert,
  TerroirError,
  unsubscribeDepartureAlert,
  useTerroirCountries,
} from '../terroir-api'
import { guessTerroirCountry } from '../terroir-cart-context'
import { useValiseMode } from '../valise-mode-context'
import { CountryChips, TerroirBadge, terroirStyles } from './terroir-ui'

interface AlertButtonProps {
  subscribed: boolean
  busy: boolean
  onPress: () => void
}

function AlertButton({ subscribed, busy, onPress }: AlertButtonProps) {
  const { semantic } = useTheme()
  return (
    <>
      <TouchableOpacity
        style={[terroirStyles.secondaryButton, { borderColor: colors.green[600] }, busy && terroirStyles.disabled]}
        onPress={onPress}
        disabled={busy}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
      >
        {subscribed
          ? <BellOff size={16} color={colors.green[600]} strokeWidth={2.2} />
          : <Bell size={16} color={colors.green[600]} strokeWidth={2.2} />}
        <Text style={[terroirStyles.secondaryButtonText, { color: colors.green[600] }]}>
          {subscribed ? 'Ne plus être prévenu' : 'Me prévenir du prochain départ'}
        </Text>
      </TouchableOpacity>
      {subscribed && (
        <Text style={[styles.hint, { color: semantic.textSecondary }]}>
          Vous recevrez une notification dès qu’un départ sera ouvert.
        </Text>
      )}
    </>
  )
}

interface DeparturesBlockProps {
  departures: TerroirDepartures | null
  loading: boolean
  /** « vers la France », when the departure names no city. */
  toPhrase: string
  alertBusy: boolean
  onToggleAlert: () => void
}

/** The next departure and its order deadline, or the alert when there is none (US7). */
function DeparturesBlock({ departures, loading, toPhrase, alertBusy, onToggleAlert }: DeparturesBlockProps) {
  const { semantic } = useTheme()
  const { formatMoney } = useTerroirMoney()
  const [expanded, setExpanded] = useState(false)

  if (loading && !departures) {
    return (
      <View style={[terroirStyles.card, { backgroundColor: semantic.bgCard }]}>
        <ActivityIndicator color={colors.green[400]} />
      </View>
    )
  }

  const next = departures?.next ?? null
  const items = departures?.items.filter(item => !item.full) ?? []

  if (!next && items.length === 0) {
    return (
      <View style={[terroirStyles.card, { backgroundColor: semantic.bgCard }]}>
        <View style={styles.bannerRow}>
          <Calendar size={18} color={semantic.textSecondary} strokeWidth={2.2} />
          <Text style={[styles.bannerText, { color: semantic.textPrimary }]}>
            Aucun envoi n’est programmé pour l’instant.
          </Text>
        </View>
        <AlertButton subscribed={departures?.alertSubscribed === true} busy={alertBusy} onPress={onToggleAlert} />
      </View>
    )
  }

  const headline = next ?? (items[0] ? { city: null, departsOn: items[0].departsOn, orderBefore: items[0].orderBefore } : null)
  return (
    <View style={[styles.departureBanner, { borderColor: colors.blue[100], backgroundColor: colors.blue[50] }]}>
      {headline && (
        <View style={styles.bannerRow}>
          <Plane size={18} color={colors.blue[800]} strokeWidth={2.2} />
          <Text style={[styles.bannerText, { color: colors.blue[800] }]}>
            {`Prochain envoi ${headline.city ? `vers ${headline.city}` : toPhrase} : ${formatDay(headline.departsOn)}`}
            {headline.orderBefore ? `, commandez avant le ${formatDay(headline.orderBefore)}` : ''}
          </Text>
        </View>
      )}
      {items.length > 0 && (
        <TouchableOpacity
          style={styles.expandButton}
          onPress={() => setExpanded(value => !value)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
        >
          <Text style={[styles.expandText, { color: colors.blue[800] }]}>
            {expanded ? 'Masquer les départs' : `Voir les prochains départs (${items.length})`}
          </Text>
          {expanded
            ? <ChevronUp size={16} color={colors.blue[800]} strokeWidth={2.4} />
            : <ChevronDown size={16} color={colors.blue[800]} strokeWidth={2.4} />}
        </TouchableOpacity>
      )}
      {expanded && items.map(item => (
        <View key={item.departureId} style={[styles.departureRow, { backgroundColor: semantic.bgCard }]}>
          <Text style={[styles.departureAgency, { color: semantic.textPrimary }]}>{item.agency}</Text>
          <Text style={[styles.departureLine, { color: semantic.textSecondary }]}>
            {`Départ le ${formatDay(item.departsOn)}${item.orderBefore ? ` · commandez avant le ${formatDay(item.orderBefore)}` : ''}`}
          </Text>
          {(item.arrivalFrom || item.arrivalTo) && (
            <Text style={[styles.departureLine, { color: semantic.textSecondary }]}>
              {`Arrivée estimée : ${formatWindow(item.arrivalFrom, item.arrivalTo)}`}
            </Text>
          )}
          <Text style={[terroirStyles.priceSecondary, { color: semantic.textPrimary }]}>
            {`${formatMoney(item.pricePerKg).primary} / kg${item.minBilledKg > 0 ? ` · ${item.minBilledKg} kg minimum` : ''}`}
          </Text>
        </View>
      ))}
    </View>
  )
}

interface NoDepartureStateProps {
  currency: string
  onRequireLogin: () => void
}

/**
 * No country is served by an open departure: the buyer can still ask to be
 * told, for any active country (`all=true`).
 */
export function NoDepartureState({ currency, onRequireLogin }: NoDepartureStateProps) {
  const { semantic } = useTheme()
  const { data: session } = useSession()
  const allCountries = useTerroirCountries(true)
  const [picked, setPicked] = useState<TerroirCountry | null>(null)
  const [subscribed, setSubscribed] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)

  const target = allCountries?.find(entry => entry.code === picked) ?? (allCountries ? guessTerroirCountry(allCountries) : null)
  const targetCode = target?.code ?? null
  const loggedIn = Boolean(session?.user)

  // The alert state lives on the departures answer, one country at a time.
  useEffect(() => {
    if (!targetCode || !loggedIn)
      return
    let cancelled = false
    fetchTerroirDepartures(targetCode, currency)
      .then((result) => {
        if (!cancelled)
          setSubscribed(current => ({ ...current, [targetCode]: result.alertSubscribed }))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [targetCode, currency, loggedIn])

  const isSubscribed = targetCode ? subscribed[targetCode] === true : false

  const handleToggle = useCallback(async () => {
    if (!loggedIn) {
      onRequireLogin()
      return
    }
    if (!target)
      return
    setBusy(true)
    try {
      if (isSubscribed)
        await unsubscribeDepartureAlert(target.code)
      else
        await subscribeDepartureAlert(target.code)
      setSubscribed(current => ({ ...current, [target.code]: !isSubscribed }))
      if (!isSubscribed)
        appAlert('C’est noté', `Nous vous préviendrons dès qu’un départ ${target.toPhrase} sera ouvert.`)
    }
    catch (error) {
      appAlert('Alerte', error instanceof TerroirError ? error.message : 'Vérifiez votre connexion et réessayez.')
    }
    finally {
      setBusy(false)
    }
  }, [loggedIn, target, isSubscribed, onRequireLogin])

  return (
    <View style={[terroirStyles.card, { backgroundColor: semantic.bgCard }]}>
      <View style={styles.bannerRow}>
        <Calendar size={18} color={semantic.textSecondary} strokeWidth={2.2} />
        <Text style={[styles.bannerText, { color: semantic.textPrimary }]}>
          Aucun départ n’est programmé pour l’instant
        </Text>
      </View>
      {allCountries === null && <ActivityIndicator color={colors.green[400]} />}
      {allCountries !== null && allCountries.length > 0 && (
        <>
          <Text style={[styles.hint, { color: semantic.textSecondary }]}>
            Choisissez le pays où vous souhaitez recevoir votre valise : nous vous préviendrons dès qu’un départ sera ouvert.
          </Text>
          <CountryChips countries={allCountries} value={targetCode} onChange={setPicked} />
          <AlertButton
            subscribed={isSubscribed}
            busy={busy}
            onPress={() => {
              void handleToggle()
            }}
          />
        </>
      )}
      {allCountries !== null && allCountries.length === 0 && (
        <Text style={[styles.hint, { color: semantic.textSecondary }]}>Revenez bientôt : de nouveaux départs seront annoncés ici.</Text>
      )}
    </View>
  )
}

interface PackCardProps {
  item: TerroirCatalogItem
  onPress: (packId: string) => void
}

function PackCard({ item, onPress }: PackCardProps) {
  const { semantic } = useTheme()
  const { formatMoney } = useTerroirMoney()
  const money = formatMoney(item.price)
  return (
    <PressableCard
      style={[styles.packCard, { backgroundColor: semantic.bgCard }]}
      onPress={() => onPress(item.id)}
      accessibilityRole="button"
      accessibilityLabel={`Pack ${item.name}, ${money.primary}`}
    >
      <Thumbnail uri={item.imageUrl} style={styles.packImage} alt={item.name} />
      <View style={styles.packBody}>
        <Text style={[styles.packOverline, { color: colors.earth[600] }]} numberOfLines={1}>
          {item.shopName ? `Pack · ${item.shopName}` : 'Pack eBio'}
        </Text>
        <Text style={[styles.packName, { color: semantic.textPrimary }]} numberOfLines={2}>{item.name}</Text>
        <Text style={[terroirStyles.price, { color: semantic.textPrimary }]}>{money.primary}</Text>
        {money.secondary && <Text style={[terroirStyles.priceSecondary, { color: semantic.textTertiary }]}>{money.secondary}</Text>}
        {item.badge && <TerroirBadge />}
      </View>
    </PressableCard>
  )
}

interface ValiseHomeSectionProps {
  onOpenPack: (packId: string) => void
  onRequireLogin: () => void
}

/**
 * What the home adds in Valise mode: the next departure (or the alert when
 * none is planned) and the « Packs du pays » rail.
 */
export function ValiseHomeSection({ onOpenPack, onRequireLogin }: ValiseHomeSectionProps) {
  const { semantic } = useTheme()
  const { data: session } = useSession()
  const { active, country, countryInfo } = useValiseMode()
  const { displayCurrency } = useTerroirMoney()
  const [departures, setDepartures] = useState<TerroirDepartures | null>(null)
  const [departuresLoading, setDeparturesLoading] = useState(true)
  const [packs, setPacks] = useState<TerroirCatalogItem[]>([])
  const [alertBusy, setAlertBusy] = useState(false)

  useEffect(() => {
    if (!active || !country)
      return
    const target = country
    let cancelled = false
    async function load(): Promise<void> {
      setDeparturesLoading(true)
      const [catalogResult, departuresResult] = await Promise.allSettled([
        fetchTerroirCatalog(target, displayCurrency),
        fetchTerroirDepartures(target, displayCurrency),
      ])
      if (cancelled)
        return
      setPacks(catalogResult.status === 'fulfilled' ? catalogResult.value.items.filter(item => item.kind === 'PACK') : [])
      setDepartures(departuresResult.status === 'fulfilled' ? departuresResult.value : null)
      setDeparturesLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [active, country, displayCurrency])

  const handleToggleAlert = useCallback(async () => {
    if (!session?.user) {
      onRequireLogin()
      return
    }
    if (!countryInfo)
      return
    const subscribed = departures?.alertSubscribed === true
    setAlertBusy(true)
    try {
      if (subscribed)
        await unsubscribeDepartureAlert(countryInfo.code)
      else
        await subscribeDepartureAlert(countryInfo.code)
      setDepartures(current => current ? { ...current, alertSubscribed: !subscribed } : { next: null, items: [], alertSubscribed: !subscribed })
      if (!subscribed)
        appAlert('C’est noté', `Nous vous préviendrons dès qu’un départ ${countryInfo.toPhrase} sera ouvert.`)
    }
    catch (error) {
      appAlert('Alerte', error instanceof TerroirError ? error.message : 'Vérifiez votre connexion et réessayez.')
    }
    finally {
      setAlertBusy(false)
    }
  }, [session?.user, departures?.alertSubscribed, countryInfo, onRequireLogin])

  if (!active || !countryInfo)
    return null

  return (
    <View style={styles.section}>
      <View style={styles.padded}>
        <DeparturesBlock
          departures={departures}
          loading={departuresLoading}
          toPhrase={countryInfo.toPhrase}
          alertBusy={alertBusy}
          onToggleAlert={() => {
            void handleToggleAlert()
          }}
        />
      </View>
      {packs.length > 0 && (
        <View style={styles.packsBlock}>
          <View style={styles.packsHeader}>
            <Package size={14} color={colors.earth[600]} strokeWidth={2.4} />
            <Text style={[styles.overline, { color: semantic.textSecondary }]}>Packs du pays</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.packsRail}>
            {packs.map(item => (
              <View key={item.id} style={styles.packCell}>
                <PackCard item={item} onPress={onOpenPack} />
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  section: {
    marginTop: spacing[4],
    gap: spacing[4],
  },
  padded: {
    paddingHorizontal: spacing[4],
  },
  hint: {
    ...typography.bodyS,
  },
  departureBanner: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing[4],
    gap: spacing[3],
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
  },
  bannerText: {
    flex: 1,
    fontFamily: fonts.sansSb,
    fontSize: 14,
  },
  expandButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  expandText: {
    fontFamily: fonts.sansSb,
    fontSize: 13,
  },
  departureRow: {
    borderRadius: radius.md,
    padding: spacing[3],
    gap: 2,
  },
  departureAgency: {
    fontFamily: fonts.sansSb,
    fontSize: 14,
  },
  departureLine: {
    ...typography.bodyS,
  },
  packsBlock: {
    gap: spacing[3],
  },
  packsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
  },
  overline: {
    ...typography.overline,
  },
  packsRail: {
    paddingHorizontal: spacing[4],
    gap: spacing[3],
  },
  packCell: {
    width: 200,
  },
  packCard: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    shadowColor: colors.neutral[900],
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 1,
  },
  packImage: {
    width: '100%',
    aspectRatio: 4 / 3,
  },
  packBody: {
    padding: spacing[3],
    gap: spacing[1],
  },
  packOverline: {
    ...typography.overline,
  },
  packName: {
    fontFamily: fonts.sansSb,
    fontSize: 14,
  },
})
