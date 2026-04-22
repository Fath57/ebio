import type { LucideIcon } from 'lucide-react-native'
import Leaf from 'lucide-react-native/dist/esm/icons/leaf'
import MapPin from 'lucide-react-native/dist/esm/icons/map-pin'
import Rocket from 'lucide-react-native/dist/esm/icons/rocket'
import * as React from 'react'
import { useCallback, useRef, useState } from 'react'
import {
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { storage } from '../../../utils/offline-storage'

const ONBOARDING_KEY = 'ebio_onboarding_completed'
const { width: SCREEN_WIDTH } = Dimensions.get('window')

interface OnboardingSlide {
  id: string
  title: string
  description: string
  icon: LucideIcon
}

const SLIDES: OnboardingSlide[] = [
  {
    id: 'welcome',
    title: 'Trouvez des produits bio près de chez vous',
    description:
      'eBio connecte les acheteurs aux fournisseurs de produits biologiques locaux.',
    icon: Leaf,
  },
  {
    id: 'location',
    title: 'Activez votre position',
    description:
      'Pour trouver les fournisseurs les plus proches, autorisez l\u2019accès à votre localisation.',
    icon: MapPin,
  },
  {
    id: 'start',
    title: 'Commencez vos recherches',
    description:
      'Parcourez le catalogue, comparez les prix et contactez directement les fournisseurs.',
    icon: Rocket,
  },
]

interface OnboardingProps {
  onComplete: () => void
  onRequestLocationPermission?: () => Promise<void>
}

export function Onboarding({
  onComplete,
  onRequestLocationPermission,
}: OnboardingProps) {
  const { semantic } = useTheme()
  const [currentIndex, setCurrentIndex] = useState(0)
  const flatListRef = useRef<FlatList<OnboardingSlide>>(null)

  const handleComplete = useCallback(() => {
    storage.set(ONBOARDING_KEY, 'true')
    onComplete()
  }, [onComplete])

  const handleNext = useCallback(async () => {
    if (currentIndex === 1 && onRequestLocationPermission) {
      await onRequestLocationPermission()
    }

    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 })
      setCurrentIndex(currentIndex + 1)
    }
    else {
      handleComplete()
    }
  }, [currentIndex, handleComplete, onRequestLocationPermission])

  const handleSkip = useCallback(() => {
    handleComplete()
  }, [handleComplete])

  function renderSlide({ item }: { item: OnboardingSlide }) {
    return (
      <View style={styles.slide}>
        <item.icon size={72} color={colors.green[400]} />
        <Text style={[styles.slideTitle, { color: semantic.textPrimary }]}>{item.title}</Text>
        <Text style={[styles.slideDescription, { color: semantic.textSecondary }]}>{item.description}</Text>
      </View>
    )
  }

  function renderDots() {
    return (
      <View style={styles.dotsContainer}>
        {SLIDES.map((slide, index) => (
          <View
            key={slide.id}
            style={[styles.dot, { backgroundColor: semantic.borderNormal }, index === currentIndex && styles.dotActive]}
          />
        ))}
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: semantic.bgPage }]}>
      {/* Skip button */}
      <TouchableOpacity
        style={styles.skipButton}
        onPress={handleSkip}
        accessibilityLabel="Passer l\u2019introduction"
      >
        <Text style={[styles.skipText, { color: semantic.textSecondary }]}>Passer</Text>
      </TouchableOpacity>

      {/* Slides */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        keyExtractor={item => item.id}
        renderItem={renderSlide}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        contentContainerStyle={styles.slideList}
      />

      {/* Dots */}
      {renderDots()}

      {/* Next / Start button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.nextButton}
          onPress={handleNext}
          accessibilityLabel={
            currentIndex === SLIDES.length - 1
              ? 'Commencer'
              : currentIndex === 1
                ? 'Autoriser la localisation'
                : 'Suivant'
          }
        >
          <Text style={styles.nextText}>
            {currentIndex === SLIDES.length - 1
              ? 'Commencer'
              : currentIndex === 1
                ? 'Autoriser la localisation'
                : 'Suivant'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

/**
 * Check if onboarding has been completed.
 */
export function isOnboardingCompleted(): boolean {
  return storage.getString(ONBOARDING_KEY) === 'true'
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral[0],
  },
  skipButton: {
    position: 'absolute',
    top: spacing[4],
    right: spacing[4],
    zIndex: 10,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
  },
  skipText: {
    fontFamily: fonts.sansMd,
    fontSize: 15,
    color: colors.neutral[600],
  },
  slideList: {
    alignItems: 'center',
  },
  slide: {
    width: SCREEN_WIDTH,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing[8],
  },
  slideTitle: {
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 34,
    color: colors.neutral[800],
    textAlign: 'center',
    marginBottom: spacing[4],
  },
  slideDescription: {
    ...typography.bodyL,
    color: colors.neutral[600],
    textAlign: 'center',
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing[2],
    marginBottom: spacing[6],
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.neutral[200],
  },
  dotActive: {
    backgroundColor: colors.green[400],
    width: 24,
  },
  footer: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[10],
  },
  nextButton: {
    minHeight: 44,
    backgroundColor: colors.green[400],
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nextText: {
    fontFamily: fonts.sansSb,
    fontSize: 16,
    color: colors.neutral[0],
  },
})
