import { StyleSheet, Text, View } from 'react-native'
import { spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { appAlert } from '../../common/components/app-alert'
import { ScreenHeader } from '../../common/components/screen-header'
import { ProductRatingStep } from './product-rating-step'

interface RateProductsScreenProps {
  orderId: string
  onDone: () => void
  onBack: () => void
}

/**
 * Reviewing what you received, once you have consumed it.
 *
 * This screen exists apart from the order rating for a substantive reason: the
 * product used to be rated at delivery, before anything had been tasted. The
 * invitation now arrives hours later and leads straight here — the shop and
 * the courier, for their part, are judged on arrival.
 */
export function RateProductsScreen({ orderId, onDone, onBack }: RateProductsScreenProps) {
  const { semantic } = useTheme()

  return (
    <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader title="Votre avis" onBack={onBack} />
      <View style={styles.intro}>
        <Text style={[styles.lead, { color: semantic.textSecondary }]}>
          Vous avez eu le temps d'y goûter. Qu'en avez-vous pensé ?
        </Text>
      </View>
      <ProductRatingStep
        orderId={orderId}
        onComplete={() => {
          appAlert('Merci !', 'Votre avis a été enregistré.')
          onDone()
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  intro: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[2],
  },
  lead: {
    ...typography.bodyL,
  },
})
