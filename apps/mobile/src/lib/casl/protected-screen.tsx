import type { ReactNode } from 'react'
import type { Actions, Subjects } from './ability'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../theme/theme'
import { useAbility } from './ability-context'

interface ProtectedScreenProps {
  children: ReactNode
  action?: Actions
  subject?: Subjects
  roles?: string[]
  requireAuth?: boolean
}

export function ProtectedScreen({
  children,
  action,
  subject,
  roles,
  requireAuth = true,
}: ProtectedScreenProps): ReactNode {
  const { ability, user, loading, isAuthenticated } = useAbility()

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>Chargement...</Text>
      </View>
    )
  }

  if (requireAuth && !isAuthenticated) {
    return (
      <View style={styles.center}>
        <Text style={styles.lockIcon}>🔒</Text>
        <Text style={styles.title}>Connexion requise</Text>
        <Text style={styles.subtitle}>
          Connectez-vous pour acceder a cette fonctionnalite
        </Text>
        <TouchableOpacity style={styles.loginButton}>
          <Text style={styles.loginButtonText}>Se connecter</Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (roles && user && !roles.includes(user.role)) {
    return (
      <View style={styles.center}>
        <Text style={styles.lockIcon}>🔒</Text>
        <Text style={styles.title}>Acces refuse</Text>
        <Text style={styles.subtitle}>
          Vous n'avez pas les permissions necessaires
        </Text>
      </View>
    )
  }

  if (action && subject && !ability.can(action, subject)) {
    return (
      <View style={styles.center}>
        <Text style={styles.lockIcon}>🔒</Text>
        <Text style={styles.title}>Acces refuse</Text>
        <Text style={styles.subtitle}>
          Permission insuffisante pour cette action
        </Text>
      </View>
    )
  }

  return <>{children}</>
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing[6],
    backgroundColor: colors.neutral[0],
  },
  lockIcon: {
    fontSize: 48,
    marginBottom: spacing[4],
  },
  title: {
    fontFamily: fonts.sansSb,
    fontSize: typography.h2.fontSize,
    lineHeight: typography.h2.lineHeight,
    color: colors.neutral[800],
    marginBottom: spacing[2],
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: typography.bodyL.fontSize,
    lineHeight: typography.bodyL.lineHeight,
    color: colors.neutral[600],
    textAlign: 'center',
    marginBottom: spacing[6],
  },
  loadingText: {
    fontFamily: fonts.sans,
    fontSize: typography.bodyL.fontSize,
    color: colors.neutral[600],
  },
  loginButton: {
    backgroundColor: colors.green[400],
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[3],
    borderRadius: radius.lg,
  },
  loginButtonText: {
    fontFamily: fonts.sansSb,
    fontSize: typography.bodyL.fontSize,
    color: colors.neutral[0],
  },
})
