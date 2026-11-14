import type { TerroirCatalogItem, TerroirCountry, TerroirDepartures } from '../terroir-api'
import Bell from 'lucide-react-native/dist/esm/icons/bell'
import BellOff from 'lucide-react-native/dist/esm/icons/bell-off'
import Calendar from 'lucide-react-native/dist/esm/icons/calendar'
import ChevronDown from 'lucide-react-native/dist/esm/icons/chevron-down'
import ChevronUp from 'lucide-react-native/dist/esm/icons/chevron-up'
import Plane from 'lucide-react-native/dist/esm/icons/plane'
import ShoppingBasket from 'lucide-react-native/dist/esm/icons/shopping-basket'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSession } from '../../../lib/auth-client'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { appAlert } from '../../common/components/app-alert'
import { PressableCard } from '../../common/components/pressable-card'
import { ScreenHeader } from '../../common/components/screen-header'
import { Thumbnail } from '../../common/components/thumbnail'
import { useTabBarClearance } from '../../common/hooks/use-tab-bar-clearance'
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
import { guessTerroirCountry, useTerroirCart } from '../terroir-cart-context'
import { CountryChips, TerroirBadge, terroirStyles } from './terroir-ui'

interface TerroirHomeScreenProps {
  onBack: () => void
  onOpenProduct: (productId: string) => void
  onOpenPack: (packId: string) => void
  onOpenCart: () => void
  onRequireLogin: () => void
}

interface CatalogCardProps {
  item: TerroirCatalogItem
  onPress: (item: TerroirCatalogItem) => void
}

