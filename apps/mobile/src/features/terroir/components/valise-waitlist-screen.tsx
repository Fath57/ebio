import { useEffect } from 'react'
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { colors, fonts, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { ScreenHeader } from '../../common/components/screen-header'
import { useTabBarClearance } from '../../common/hooks/use-tab-bar-clearance'
import { useTerroirMoney } from '../hooks/use-terroir-money'
import { useTerroirCart } from '../terroir-cart-context'
import { useValiseMode } from '../valise-mode-context'
import { terroirStyles } from './terroir-ui'
import { NoDepartureState } from './valise-home-section'
import { VALISE_IMAGES, WAITING_RATIO } from './valise/valise-art'

interface ValiseWaitlistScreenProps {
  onBack: () => void
  /** The mode just turned on: back to the home, now in Valise mode. */
  onEntered: () => void
  onRequireLogin: () => void
}

/**
 * Where the home card leads while no country can be offered yet: the
 * countries are still loading, failed, or no departure is open. As soon as a
 * country is offered, the Valise mode turns on and the buyer goes back home.
 */
export function ValiseWaitlistScreen({ onBack, onEntered, onRequireLogin }: ValiseWaitlistScreenProps) {
  const { semantic } = useTheme()
  const bottomClearance = useTabBarClearance()
  const { countries, countriesError, reloadCountries } = useTerroirCart()
  const { enter } = useValiseMode()
  const { displayCurrency } = useTerroirMoney()
  const offered = countries !== null && countries.length > 0

  // The module may have opened after the app started: ask for the countries.
  useEffect(() => {
    if (countries === null)
      reloadCountries()
  }, [])

  useEffect(() => {
    if (!offered)
      return
    enter()
    onEntered()
  }, [offered])

  return (
    <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader title="La Valise du pays" onBack={onBack} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomClearance + spacing[6] }]}>
        <View style={styles.hero}>
          <Image source={VALISE_IMAGES.waiting} style={styles.heroImage} resizeMode="contain" accessibilityIgnoresInvertColors />
          <Text style={[styles.title, { color: semantic.textPrimary }]}>Votre valise attend son vol</Text>
          <Text style={[styles.intro, { color: semantic.textSecondary }]}>
            Des produits validés par eBio pour voyager, envoyés depuis Cotonou en un seul colis par une agence partenaire.
          </Text>
        </View>
        {(countries === null && !countriesError) || offered
          ? <ActivityIndicator style={styles.loader} color={colors.green[400]} />
          : null}
        {countries === null && countriesError && (
          <View style={terroirStyles.centered}>
            <Text style={[terroirStyles.muted, { color: semantic.textSecondary }]}>{countriesError}</Text>
            <TouchableOpacity
              style={[terroirStyles.secondaryButton, { borderColor: semantic.borderNormal }]}
              onPress={reloadCountries}
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    gap: spacing[4],
  },
  hero: {
    alignItems: 'center',
    gap: spacing[2],
  },
  heroImage: {
    width: 220,
    height: Math.round(220 * WAITING_RATIO),
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 34,
    textAlign: 'center',
  },
  intro: {
    ...typography.bodyS,
    textAlign: 'center',
  },
  loader: {
    marginTop: spacing[8],
  },
})
