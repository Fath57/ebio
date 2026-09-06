import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs'
import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right'
import ShoppingBag from 'lucide-react-native/dist/esm/icons/shopping-bag'
import { use, useEffect, useRef } from 'react'
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, fonts, radius, spacing } from '../../../theme/theme'
import { useCart } from '../cart-context'

/** Height of the bar itself, so scroll views can keep their last row visible. */
export const CART_CTA_BAR_HEIGHT = 56
/** Space a screen must add at the bottom of its content when the bar shows. */
export const CART_CTA_BAR_CLEARANCE = CART_CTA_BAR_HEIGHT + spacing[3] * 2

interface CartCtaBarProps {
  onPress: () => void
}

function formatPrice(value: number): string {
  return value.toLocaleString('fr-FR').replace(/,/g, ' ')
}

/**
 * Barre flottante posée au-dessus des onglets dès que le panier contient un
 * article : c'est le seul appel à l'action visible depuis une boutique ou une
 * fiche produit, sinon l'utilisateur ne sait pas où retrouver ses articles.
 */
export function CartCtaBar({ onPress }: CartCtaBarProps) {
  const { getItemCount, getTotal } = useCart()
  const tabBarHeight = use(BottomTabBarHeightContext) ?? 0
  const count = getItemCount()
  const total = getTotal()
  const translateY = useRef(new Animated.Value(CART_CTA_BAR_CLEARANCE)).current

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: count > 0 ? 0 : CART_CTA_BAR_CLEARANCE,
      useNativeDriver: true,
      damping: 18,
      stiffness: 180,
    }).start()
  }, [count, translateY])

  if (count === 0)
    return null

  const itemsLabel = `${count} article${count > 1 ? 's' : ''}`

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrapper, { bottom: tabBarHeight + spacing[3], transform: [{ translateY }] }]}
    >
      <Pressable
        style={({ pressed }) => [styles.bar, { transform: [{ scale: pressed ? 0.985 : 1 }] }]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Voir le panier, ${itemsLabel}, total ${formatPrice(total)} FCFA`}
      >
        <View style={styles.iconCircle}>
          <ShoppingBag size={18} color={colors.neutral[0]} strokeWidth={2.4} />
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{count > 99 ? '99+' : count}</Text>
          </View>
        </View>
        <View style={styles.summary}>
          <Text style={styles.summaryLabel}>{itemsLabel}</Text>
          <Text style={styles.summaryTotal}>
            {formatPrice(total)}
            {' '}
            FCFA
          </Text>
        </View>
        <View style={styles.action}>
          <Text style={styles.actionText}>Voir le panier</Text>
          <ChevronRight size={18} color={colors.neutral[0]} strokeWidth={2.5} />
        </View>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: spacing[4],
    right: spacing[4],
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    height: CART_CTA_BAR_HEIGHT,
    paddingLeft: spacing[2],
    paddingRight: spacing[4],
    borderRadius: radius.pill,
    backgroundColor: colors.green[600],
    shadowColor: colors.green[900],
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 8,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.coral[400],
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    color: colors.neutral[0],
    fontFamily: fonts.sansBd,
    fontSize: 10,
    lineHeight: 12,
  },
  summary: {
    flex: 1,
  },
  summaryLabel: {
    fontFamily: fonts.sansMd,
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
  summaryTotal: {
    fontFamily: fonts.sansBd,
    fontSize: 15,
    color: colors.neutral[0],
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  actionText: {
    fontFamily: fonts.sansBd,
    fontSize: 14,
    color: colors.neutral[0],
  },
})