function CatalogCard({ item, onPress }: CatalogCardProps) {
  const { semantic } = useTheme()
  const { formatMoney } = useTerroirMoney()
  const money = formatMoney(item.price)
  return (
    <PressableCard
      style={[styles.productCard, { backgroundColor: semantic.bgCard }]}
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={`${item.kind === 'PACK' ? 'Pack ' : ''}${item.name}, ${money.primary}`}
    >
      <Thumbnail uri={item.imageUrl} style={styles.productImage} alt={item.name} />
      <View style={styles.productBody}>
        {item.kind === 'PACK' && <Text style={[styles.packLabel, { color: colors.earth[600] }]}>Pack</Text>}
        <Text style={[styles.productName, { color: semantic.textPrimary }]} numberOfLines={2}>{item.name}</Text>
        {item.shopName && (
          <Text style={[styles.productShop, { color: semantic.textSecondary }]} numberOfLines={1}>{item.shopName}</Text>
        )}
        <Text style={[terroirStyles.price, { color: semantic.textPrimary }]}>{money.primary}</Text>
        {money.secondary && (
          <Text style={[terroirStyles.priceSecondary, { color: semantic.textTertiary }]}>{money.secondary}</Text>
        )}
        {item.badge && <TerroirBadge />}
      </View>
    </PressableCard>
  )
}

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
function NoDepartureState({ currency, onRequireLogin }: NoDepartureStateProps) {
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

export function TerroirHomeScreen({ onBack, onOpenProduct, onOpenPack, onOpenCart, onRequireLogin }: TerroirHomeScreenProps) {
  const { semantic } = useTheme()
  const bottomClearance = useTabBarClearance()
  const { data: session } = useSession()
  const { country, countryInfo, countries, countriesError, reloadCountries, setCountry, itemCount } = useTerroirCart()
  const { displayCurrency } = useTerroirMoney()
  const [catalog, setCatalog] = useState<TerroirCatalogItem[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [departures, setDepartures] = useState<TerroirDepartures | null>(null)
  const [departuresLoading, setDeparturesLoading] = useState(true)
  const [alertBusy, setAlertBusy] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!country)
      return
    const target = country
    let cancelled = false
    async function load(): Promise<void> {
      setCatalogLoading(true)
      setDeparturesLoading(true)
      setCatalogError(null)
      const [catalogResult, departuresResult] = await Promise.allSettled([
        fetchTerroirCatalog(target, displayCurrency),
        fetchTerroirDepartures(target, displayCurrency),
      ])
      if (cancelled)
        return
      if (catalogResult.status === 'fulfilled') {
        setCatalog(catalogResult.value.items)
      }
      else {
        setCatalog([])
        setCatalogError(catalogResult.reason instanceof Error ? catalogResult.reason.message : 'Impossible de charger la Valise du pays.')
      }
      setDepartures(departuresResult.status === 'fulfilled' ? departuresResult.value : null)
      setCatalogLoading(false)
      setDeparturesLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [country, displayCurrency, reloadKey])

  const reloadAll = useCallback(() => {
    reloadCountries()
    setReloadKey(key => key + 1)
  }, [reloadCountries])

  // The module may have opened after the app started: the provider then has
  // no countries yet, so the space asks for them on arrival.
  useEffect(() => {
    if (countries === null)
      reloadCountries()
  }, [])

  const handleOpen = useCallback((item: TerroirCatalogItem) => {
    if (item.kind === 'PACK')
      onOpenPack(item.id)
    else
      onOpenProduct(item.id)
  }, [onOpenPack, onOpenProduct])

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
      if (!subscribed) {
        appAlert('C’est noté', `Nous vous préviendrons dès qu’un départ ${countryInfo.toPhrase} sera ouvert.`)
      }
    }
    catch (error) {
      appAlert('Alerte', error instanceof TerroirError ? error.message : 'Vérifiez votre connexion et réessayez.')
    }
    finally {
      setAlertBusy(false)
    }
  }, [session?.user, departures?.alertSubscribed, countryInfo, onRequireLogin])

  const cartButton = (
    <TouchableOpacity
      style={styles.cartButton}
      onPress={onOpenCart}
      accessibilityRole="button"
      accessibilityLabel={itemCount > 0 ? `Ma valise, ${itemCount} article${itemCount > 1 ? 's' : ''}` : 'Ma valise'}
    >
      <ShoppingBasket size={22} color={semantic.textPrimary} strokeWidth={2} />
      {itemCount > 0 && (
        <View style={styles.cartCount}>
          <Text style={styles.cartCountText}>{itemCount > 99 ? '99+' : String(itemCount)}</Text>
        </View>
      )}
    </TouchableOpacity>
  )

  const intro = (
    <Text style={[styles.intro, { color: semantic.textSecondary }]}>
      Des produits validés par eBio pour voyager, envoyés en un seul colis par une agence partenaire.
    </Text>
  )

  // No country known yet: still loading, failed, or none served by a departure.
  if (!countryInfo || !countries) {
    return (
      <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
        <ScreenHeader title="La Valise du pays" onBack={onBack} rightSlot={cartButton} />
        <ScrollView contentContainerStyle={[styles.listContent, styles.headerBlock, { paddingBottom: bottomClearance + spacing[6] }]}>
          {intro}
          {((countries === null && !countriesError) || (countries !== null && countries.length > 0)) && (
            <ActivityIndicator style={styles.loader} color={colors.green[400]} />
          )}
          {countries === null && countriesError && (
            <View style={terroirStyles.centered}>
              <Text style={[terroirStyles.muted, { color: semantic.textSecondary }]}>{countriesError}</Text>
              <TouchableOpacity
                style={[terroirStyles.secondaryButton, { borderColor: semantic.borderNormal }]}
                onPress={reloadAll}
                accessibilityRole="button"
              >
                <Text style={[terroirStyles.secondaryButtonText, { color: semantic.textPrimary }]}>Réessayer</Text>
              </TouchableOpacity>
            </View>
          )}
          {countries !== null && countries.length === 0 && <NoDepartureState currency={displayCurrency} onRequireLogin={onRequireLogin} />}
        </ScrollView>
      </View>
    )
  }

  const header = (
    <View style={styles.headerBlock}>
      {intro}
      <CountryChips countries={countries} value={country} onChange={setCountry} />
      <DeparturesBlock
        departures={departures}
        loading={departuresLoading}
        toPhrase={countryInfo.toPhrase}
        alertBusy={alertBusy}
        onToggleAlert={() => {
          void handleToggleAlert()
        }}
      />
      <Text style={[styles.sectionTitle, { color: semantic.textTertiary }]}>Produits et packs</Text>
    </View>
  )

  return (
    <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader
        title="La Valise du pays"
        subtitle={`Livré ${countryInfo.inPhrase}`}
        onBack={onBack}
        rightSlot={cartButton}
      />
      <FlatList
        data={catalogLoading ? [] : catalog}
        keyExtractor={item => `${item.kind}-${item.id}`}
        numColumns={2}
        columnWrapperStyle={styles.column}
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomClearance + spacing[6] }]}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <View style={styles.cell}>
            <CatalogCard item={item} onPress={handleOpen} />
          </View>
        )}
        refreshing={false}
        onRefresh={reloadAll}
        ListEmptyComponent={catalogLoading
          ? <ActivityIndicator style={styles.loader} color={colors.green[400]} />
          : (
              <View style={terroirStyles.centered}>
                <Text style={[terroirStyles.muted, { color: semantic.textSecondary }]}>
                  {catalogError ?? `Aucun produit n’est encore proposé à l’envoi ${countryInfo.toPhrase}.`}
                </Text>
                {catalogError && (
                  <TouchableOpacity
                    style={[terroirStyles.secondaryButton, { borderColor: semantic.borderNormal }]}
                    onPress={() => setReloadKey(key => key + 1)}
                    accessibilityRole="button"
                  >
                    <Text style={[terroirStyles.secondaryButtonText, { color: semantic.textPrimary }]}>Réessayer</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing[4],
  },
  headerBlock: {
    gap: spacing[4],
    paddingTop: spacing[2],
    paddingBottom: spacing[3],
  },
  intro: {
    ...typography.bodyS,
  },
  sectionTitle: {
    ...typography.overline,
    marginTop: spacing[2],
  },
  column: {
    gap: spacing[3],
  },
  cell: {
    flex: 1,
    marginBottom: spacing[3],
  },
  productCard: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    shadowColor: colors.neutral[900],
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 1,
  },
  productImage: {
    width: '100%',
    aspectRatio: 4 / 3,
  },
  productBody: {
    padding: spacing[3],
    gap: spacing[1],
  },
  packLabel: {
    ...typography.overline,
  },
  productName: {
    fontFamily: fonts.sansSb,
    fontSize: 14,
  },
  productShop: {
    ...typography.caption,
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
  hint: {
    ...typography.bodyS,
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
  cartButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartCount: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.green[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartCountText: {
    fontFamily: fonts.sansBd,
    fontSize: 10,
    color: colors.neutral[0],
  },
  loader: {
    marginTop: spacing[8],
  },
})
