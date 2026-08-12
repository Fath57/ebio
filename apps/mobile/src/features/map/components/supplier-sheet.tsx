import type { NearbySupplier } from '../hooks/use-nearby-suppliers'
import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right'
import Star from 'lucide-react-native/dist/esm/icons/star'
import X from 'lucide-react-native/dist/esm/icons/x'
import { useEffect, useRef } from 'react'
import { Animated, Image, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, fonts, radius, shadows, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'

interface SupplierSheetProps {
  /** Fournisseur sélectionné, ou `null` quand la fiche est fermée. */
  supplier: NearbySupplier | null
  onClose: () => void
  onOpenSupplier: (supplierId: string) => void
  /** Dégagement bas pour passer au-dessus de la tab bar flottante. */
  bottomInset: number
}

/** Course de l'animation d'entrée/sortie, en points. */
const TRAVEL = 320
/** Glissement vers le bas au-delà duquel on referme. */
const DISMISS_THRESHOLD = 80

function formatDistance(km: number): string {
  if (km < 1)
    return `${Math.round(km * 1000)} m`
  if (km >= 100)
    return `${Math.round(km)} km`
  return `${km.toFixed(1)} km`
}

/**
 * Fiche point de vente ancrée en bas de la carte. Non modale : la carte reste
 * manipulable pendant que la fiche est ouverte, comme dans les apps de cartes
 * grand public.
 */
export function SupplierSheet({ supplier, onClose, onOpenSupplier, bottomInset }: SupplierSheetProps) {
  const { semantic } = useTheme()
  const translateY = useRef(new Animated.Value(TRAVEL)).current
  const supplierId = supplier?.id

  useEffect(() => {
    if (!supplierId)
      return
    translateY.setValue(TRAVEL)
    Animated.spring(translateY, {
      toValue: 0,
      damping: 22,
      stiffness: 220,
      useNativeDriver: true,
    }).start()
  }, [supplierId, translateY])

  const dismiss = useRef(() => {})
  dismiss.current = () => {
    Animated.timing(translateY, {
      toValue: TRAVEL,
      duration: 180,
      useNativeDriver: true,
    }).start(() => onClose())
  }

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gesture) => gesture.dy > 5,
      onPanResponderMove: (_evt, gesture) => {
        translateY.setValue(Math.max(0, gesture.dy))
      },
      onPanResponderRelease: (_evt, gesture) => {
        if (gesture.dy > DISMISS_THRESHOLD) {
          dismiss.current()
          return
        }
        Animated.spring(translateY, {
          toValue: 0,
          damping: 22,
          stiffness: 220,
          useNativeDriver: true,
        }).start()
      },
    }),
  ).current

  if (!supplier)
    return null

  return (
    <Animated.View
      style={[
        styles.sheet,
        {
          backgroundColor: semantic.bgCard,
          paddingBottom: bottomInset + spacing[4],
          transform: [{ translateY }],
        },
      ]}
      accessibilityViewIsModal={false}
    >
      <View style={styles.grabZone} {...pan.panHandlers}>
        <View style={[styles.grabber, { backgroundColor: semantic.borderNormal }]} />
      </View>

      {supplier.coverPhoto
        ? (
            <Image
              source={{ uri: supplier.coverPhoto }}
              style={styles.cover}
              resizeMode="cover"
              accessibilityLabel={`Devanture de ${supplier.shopName}`}
            />
          )
        : (
            <View style={[styles.cover, styles.coverPlaceholder, { backgroundColor: semantic.bgPrimaryLight }]}>
              <Text style={styles.coverInitial}>
                {supplier.shopName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}

      <View style={styles.titleRow}>
        <Text style={[styles.name, { color: semantic.textPrimary }]} numberOfLines={1}>
          {supplier.shopName}
        </Text>
        <Pressable
          onPress={() => dismiss.current()}
          hitSlop={10}
          style={styles.closeButton}
          accessibilityRole="button"
          accessibilityLabel="Fermer la fiche"
        >
          <X size={18} color={semantic.textTertiary} strokeWidth={2.4} />
        </Pressable>
      </View>

      <View style={styles.metaRow}>
        <View style={[styles.statusPill, supplier.isOpen ? styles.statusOpen : styles.statusClosed]}>
          <Text style={[styles.statusText, supplier.isOpen ? styles.statusTextOpen : styles.statusTextClosed]}>
            {supplier.isOpen ? 'Ouvert' : 'Fermé'}
          </Text>
        </View>

        {supplier.rating !== null && (
          <View style={styles.ratingRow}>
            <Star size={13} color={colors.earth[400]} fill={colors.earth[400]} strokeWidth={0} />
            <Text style={[styles.ratingText, { color: semantic.textSecondary }]}>
              {supplier.rating.toFixed(1)}
            </Text>
          </View>
        )}

        <Text style={[styles.distance, { color: semantic.textTertiary }]}>
          {formatDistance(supplier.distance)}
        </Text>

        {supplier.isValidated && (
          <View style={styles.validatedPill}>
            <Text style={styles.validatedText}>Validé eBio</Text>
          </View>
        )}
      </View>

      {supplier.topProduct && (
        <Text style={[styles.product, { color: semantic.textSecondary }]} numberOfLines={1}>
          {supplier.topProduct}
        </Text>
      )}

      <Pressable
        style={styles.cta}
        onPress={() => onOpenSupplier(supplier.id)}
        accessibilityRole="button"
        accessibilityLabel={`Voir la boutique ${supplier.shopName}`}
      >
        <Text style={styles.ctaText}>
          {supplier.mode === 'ORDER' ? 'Voir la boutique' : 'Contacter la boutique'}
        </Text>
        <ChevronRight size={18} color={colors.neutral[0]} strokeWidth={2.4} />
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing[5],
    ...shadows.lg,
  },
  grabZone: {
    alignItems: 'center',
    paddingTop: spacing[2],
    paddingBottom: spacing[3],
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  cover: {
    width: '100%',
    aspectRatio: 3 / 1,
    borderRadius: radius.lg,
    marginBottom: spacing[3],
  },
  coverPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverInitial: {
    fontFamily: fonts.display,
    fontSize: 36,
    color: colors.green[200],
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  name: {
    flex: 1,
    fontFamily: fonts.sansBd,
    fontSize: 20,
  },
  closeButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing[2],
    marginTop: spacing[2],
  },
  statusPill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
  },
  statusOpen: {
    backgroundColor: colors.green[50],
  },
  statusClosed: {
    backgroundColor: colors.neutral[100],
  },
  statusText: {
    fontFamily: fonts.sansSb,
    fontSize: 11,
  },
  statusTextOpen: {
    color: colors.green[800],
  },
  statusTextClosed: {
    color: colors.neutral[600],
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  ratingText: {
    fontFamily: fonts.sansSb,
    fontSize: 13,
  },
  distance: {
    ...typography.caption,
  },
  validatedPill: {
    backgroundColor: colors.green[50],
    borderRadius: radius.pill,
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
  },
  validatedText: {
    fontFamily: fonts.sansSb,
    fontSize: 11,
    color: colors.green[800],
  },
  product: {
    ...typography.bodyS,
    marginTop: spacing[2],
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[1],
    marginTop: spacing[4],
    minHeight: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.green[400],
  },
  ctaText: {
    fontFamily: fonts.sansSb,
    fontSize: 15,
    color: colors.neutral[0],
  },
})
