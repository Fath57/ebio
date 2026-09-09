import type { AccountBlock } from '../../../utils/account-block'
import ShieldAlert from 'lucide-react-native/dist/esm/icons/shield-alert'
import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { signOut } from '../../../lib/auth-client'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { setAccountBlock } from '../../../utils/account-block'
import { apiFetch } from '../../../utils/api-client'

interface AccountBlockedScreenProps {
  block: AccountBlock
}

function formatUntil(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * Full-screen stop shown over the app once the API refuses the account. The
 * person reads why, can check again (a suspension may have ended) or sign
 * out to use another account.
 */
export function AccountBlockedScreen({ block }: AccountBlockedScreenProps) {
  const { semantic } = useTheme()
  const insets = useSafeAreaInsets()
  const [busy, setBusy] = useState(false)

  const banned = block.code === 'ACCOUNT_BANNED'
  const title = banned ? 'Compte bloqué' : 'Compte suspendu'
  const body = banned
    ? 'L\'équipe eBio a bloqué votre compte. Vous ne pouvez plus utiliser les applications eBio.'
    : block.suspendedUntil
      ? `Votre compte est suspendu jusqu'au ${formatUntil(block.suspendedUntil)}.`
      : 'Votre compte est suspendu jusqu\'à nouvel ordre.'

  async function handleRetry(): Promise<void> {
    setBusy(true)
    try {
      // apiFetch re-records the block on another 403; a 200 means it lifted.
      const res = await apiFetch('/api/users/me')
      if (res.ok)
        setAccountBlock(null)
    }
    finally {
      setBusy(false)
    }
  }

  async function handleSignOut(): Promise<void> {
    setBusy(true)
    try {
      await signOut()
    }
    finally {
      setAccountBlock(null)
      setBusy(false)
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: semantic.bgPage, paddingTop: insets.top + spacing[8], paddingBottom: insets.bottom + spacing[6] }]}>
      <View style={styles.iconCircle}>
        <ShieldAlert size={36} color={colors.coral[400]} strokeWidth={2} />
      </View>
      <Text style={[styles.title, { color: semantic.textPrimary }]}>{title}</Text>
      <Text style={[styles.body, { color: semantic.textSecondary }]}>{body}</Text>
      {block.reason && (
        <View style={[styles.reasonBox, { backgroundColor: semantic.bgCard, borderColor: semantic.borderLight }]}>
          <Text style={[styles.reasonLabel, { color: semantic.textTertiary }]}>Motif</Text>
          <Text style={[styles.reasonText, { color: semantic.textPrimary }]}>{block.reason}</Text>
        </View>
      )}
      <Text style={[styles.contact, { color: semantic.textTertiary }]}>
        Une question ? Écrivez à contact@e-bio.org
      </Text>

      <View style={styles.actions}>
        {!banned && (
          <Pressable
            style={[styles.button, { backgroundColor: colors.green[600] }]}
            onPress={handleRetry}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Vérifier à nouveau"
          >
            {busy
              ? <ActivityIndicator color={colors.neutral[0]} />
              : <Text style={styles.buttonText}>Vérifier à nouveau</Text>}
          </Pressable>
        )}
        <Pressable
          style={[styles.button, styles.buttonSecondary, { borderColor: semantic.borderNormal }]}
          onPress={handleSignOut}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Se déconnecter"
        >
          <Text style={[styles.buttonText, { color: semantic.textPrimary }]}>Se déconnecter</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    paddingHorizontal: spacing[6],
    zIndex: 100,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.coral[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing[10],
    marginBottom: spacing[6],
  },
  title: {
    ...typography.h1,
    textAlign: 'center',
    marginBottom: spacing[3],
  },
  body: {
    ...typography.bodyL,
    textAlign: 'center',
  },
  reasonBox: {
    marginTop: spacing[5],
    alignSelf: 'stretch',
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing[4],
  },
  reasonLabel: {
    ...typography.overline,
    marginBottom: spacing[1],
  },
  reasonText: {
    ...typography.bodyL,
  },
  contact: {
    ...typography.bodyS,
    textAlign: 'center',
    marginTop: spacing[5],
  },
  actions: {
    marginTop: 'auto',
    alignSelf: 'stretch',
    gap: spacing[3],
  },
  button: {
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  buttonText: {
    fontFamily: fonts.sansBd,
    fontSize: 16,
    color: colors.neutral[0],
  },
})
