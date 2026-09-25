import type { Announcement } from '../hooks/use-announcement'
import X from 'lucide-react-native/dist/esm/icons/x'
import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { colors, fonts, radius, shadows, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'

interface AnnouncementModalProps {
  announcement: Announcement | null
  onDismiss: () => void
  /** Follow what the announcement points at — a shop, a product, a link. */
  onOpenTarget: (announcement: Announcement) => void
}

/**
 * The announcement of the day, on opening.
 *
 * It interrupts: it stands in front of what the buyer came to do. Two
 * consequences for how it is presented — it arrives gently rather than
 * snapping onto the screen, and it closes with an obvious gesture. Something
 * that bursts in gets dismissed by reflex, unread.
 *
 * The movement lasts a little under half a second: longer and you wait,
 * shorter and you flinch.
 *
 * An announcement without a title is a poster: only it is shown, with no frame
 * or button over it. Adding service copy would be writing on someone's
 * artwork.
 */
export function AnnouncementModal({ announcement, onDismiss, onOpenTarget }: AnnouncementModalProps) {
  const { semantic } = useTheme()
  const { width } = useWindowDimensions()
  const entrance = useRef(new Animated.Value(0)).current
  const visible = announcement !== null

  /**
   * The poster's aspect ratio, measured before opening it.
   *
   * This is what lets it be shown whole **and** fill the card: the card takes
   * its ratio, so the image covers it exactly — no white bands, no cropping.
   * Imposing a format would have caused one or the other, and cutting into the
   * artwork of someone who paid for it is not an option.
   */
  const [imageRatio, setImageRatio] = useState<number | null>(null)

  useEffect(() => {
    const uri = announcement?.imageUrl ?? null
    if (uri === null) {
      setImageRatio(null)
      return
    }

    let cancelled = false
    Image.getSize(
      uri,
      (imageWidth, imageHeight) => {
        if (!cancelled && imageHeight > 0) {
          setImageRatio(imageWidth / imageHeight)
        }
      },
      () => {
        // Measurement failed: a readable shape beats no announcement at all.
        if (!cancelled) {
          setImageRatio(4 / 5)
        }
      },
    )

    return () => {
      cancelled = true
    }
  }, [announcement?.imageUrl])

  useEffect(() => {
    if (!visible) {
      entrance.setValue(0)
      return
    }

    Animated.timing(entrance, {
      toValue: 1,
      duration: 420,
      // An ease-out: the card comes in fast then settles, instead of sliding
      // across at a constant speed.
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }, [entrance, visible])

  if (announcement === null) {
    return null
  }

  const cardWidth = Math.min(width - spacing[8], 420)
  const isTappable = announcement.targetType !== 'NONE'
  const hasText = (announcement.title ?? '').trim().length > 0
  const imageOnly = !hasText && announcement.imageUrl !== null

  // While the ratio is unknown we do not open: the card would jump from one
  // shape to another in front of the reader.
  if (imageOnly && imageRatio === null) {
    return null
  }

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        {/* Tapping outside closes: it is the gesture people make at
          * something they did not ask for. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityLabel="Fermer l'annonce" />

        <Animated.View
          style={[
            styles.card,
            { width: cardWidth, backgroundColor: semantic.bgSurface },
            shadows.lg,
            {
              opacity: entrance,
              transform: [
                { translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) },
                { scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
              ],
            },
          ]}
        >
          <Pressable
            style={styles.close}
            onPress={onDismiss}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Fermer"
          >
            <X size={18} color={semantic.textSecondary} strokeWidth={2.4} />
          </Pressable>

          {announcement.imageUrl !== null && (
            <Pressable
              onPress={() => (isTappable ? onOpenTarget(announcement) : onDismiss())}
              accessibilityRole={isTappable ? 'button' : 'image'}
              accessibilityLabel={announcement.shopName === null
                ? 'Annonce eBio'
                : `Annonce de ${announcement.shopName}`}
            >
              <Image
                source={{ uri: announcement.imageUrl }}
                style={imageOnly ? [styles.imageAlone, { aspectRatio: imageRatio ?? 4 / 5 }] : styles.image}
                resizeMode="cover"
                accessible={false}
              />
            </Pressable>
          )}

          {imageOnly
            ? null
            : (
                <View style={styles.body}>
                  {announcement.shopName !== null && (
                    <Text style={[styles.shop, { color: semantic.textTertiary }]} numberOfLines={1}>
                      {announcement.shopName}
                    </Text>
                  )}

                  <Text style={[styles.title, { color: semantic.textPrimary }]}>{announcement.title}</Text>

                  {announcement.subtitle !== null && (
                    <Text style={[styles.subtitle, { color: semantic.textSecondary }]}>{announcement.subtitle}</Text>
                  )}

                  <View style={styles.actions}>
                    {isTappable && (
                      <Pressable
                        style={styles.primary}
                        onPress={() => onOpenTarget(announcement)}
                        accessibilityRole="button"
                        accessibilityLabel="Voir"
                      >
                        <Text style={styles.primaryText}>Voir</Text>
                      </Pressable>
                    )}
                    <Pressable
                      style={styles.secondary}
                      onPress={onDismiss}
                      accessibilityRole="button"
                      accessibilityLabel={isTappable ? 'Plus tard' : 'Fermer'}
                    >
                      <Text style={[styles.secondaryText, { color: semantic.textSecondary }]}>
                        {isTappable ? 'Plus tard' : 'Fermer'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20, 20, 16, 0.55)',
    padding: spacing[4],
  },
  card: {
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  close: {
    position: 'absolute',
    top: spacing[3],
    right: spacing[3],
    zIndex: 2,
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
  },
  /** The ratio comes from the image: it fills the card without being cut. */
  imageAlone: {
    width: '100%',
  },
  image: {
    width: '100%',
    // The catalogue banners' shape: an announcement need not invent its own,
    // shops already prepare artwork at this ratio.
    aspectRatio: 16 / 9,
  },
  body: {
    padding: spacing[5],
    gap: spacing[2],
  },
  shop: {
    ...typography.overline,
  },
  title: {
    ...typography.h2,
  },
  subtitle: {
    ...typography.bodyL,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingTop: spacing[3],
  },
  primary: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.green[400],
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    fontFamily: fonts.sansSb,
    fontSize: 15,
    color: colors.neutral[0],
  },
  secondary: {
    height: 44,
    paddingHorizontal: spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    fontFamily: fonts.sansMd,
    fontSize: 14,
  },
})
