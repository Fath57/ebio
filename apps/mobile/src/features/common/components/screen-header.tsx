import type { ReactNode } from 'react'
import ChevronLeft from 'lucide-react-native/dist/esm/icons/chevron-left'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { fonts, spacing } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'

interface ScreenHeaderProps {
  /** Titre affiché, toujours visible — repère « où suis-je ». */
  title: string
  /** Sous-titre optionnel (ex. nom de boutique, numéro de commande). */
  subtitle?: string
  /** Si fourni, affiche le bouton retour. Absent = écran racine d'onglet. */
  onBack?: () => void
  /** Action optionnelle alignée à droite (ex. « Tout marquer lu »). */
  rightSlot?: ReactNode
}

/**
 * En-tête d'écran standardisé : bouton retour + titre cohérents sur tous les
 * écrans empilés. Remplace les en-têtes custom dupliqués pour garantir le
 * repérage (titre toujours présent, retour toujours au même endroit).
 */
export function ScreenHeader({ title, subtitle, onBack, rightSlot }: ScreenHeaderProps) {
  const { semantic } = useTheme()
  return (
    <View style={[styles.header, { backgroundColor: semantic.bgCard, borderBottomColor: semantic.borderLight }]}>
      {onBack
        ? (
            <Pressable
              onPress={onBack}
              hitSlop={8}
              style={styles.side}
              accessibilityRole="button"
              accessibilityLabel="Retour"
            >
              <ChevronLeft size={24} color={semantic.textPrimary} strokeWidth={2} />
            </Pressable>
          )
        : <View style={styles.side} />}

      <View style={styles.titleWrap}>
        <Text style={[styles.title, { color: semantic.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle
          ? (
              <Text style={[styles.subtitle, { color: semantic.textTertiary }]} numberOfLines={1}>
                {subtitle}
              </Text>
            )
          : null}
      </View>

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
  side: {
    minWidth: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  sideRight: {
    alignItems: 'flex-end',
  },
  titleWrap: {
    flex: 1,
    marginHorizontal: spacing[2],
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
