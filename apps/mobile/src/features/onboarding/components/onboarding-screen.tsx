import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native'
import { useRef, useState } from 'react'
import {
  Dimensions,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'

const { width } = Dimensions.get('window')

interface Slide {
  key: string
  image: number
  title: string
  body: string
}

/* eslint-disable ts/no-require-imports -- RN image assets */
const SLIDES: Slide[] = [
  {
    key: 'decouvrir',
    image: require('../../../../assets/onboarding/decouvrir.webp'),
    title: 'Des produits bio, près de chez vous',
    body: 'Légumes frais, huiles, jus, épices… trouvez des produits locaux et bio, proposés par des producteurs vérifiés autour de vous.',
  },
  {
    key: 'commander',
    image: require('../../../../assets/onboarding/commander.webp'),
    title: 'Commandez et payez en un geste',
    body: 'Mobile Money, portefeuille eBio ou espèces à la livraison — vous choisissez, sans frais cachés.',
  },
  {
    key: 'recevoir',
    image: require('../../../../assets/onboarding/recevoir.webp'),
    title: 'Livré chez vous, ou prêt à récupérer',
    body: 'Suivez votre commande en direct et confirmez la réception quand tout est bon.',
  },
]
/* eslint-enable ts/no-require-imports */

interface OnboardingScreenProps {
  onFinish: () => void
}

/** First-launch walkthrough: three swipeable slides, skippable at any time. */
export function OnboardingScreen({ onFinish }: OnboardingScreenProps) {
  const { semantic } = useTheme()
  const insets = useSafeAreaInsets()
  const listRef = useRef<FlatList<Slide>>(null)
  const [index, setIndex] = useState(0)

  const isLast = index === SLIDES.length - 1

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>): void {
    const next = Math.round(event.nativeEvent.contentOffset.x / width)
    if (next !== index)
      setIndex(next)
  }

  function handleNext(): void {
    if (isLast) {
      onFinish()
      return
    }
    listRef.current?.scrollToIndex({ index: index + 1, animated: true })
  }

  return (
    <View style={[styles.container, { backgroundColor: semantic.bgPage, paddingTop: insets.top }]}>
      {/* Skip — always available, top right */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onFinish} hitSlop={12} accessibilityRole="button" accessibilityLabel="Passer l'introduction">
          <Text style={[styles.skip, { color: semantic.textTertiary }]}>Passer</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={slide => slide.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        renderItem={({ item }) => (
          <View style={styles.slide}>
            <View style={styles.illustrationWrap}>
              <Image source={item.image} style={styles.illustration} resizeMode="cover" />
            </View>
            <Text style={[styles.title, { color: semantic.textPrimary }]}>{item.title}</Text>
            <Text style={[styles.body, { color: semantic.textSecondary }]}>{item.body}</Text>
          </View>
        )}
      />

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing[5]) }]}>
        <View style={styles.dots}>
          {SLIDES.map((slide, i) => (
            <View
              key={slide.key}
              style={[
                styles.dot,
                { backgroundColor: i === index ? colors.green[400] : semantic.borderNormal },
                i === index && styles.dotActive,
              ]}
            />
          ))}
        </View>
        <TouchableOpacity style={styles.nextButton} onPress={handleNext} activeOpacity={0.85}>
          <Text style={styles.nextText}>{isLast ? 'Commencer' : 'Suivant'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 998,
  },
  topBar: {
    alignItems: 'flex-end',
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[3],
  },
  skip: { ...typography.bodyL, fontFamily: fonts.sansSb },
  slide: {
    width,
    alignItems: 'center',
    paddingHorizontal: spacing[6],
  },
  illustrationWrap: {
    width: width * 0.78,
    // Portrait artwork (2:3): leave room for the copy on small screens.
    aspectRatio: 2 / 3,
    maxHeight: '62%',
    borderRadius: 28,
    overflow: 'hidden',
  },
  illustration: {
    width: '100%',
    height: '100%',
  },
  title: {
    ...typography.h1,
    fontFamily: fonts.display,
    fontSize: 26,
    lineHeight: 33,
    textAlign: 'center',
    marginTop: spacing[6],
  },
  body: {
    ...typography.bodyL,
    textAlign: 'center',
    marginTop: spacing[3],
    maxWidth: width * 0.84,
  },
  footer: {
    paddingHorizontal: spacing[6],
    gap: spacing[5],
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing[2],
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  dotActive: { width: 20 },
  nextButton: {
    backgroundColor: colors.green[400],
    borderRadius: radius.pill,
    paddingVertical: spacing[4],
    alignItems: 'center',
  },
  nextText: { ...typography.h3, color: colors.neutral[0] },
})
