import type { ReactNode } from 'react'
import ChevronLeft from 'lucide-react-native/dist/esm/icons/chevron-left'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, fonts, radius, spacing } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'

/**
 * `surface` — barre pleine, posée dans le flux, pour les écrans de contenu.
 * `transparent` — barre flottante sans fond, superposée à un média plein cadre.
 */
type ScreenHeaderVariant = 'surface' | 'transparent'

interface ScreenHeaderProps {
  /** Titre affiché, toujours visible — repère « où suis-je ». */
  title?: string
  /** Sous-titre optionnel (ex. nombre d'articles, statut de présence). */
  subtitle?: string
  /** Si fourni, affiche le bouton retour. Absent = écran racine d'onglet. */
  onBack?: () => void
  /** Action optionnelle alignée à droite (ex. « Tout marquer lu », filtres). */
  rightSlot?: ReactNode
  /** Élément inséré entre le retour et le titre (avatar de conversation, logo). */
  leadingSlot?: ReactNode
  variant?: ScreenHeaderVariant
}

/**
 * En-tête d'écran unique de l'application. Garantit que le titre, le retour et
 * les actions sont toujours au même endroit, quelle que soit la page.
 */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  rightSlot,
  leadingSlot,
  variant = 'surface',
}: ScreenHeaderProps) {
  const { semantic } = useTheme()
  const insets = useSafeAreaInsets()
  const isTransparent = variant === 'transparent'

  // Sur média, l'écran est plein cadre : la barre absorbe elle-même l'encoche.
  const containerStyle = isTransparent
    ? [styles.header, styles.headerTransparent, { paddingTop: insets.top + spacing[2] }]
    : [styles.header, { backgroundColor: semantic.bgCard, borderBottomColor: semantic.borderLight }]

  const titleColor = isTransparent ? colors.neutral[0] : semantic.textPrimary
  const subtitleColor = isTransparent ? 'rgba(255,255,255,0.85)' : semantic.textTertiary

  return (
    <View style={containerStyle} pointerEvents="box-none">
      {onBack
        ? (
            <Pressable
              onPress={onBack}
              hitSlop={8}
              style={[styles.side, isTransparent && styles.sideFloating]}
              accessibilityRole="button"
              accessibilityLabel="Retour"
            >
              <ChevronLeft
                size={24}
                color={isTransparent ? colors.neutral[0] : semantic.textPrimary}
                strokeWidth={2}
              />
            </Pressable>
          )
        : leadingSlot ? null : <View style={styles.side} />}

      {leadingSlot}

      {/* Sans titre, on n'insère pas de bloc flexible : c'est le leadingSlot
          (puce de localisation de l'accueil) qui occupe l'espace disponible. */}
      {title || subtitle
        ? (
            <View style={styles.titleWrap} pointerEvents="none">
              {title
                ? (
                    <Text style={[styles.title, { color: titleColor }]} numberOfLines={1}>
                      {title}
                    </Text>
                  )
                : null}
              {subtitle
                ? (
                    <Text style={[styles.subtitle, { color: subtitleColor }]} numberOfLines={1}>
                      {subtitle}
                    </Text>
                  )
                : null}
            </View>
          )
        : leadingSlot ? null : <View style={styles.titleSpacer} />}

      <View style={[styles.side, styles.sideRight]}>
        {rightSlot}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
  },
  headerTransparent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    borderBottomWidth: 0,
    paddingBottom: spacing[2],
  },
  side: {
    minWidth: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  // Sur photo, le bouton a besoin de son propre fond pour rester lisible.
  sideFloating: {
    width: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sideRight: {
    alignItems: 'flex-end',
  },
  titleWrap: {
    flex: 1,
    marginHorizontal: spacing[2],
  },
  // Pousse le rightSlot à droite quand l'en-tête n'a pas de titre.
  titleSpacer: {
    flex: 1,
  },
  title: {
    fontFamily: fonts.sansBd,
    fontSize: 18,
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: 12,
    marginTop: 1,
  },
})
