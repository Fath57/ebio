import type { TerroirCatalogItem, TerroirCountry, TerroirDepartures } from '../terroir-api'
import Bell from 'lucide-react-native/dist/esm/icons/bell'
import BellOff from 'lucide-react-native/dist/esm/icons/bell-off'
import Calendar from 'lucide-react-native/dist/esm/icons/calendar'
import Package from 'lucide-react-native/dist/esm/icons/package'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
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
  subscribeDepartureAlert,
  TerroirError,
  unsubscribeDepartureAlert,
  useTerroirCountries,
} from '../terroir-api'
import { guessTerroirCountry } from '../terroir-cart-context'
import { useValiseMode } from '../valise-mode-context'
import { CountryChips, TerroirBadge, terroirStyles } from './terroir-ui'
import { VALISE_IMAGES, WAITING_RATIO } from './valise/valise-art'
import { primeValiseDepartures } from './valise/valise-stores'

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
  alertBusy: boolean
  onToggleAlert: () => void
}

/**
 * The alert of the next departure, only when none is open (US7). An open
 * departure is told by the mode banner, which unfolds its details.
 */
function DeparturesBlock({ departures, loading, alertBusy, onToggleAlert }: DeparturesBlockProps) {
  const { semantic } = useTheme()
  if (loading || !departures)
    return null
  if (departures.next || departures.items.some(item => !item.full))
    return null
  return (
    <View style={[terroirStyles.card, { backgroundColor: semantic.bgCard }]}>
      <Image source={VALISE_IMAGES.waiting} style={styles.waitingSmall} resizeMode="contain" accessibilityIgnoresInvertColors />
      <View style={styles.bannerRow}>
        <Calendar size={18} color={semantic.textSecondary} strokeWidth={2.2} />
        <Text style={[styles.bannerText, { color: semantic.textPrimary }]}>
          Aucun envoi n’est programmé pour l’instant.
        </Text>
      </View>
      <AlertButton subscribed={departures.alertSubscribed === true} busy={alertBusy} onPress={onToggleAlert} />
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
      if (departuresResult.status === 'fulfilled')
        primeValiseDepartures(target, displayCurrency, departuresResult.value)
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

  // An open departure is told by the banner; this section keeps the alert for when there is none.
  const noOpenDeparture = !departuresLoading && departures !== null && !departures.next && !departures.items.some(item => !item.full)
  if (!noOpenDeparture && packs.length === 0)
    return null

  return (
    <View style={styles.section}>
      {noOpenDeparture && (
        <View style={styles.padded}>
          <DeparturesBlock
            departures={departures}
            loading={departuresLoading}
            alertBusy={alertBusy}
            onToggleAlert={() => {
              void handleToggleAlert()
            }}
          />
        </View>
      )}
      {packs.length > 0 && (
        <View style={styles.packsBlock}>
          <View style={styles.packsHeader}>
            <Package size={14} color={semantic.textSecondary} strokeWidth={2.4} />
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
    paddingBottom: spacing[4],
    gap: spacing[3],
    overflow: 'hidden',
  },
  departureInset: {
    marginHorizontal: spacing[4],
  },
  departureTear: {
    marginBottom: spacing[2],
  },
  waitingSmall: {
    alignSelf: 'center',
    width: 140,
    height: Math.round(140 * WAITING_RATIO),
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
    marginHorizontal: spacing[4],
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
