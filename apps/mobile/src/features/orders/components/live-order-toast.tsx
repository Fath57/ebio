import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right'
import Package from 'lucide-react-native/dist/esm/icons/package'
import { useEffect, useRef, useState } from 'react'
import { AppState, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, fonts, radius, spacing } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { liveOrderLabel, useLiveOrder } from '../live-order-context'

/** Le temps de lire une ligne, pas celui de s'en agacer. */
const VISIBLE_MS = 5000

interface LiveOrderToastProps {
  onOpen: (orderId: string) => void
  /**
   * Vrai là où la notification ferait doublon ou du bruit : sur l'onglet
   * Commandes, qui le dit déjà, et sur les écrans sans barre d'onglets
   * (caisse, conversation, connexion, assistant).
   */
  hidden: boolean
}

/**
 * Où en est la commande, dit une fois puis rangé.
 *
 * Une barre permanente aurait occupé le bas de l'écran pendant toute une
 * livraison et se serait battue avec le panier flottant. Ceci se comporte
 * comme une notification : ça descend du haut à l'ouverture de l'app et à
 * chaque changement d'état, ça se lit en une ligne, et ça repart seul au bout
 * de cinq secondes. Ce qui reste ensuite, c'est le point sur l'onglet
 * Commandes — l'information est là sans rien réclamer.
 */
export function LiveOrderToast({ onOpen, hidden }: LiveOrderToastProps) {
  const { order } = useLiveOrder()
  const { semantic } = useTheme()
  const insets = useSafeAreaInsets()
  const [visible, setVisible] = useState(false)
  // Ce qui a déjà été annoncé : sans ça le sondage rejouerait la même phrase
  // toutes les quarante-cinq secondes.
  const announced = useRef<string | null>(null)

  const signature = order ? `${order.id}:${order.status}:${order.deliveryStatus}` : null

  // Revenir dans l'app, c'est le moment où la nouvelle a le plus de valeur :
  // on autorise une nouvelle annonce, même si l'état n'a pas changé.
  useEffect(() => {
    const watch = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        announced.current = null
      }
    })
    return () => {
      watch.remove()
    }
  }, [])

  useEffect(() => {
    if (!signature) {
      announced.current = null
      setVisible(false)
      return
    }
    if (announced.current === signature) {
      return
    }
    announced.current = signature
    setVisible(true)
    const timer = setTimeout(() => setVisible(false), VISIBLE_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [signature])

  if (!order || !visible || hidden) {
    return null
  }

  return (
    <Animated.View
      entering={FadeInDown.duration(240)}
      exiting={FadeOutUp.duration(200)}
      style={[styles.wrapper, { top: insets.top + spacing[2] }]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        style={[styles.card, { backgroundColor: semantic.bgCard }]}
        activeOpacity={0.9}
        onPress={() => {
          setVisible(false)
          onOpen(order.id)
        }}
        accessibilityRole="button"
        accessibilityLabel={`${liveOrderLabel(order)}. Appuyez pour suivre la commande ${order.orderNumber}`}
      >
        <View style={styles.icon}>
          <Package size={16} color={colors.neutral[0]} strokeWidth={2.4} />
        </View>
        <View style={styles.texts}>
          <Text style={[styles.label, { color: semantic.textPrimary }]} numberOfLines={1}>
            {liveOrderLabel(order)}
          </Text>
          <Text style={[styles.hint, { color: semantic.textSecondary }]} numberOfLines={1}>
            Appuyez pour suivre
          </Text>
        </View>
        <ChevronRight size={18} color={colors.neutral[400]} strokeWidth={2.4} />
      </TouchableOpacity>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: spacing[4],
    right: spacing[4],
    // Sous le bandeau réseau (999) : une coupure de connexion passe avant.
    zIndex: 900,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: 54,
    paddingHorizontal: spacing[3],
    borderRadius: radius.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 10,
  },
  icon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green[600],
  },
  texts: {
    flex: 1,
  },
  label: {
    fontFamily: fonts.sansSb,
    fontSize: 14,
  },
  hint: {
    fontFamily: fonts.sansMd,
    fontSize: 11,
  },
})
