import Bike from 'lucide-react-native/dist/esm/icons/bike'
import ClipboardCheck from 'lucide-react-native/dist/esm/icons/clipboard-check'
import MapPin from 'lucide-react-native/dist/esm/icons/map-pin'
import Wallet from 'lucide-react-native/dist/esm/icons/wallet'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { colors, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { SwitchAccountRow } from '../../common/components/switch-account-row'

interface CourierOnboardingScreenProps {
  onStart: () => void
  accountLabel: string | null
  onSwitchAccount: () => void
}

const STEPS = [
  { icon: ClipboardCheck, title: 'Candidatez en 2 minutes', body: 'Renseignez votre identité, votre moyen de transport et votre zone.' },
  { icon: MapPin, title: 'Recevez des courses proches', body: 'Dès validation, les courses autour de vous vous sont proposées.' },
  { icon: Wallet, title: 'Livrez et gardez la trace', body: 'Chaque livraison est enregistrée avec sa preuve de remise.' },
]

/** First screen of the courier app for accounts without an application yet. */
export function CourierOnboardingScreen({ onStart, accountLabel, onSwitchAccount }: CourierOnboardingScreenProps) {
  const { semantic } = useTheme()
  return (
    <ScrollView style={{ backgroundColor: semantic.bgPage }} contentContainerStyle={styles.container}>
      <View style={[styles.hero, { backgroundColor: semantic.bgPrimaryLight }]}>
        <Bike size={48} color={colors.green[600]} strokeWidth={1.6} />
      </View>
      <Text style={[styles.title, { color: semantic.textPrimary }]}>Devenez livreur eBio</Text>
      <Text style={[styles.subtitle, { color: semantic.textSecondary }]}>
        Livrez les commandes des boutiques bio de votre ville, à votre rythme.
      </Text>

      {STEPS.map(step => (
        <View key={step.title} style={[styles.step, { backgroundColor: semantic.bgCard }]}>
          <View style={[styles.stepIcon, { backgroundColor: semantic.bgPrimaryLight }]}>
            <step.icon size={22} color={colors.green[600]} strokeWidth={2} />
          </View>
          <View style={styles.stepText}>
            <Text style={[styles.stepTitle, { color: semantic.textPrimary }]}>{step.title}</Text>
            <Text style={[styles.stepBody, { color: semantic.textSecondary }]}>{step.body}</Text>
          </View>
        </View>
      ))}

      <Pressable
        style={styles.cta}
        onPress={onStart}
        accessibilityRole="button"
        accessibilityLabel="Déposer ma candidature"
      >
        <Text style={styles.ctaText}>Déposer ma candidature</Text>
      </Pressable>
      <Text style={[styles.note, { color: semantic.textTertiary }]}>
        Votre candidature est examinée par l'équipe eBio avant activation.
      </Text>
      <SwitchAccountRow accountLabel={accountLabel} onSwitch={onSwitchAccount} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: spacing[5],
    paddingBottom: spacing[10],
  },
  hero: {
    alignSelf: 'center',
    width: 96,
    height: 96,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing[6],
    marginBottom: spacing[4],
  },
  title: {
    ...typography.h1,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.bodyL,
    textAlign: 'center',
    marginTop: spacing[2],
    marginBottom: spacing[6],
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    borderRadius: radius.lg,
    padding: spacing[4],
    marginBottom: spacing[3],
  },
  stepIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    flex: 1,
  },
  stepTitle: {
    ...typography.h3,
  },
  stepBody: {
    ...typography.bodyS,
    marginTop: 2,
  },
  cta: {
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.green[400],
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing[4],
  },
  ctaText: {
    ...typography.caption,
    fontSize: 13,
    color: colors.neutral[0],
  },
  note: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing[3],
  },
})
