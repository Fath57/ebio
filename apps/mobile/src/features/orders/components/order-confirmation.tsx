import Check from 'lucide-react-native/dist/esm/icons/check'
import * as React from 'react'
import { useEffect, useRef } from 'react'
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'

interface OrderConfirmationProps {
  orderNumber: string
  onTrackOrder: () => void
  onContinueShopping: () => void
}

export function OrderConfirmation({
  orderNumber,
  onTrackOrder,
  onContinueShopping,
}: OrderConfirmationProps) {
  const { semantic } = useTheme()
  const scaleAnim = useRef(new Animated.Value(0)).current
  const fadeAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start()
  }, [scaleAnim, fadeAnim])

  return (
    <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
      <View style={styles.content}>
        <Animated.View
          style={[
            styles.checkmarkContainer,
            { transform: [{ scale: scaleAnim }] },
          ]}
        >
          <Check size={48} color={colors.neutral[0]} strokeWidth={3} />
        </Animated.View>

        <Animated.View style={[styles.textContainer, { opacity: fadeAnim }]}>
          <Text style={[styles.title, { color: semantic.textPrimary }]}>Commande passée !</Text>
          <Text style={[styles.subtitle, { color: semantic.textTertiary }]}>
            Votre commande a été envoyée au fournisseur
          </Text>

          <View style={[styles.orderNumberContainer, { backgroundColor: semantic.bgSurface }]}>
            <Text style={[styles.orderNumberLabel, { color: semantic.textTertiary }]}>N° de commande</Text>
            <Text style={[styles.orderNumber, { color: semantic.textPrimary }]}>{orderNumber}</Text>
          </View>
        </Animated.View>

        <Animated.View style={[styles.actions, { opacity: fadeAnim }]}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={onTrackOrder}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Suivre ma commande"
          >
            <Text style={styles.primaryButtonText}>Suivre ma commande</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.ghostButton}
            onPress={onContinueShopping}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Continuer mes achats"
          >
            <Text style={styles.ghostButtonText}>Continuer mes achats</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.neutral[0],
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing[6],
    gap: spacing[8],
  },
  checkmarkContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.green[400],
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmark: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    alignItems: 'center',
    gap: spacing[2],
  },
  title: {
    ...typography.h1,
    color: colors.neutral[800],
    textAlign: 'center',
  },
  subtitle: {
    ...typography.bodyL,
    color: colors.neutral[400],
    textAlign: 'center',
  },
  orderNumberContainer: {
    alignItems: 'center',
    gap: spacing[1],
    marginTop: spacing[4],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[6],
    backgroundColor: colors.neutral[50],
    borderRadius: radius.md,
  },
  orderNumberLabel: {
    ...typography.caption,
    color: colors.neutral[400],
  },
  orderNumber: {
    fontFamily: fonts.mono,
    fontSize: 18,
    color: colors.neutral[800],
    letterSpacing: 1,
  },
  actions: {
    width: '100%',
    gap: spacing[3],
  },
  primaryButton: {
    minHeight: 44,
    backgroundColor: colors.green[400],
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: {
    fontFamily: fonts.sansSb,
    fontSize: 16,
    color: colors.neutral[0],
  },
  ghostButton: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ghostButtonText: {
    fontFamily: fonts.sansMd,
    fontSize: 16,
    color: colors.green[400],
  },
})
