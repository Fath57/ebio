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
  /** Suivre ce que l'annonce désigne — une boutique, un produit, un lien. */
  onOpenTarget: (announcement: Announcement) => void
}

/**
 * L'annonce du jour, à l'ouverture.
 *
 * Elle interrompt : elle se met devant ce que l'acheteur venait faire. Deux
 * conséquences sur la façon de la présenter — elle arrive doucement plutôt
 * qu'en sautant à l'écran, et elle se ferme d'un geste évident. Une annonce
 * qui surgit brutalement se ferme par réflexe, sans être lue.
 *
 * Le mouvement dure un peu moins d'une demi-seconde : au-delà on attend, en
 * deçà on sursaute.
 *
 * Une annonce sans titre est une affiche : on ne montre qu'elle, sans cadre ni
 * bouton par-dessus. Lui ajouter un texte de service reviendrait à écrire sur
 * le visuel de quelqu'un.
 */
export function AnnouncementModal({ announcement, onDismiss, onOpenTarget }: AnnouncementModalProps) {
  const { semantic } = useTheme()
  const { width } = useWindowDimensions()
  const entrance = useRef(new Animated.Value(0)).current
  const visible = announcement !== null

  /**
   * Le format de l'affiche, mesuré avant de l'ouvrir.
   *
   * C'est ce qui permet de la montrer entière **et** de remplir la carte : la
   * carte prend son rapport, donc l'image la couvre exactement — ni bandes
   * blanches, ni recadrage. Imposer un format aurait fait l'un ou l'autre, et
   * couper le visuel de quelqu'un qui l'a payé n'est pas une option.
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
        // Mesure impossible : un format lisible vaut mieux que pas d'annonce.
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
      // Une décélération : la carte arrive vite puis se pose, au lieu de
      // glisser d'un bout à l'autre à vitesse constante.
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

  // Tant que le format n'est pas connu, on n'ouvre pas : la carte sauterait
  // d'une forme à l'autre sous les yeux.
  if (imageOnly && imageRatio === null) {
    return null
  }

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        {/* Toucher à côté ferme : c'est le geste qu'on fait devant ce qu'on
          * n'a pas demandé. */}
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
  /** Le rapport vient de l'image : elle remplit la carte sans être coupée. */
  imageAlone: {
    width: '100%',
  },
  image: {
    width: '100%',
    // Le format des bannières du catalogue : une annonce n'a pas à inventer
    // le sien, les boutiques préparent déjà des visuels à ce rapport.
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
