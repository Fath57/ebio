import LogOut from 'lucide-react-native/dist/esm/icons/log-out'
import Mail from 'lucide-react-native/dist/esm/icons/mail'
import Store from 'lucide-react-native/dist/esm/icons/store'
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { colors, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'

const SUPPORT_EMAIL = 'support@e-bio.org'

interface SupplierGateScreenProps {
  /** null = no supplier profile at all; otherwise the validation status. */
  validationStatus: string | null
  onCreateShop: () => void
  onRefresh: () => void
  /** Name / e-mail of the signed-in account, shown so a wrong account is obvious. */
  accountLabel: string | null
  onSignOut: () => void
}

/**
 * Orientation screen of the supplier app for accounts that are not (yet)
 * validated suppliers: create a shop, or wait for validation.
 */
export function SupplierGateScreen({ validationStatus, onCreateShop, onRefresh, accountLabel, onSignOut }: SupplierGateScreenProps) {
  const { semantic } = useTheme()
  const hasApplication = validationStatus !== null

  const title = hasApplication
    ? validationStatus === 'REJECTED'
      ? 'Boutique refusée'
      : validationStatus === 'SUSPENDED'
        ? 'Boutique suspendue'
        : validationStatus === 'COMPLEMENT_REQUESTED'
          ? 'Documents complémentaires requis'
          : 'Boutique en cours de validation'
    : 'Bienvenue sur eBio Fournisseur'
  const body = hasApplication
    ? validationStatus === 'REJECTED'
      ? 'Votre demande de boutique n\'a pas été retenue. Contactez l\'équipe eBio pour en savoir plus.'
      : validationStatus === 'SUSPENDED'
        ? 'Votre boutique est suspendue. Contactez l\'équipe eBio pour en savoir plus.'
        : validationStatus === 'COMPLEMENT_REQUESTED'
          ? 'Des documents complémentaires sont requis pour valider votre boutique. Consultez votre boîte e-mail pour connaître les pièces demandées, ou contactez l\'équipe eBio.'
          : 'L\'équipe eBio examine votre boutique. Vous serez notifié dès sa validation.'
    : 'Cette application est destinée aux fournisseurs. Créez votre fiche boutique pour vendre vos produits bio — ou installez l\'application eBio pour commander.'

  const showContact = validationStatus === 'REJECTED'
    || validationStatus === 'SUSPENDED'
    || validationStatus === 'COMPLEMENT_REQUESTED'

  function handleContactSupport(): void {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {
      // No mail app configured — nothing actionable on our side.
    })
  }

  return (
    <ScrollView style={{ backgroundColor: semantic.bgPage }} contentContainerStyle={styles.container}>
      <View style={[styles.iconWrap, { backgroundColor: semantic.bgPrimaryLight }]}>
        <Store size={40} color={colors.green[600]} strokeWidth={1.8} />
      </View>
      <Text style={[styles.title, { color: semantic.textPrimary }]}>{title}</Text>
      <Text style={[styles.body, { color: semantic.textSecondary }]}>{body}</Text>

      {!hasApplication
        ? (
            <Pressable style={styles.primary} onPress={onCreateShop} accessibilityRole="button" accessibilityLabel="Créer ma fiche boutique">
              <Text style={styles.primaryText}>Créer ma fiche boutique</Text>
            </Pressable>
          )
        : null}

      {showContact
        ? (
            <Pressable
              style={styles.primary}
              onPress={handleContactSupport}
              accessibilityRole="button"
              accessibilityLabel="Contacter l'équipe eBio"
            >
              <Mail size={16} color={colors.neutral[0]} />
              <Text style={styles.primaryText}>Contacter l'équipe eBio</Text>
            </Pressable>
          )
        : null}

      <Pressable
        style={[styles.secondary, { borderColor: semantic.borderNormal }]}
        onPress={onRefresh}
        accessibilityRole="button"
        accessibilityLabel="Actualiser le statut"
      >
        <Text style={[styles.secondaryText, { color: semantic.textPrimary }]}>Actualiser</Text>
      </Pressable>

      {accountLabel
        ? (
            <Text style={[styles.account, { color: semantic.textTertiary }]}>
              Connecté en tant que
              {' '}
              {accountLabel}
            </Text>
          )
        : null}
      <Pressable
        style={styles.switchAccount}
        onPress={onSignOut}
        accessibilityRole="button"
        accessibilityLabel="Changer de compte"
      >
        <LogOut size={16} color={colors.coral[400]} strokeWidth={2} />
        <Text style={[styles.switchAccountText, { color: colors.coral[400] }]}>Changer de compte</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[6],
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[4],
  },
  title: {
    ...typography.h2,
    textAlign: 'center',
  },
  body: {
    ...typography.bodyL,
    textAlign: 'center',
    marginTop: spacing[2],
  },
  primary: {
    alignSelf: 'stretch',
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.green[400],
    flexDirection: 'row',
    gap: spacing[2],
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing[6],
  },
  primaryText: {
    ...typography.caption,
    fontSize: 13,
    color: colors.neutral[0],
  },
  secondary: {
    alignSelf: 'stretch',
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing[3],
  },
  secondaryText: {
    ...typography.caption,
    fontSize: 13,
  },
  account: {
    ...typography.bodyS,
    textAlign: 'center',
    marginTop: spacing[8],
  },
  switchAccount: {
    minHeight: 44,
    flexDirection: 'row',
    gap: spacing[2],
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing[1],
  },
  switchAccountText: {
    ...typography.caption,
    fontSize: 13,
  },
})
