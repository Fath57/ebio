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
 * Donner son avis sur ce qu'on a reçu, une fois qu'on l'a consommé.
 *
 * Cet écran existe séparément de la notation de commande pour une raison de
 * fond : on notait le produit au moment de la livraison, avant d'avoir rien
 * goûté. L'invitation arrive maintenant quelques heures plus tard et mène
 * directement ici — la boutique et le livreur, eux, se jugent à l'arrivée.
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
