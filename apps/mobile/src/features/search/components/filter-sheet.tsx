import type { CategoryItem } from '../../../utils/category-icons'
import Star from 'lucide-react-native/dist/esm/icons/star'
import X from 'lucide-react-native/dist/esm/icons/x'
import * as React from 'react'
import { useCallback, useRef, useState } from 'react'
import { Animated, Dimensions, Image, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { FALLBACK_CATEGORIES } from '../../../utils/category-icons'

interface FilterValues {
  radius: number | undefined
  categories: string[]
  maxPrice: number | undefined
  inStockOnly: boolean
  minRating: number
  mode: 'ALL' | 'CONTACT' | 'ORDER'
  validatedOnly: boolean
}

interface FilterSheetProps {
  visible: boolean
  onClose: () => void
  onApply: (filters: FilterValues) => void
  initialValues?: Partial<FilterValues>
  categoryOptions?: CategoryItem[]
}

const DEFAULT_FILTERS: FilterValues = {
  radius: undefined,
  categories: [],
  maxPrice: undefined,
  inStockOnly: true,
  minRating: 0,
  mode: 'ALL',
  validatedOnly: false,
}

const MODE_OPTIONS = [
  { value: 'ALL' as const, label: 'Tous' },
  { value: 'CONTACT' as const, label: 'Mise en relation' },
  { value: 'ORDER' as const, label: 'Commande' },
]

const { height: SCREEN_HEIGHT } = Dimensions.get('window')
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.9
const DISMISS_THRESHOLD = 120

const THUMB_SIZE = 28

function DistanceSlider({
  value,
  min,
  max,
  onChange,
  semantic,
}: {
  value: number
  min: number
  max: number
  onChange: (val: number) => void
  semantic: Record<string, string>
}) {
  const trackWidth = useRef(0)
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        updateValue(evt.nativeEvent.locationX)
      },
      onPanResponderMove: (evt) => {
        updateValue(evt.nativeEvent.locationX)
      },
    }),
  ).current

  function updateValue(locationX: number) {
    if (trackWidth.current <= 0)
      return
    const ratio = Math.max(0, Math.min(1, locationX / trackWidth.current))
    const newVal = Math.round(min + ratio * (max - min))
    onChange(newVal)
  }

  const ratio = (value - min) / (max - min)

  return (
    <View style={sliderStyles.container}>
      <Text style={[sliderStyles.label, { color: semantic.textSecondary }]}>
        {min}
        {' '}
        km
      </Text>
      <View
        style={[sliderStyles.track, { backgroundColor: semantic.borderNormal }]}
        onLayout={(e) => { trackWidth.current = e.nativeEvent.layout.width }}
        {...pan.panHandlers}
      >
        <View style={[sliderStyles.fill, { width: `${ratio * 100}%` }]} />
        <View
          style={[
            sliderStyles.thumb,
            { left: `${ratio * 100}%`, marginLeft: -(THUMB_SIZE / 2) },
          ]}
        >
          <Text style={sliderStyles.thumbText}>{value}</Text>
        </View>
      </View>
      <Text style={[sliderStyles.label, { color: semantic.textSecondary }]}>
        {max}
        {' '}
        km
      </Text>
    </View>
  )
}

const sliderStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    height: 44,
  },
  label: {
    ...typography.caption,
    minWidth: 32,
    textAlign: 'center',
  },
  track: {
    flex: 1,
    height: 6,
    borderRadius: radius.pill,
    justifyContent: 'center',
    overflow: 'visible',
  },
  fill: {
    height: 6,
    backgroundColor: colors.green[400],
    borderRadius: radius.pill,
  },
  thumb: {
    position: 'absolute',
    top: -(THUMB_SIZE / 2) + 3,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: colors.green[400],
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  thumbText: {
    fontFamily: fonts.sansBd,
    fontSize: 10,
    color: colors.neutral[0],
  },
})

export function FilterSheet({
  visible,
  onClose,
  onApply,
  initialValues,
  categoryOptions = FALLBACK_CATEGORIES,
}: FilterSheetProps) {
  const { semantic } = useTheme()
  const insets = useSafeAreaInsets()
  const [filters, setFilters] = useState<FilterValues>({
    ...DEFAULT_FILTERS,
    ...initialValues,
  })

  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current
  const backdropOpacity = useRef(new Animated.Value(0)).current
  const [isRendered, setIsRendered] = useState(false)

  const open = useCallback(() => {
    setIsRendered(true)
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        tension: 65,
        friction: 11,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start()
  }, [translateY, backdropOpacity])

  const close = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: SHEET_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsRendered(false)
      onClose()
    })
  }, [translateY, backdropOpacity, onClose])

  React.useEffect(() => {
    if (visible) {
      open()
    }
    else if (isRendered) {
      close()
    }
  }, [visible, open, close, isRendered])

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 5,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy)
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > DISMISS_THRESHOLD || gestureState.vy > 0.5) {
          close()
        }
        else {
          Animated.spring(translateY, {
            toValue: 0,
            tension: 65,
            friction: 11,
            useNativeDriver: true,
          }).start()
        }
      },
    }),
  ).current

  function handleReset() {
    setFilters({ ...DEFAULT_FILTERS })
  }

  function handleApply() {
    onApply(filters)
    close()
  }

  function handleToggleCategory(slug: string) {
    setFilters((prev) => {
      const isSelected = prev.categories.includes(slug)
      return {
        ...prev,
        categories: isSelected
          ? prev.categories.filter(c => c !== slug)
          : [...prev.categories, slug],
      }
    })
  }

  function handleSetRating(rating: number) {
    setFilters(prev => ({
      ...prev,
      minRating: prev.minRating === rating ? 0 : rating,
    }))
  }

  return (
    <Modal
      visible={isRendered || visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={close}
    >
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          {
            height: SHEET_HEIGHT,
            paddingBottom: insets.bottom,
            transform: [{ translateY }],
            backgroundColor: semantic.bgCard,
          },
        ]}
      >
        {/* Handle bar */}
        <View style={styles.handleContainer} {...panResponder.panHandlers}>
          <View style={[styles.handle, { backgroundColor: semantic.borderNormal }]} />
        </View>

        {/* Header */}
        <View style={[styles.header, { borderBottomColor: semantic.borderNormal }]}>
          <Text style={[styles.title, { color: semantic.textPrimary }]}>Filtres</Text>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={close}
            accessibilityLabel="Fermer les filtres"
          >
            <X size={20} color={semantic.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollContent}
          contentContainerStyle={styles.scrollInner}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Distance */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: semantic.textPrimary }]}>
              Distance
              {filters.radius !== undefined ? ` : ${filters.radius} km` : ''}
            </Text>
            {filters.radius !== undefined
              ? (
                  <DistanceSlider
                    value={filters.radius}
                    min={1}
                    max={50}
                    onChange={val => setFilters(p => ({ ...p, radius: val }))}
                    semantic={semantic}
                  />
                )
              : (
                  <Text style={[styles.distanceHint, { color: semantic.textTertiary }]}>
                    Aucune limite. Appuyez sur une distance pour filtrer.
                  </Text>
                )}
            <View style={styles.distanceButtons}>
              {filters.radius !== undefined && (
                <TouchableOpacity
                  style={[
                    styles.distanceChip,
                    { borderColor: colors.coral[200], backgroundColor: colors.coral[50] },
                  ]}
                  onPress={() => setFilters(p => ({ ...p, radius: undefined }))}
                  accessibilityLabel="Désactiver le filtre distance"
                >
                  <Text style={[styles.distanceChipText, { color: colors.coral[600] }]}>
                    Tout
                  </Text>
                </TouchableOpacity>
              )}
              {[5, 10, 20, 50].map(km => (
                <TouchableOpacity
                  key={km}
                  style={[
                    styles.distanceChip,
                    { borderColor: semantic.borderNormal },
                    filters.radius === km && styles.distanceChipActive,
                  ]}
                  onPress={() => setFilters(p => ({ ...p, radius: km }))}
                  accessibilityLabel={`${km} kilomètres`}
                >
                  <Text
                    style={[
                      styles.distanceChipText,
                      { color: semantic.textSecondary },
                      filters.radius === km && styles.distanceChipTextActive,
                    ]}
                  >
                    {km}
                    {' '}
                    km
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Categories */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: semantic.textPrimary }]}>Catégories</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsRow}
            >
              {categoryOptions.map((cat) => {
                const isSelected = filters.categories.includes(cat.slug)
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.categoryChip,
                      { backgroundColor: semantic.bgCard, borderColor: semantic.borderNormal },
                      isSelected && styles.categoryChipActive,
                    ]}
                    onPress={() => handleToggleCategory(cat.slug)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isSelected }}
                    accessibilityLabel={cat.label}
                  >
                    {cat.imageUrl
                      ? <Image source={{ uri: cat.imageUrl }} style={{ width: 16, height: 16, borderRadius: 4 }} />
                      : <cat.fallbackIcon size={16} color={isSelected ? colors.green[800] : semantic.textSecondary} />}
                    <Text
                      style={[
                        styles.categoryLabel,
                        { color: semantic.textSecondary },
                        isSelected && styles.categoryLabelActive,
                      ]}
                    >
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          </View>

          {/* Max price */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: semantic.textPrimary }]}>Prix maximum (FCFA)</Text>
            <TextInput
              style={[styles.priceInput, { borderColor: semantic.borderNormal, color: semantic.textPrimary }]}
              keyboardType="numeric"
              placeholder="Ex : 5 000"
              placeholderTextColor={semantic.textTertiary}
              value={filters.maxPrice?.toString() ?? ''}
              onChangeText={(text) => {
                const num = Number.parseInt(text.replace(/\s/g, ''), 10)
                setFilters(p => ({
                  ...p,
                  maxPrice: Number.isNaN(num) ? undefined : num,
                }))
              }}
              accessibilityLabel="Prix maximum en FCFA"
            />
          </View>

          {/* In stock toggle */}
          <View style={styles.section}>
            <View style={styles.toggleRow}>
              <Text style={[styles.sectionTitle, { color: semantic.textPrimary }]}>En stock uniquement</Text>
              <Switch
                value={filters.inStockOnly}
                onValueChange={val =>
                  setFilters(p => ({ ...p, inStockOnly: val }))}
                trackColor={{
                  false: colors.neutral[200],
                  true: colors.green[200],
                }}
                thumbColor={
                  filters.inStockOnly
                    ? colors.green[400]
                    : colors.neutral[400]
                }
                accessibilityLabel="En stock uniquement"
              />
            </View>
          </View>

          {/* Min rating */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: semantic.textPrimary }]}>Note minimum</Text>
            <View style={styles.ratingRow}>
              {[1, 2, 3, 4, 5].map(star => (
                <TouchableOpacity
                  key={star}
                  style={styles.starButton}
                  onPress={() => handleSetRating(star)}
                  accessibilityLabel={`${star} etoile${star > 1 ? 's' : ''} minimum`}
                >
                  <Star
                    size={28}
                    color={star <= filters.minRating ? colors.earth[400] : semantic.borderNormal}
                    fill={star <= filters.minRating ? colors.earth[400] : 'none'}
                    strokeWidth={star <= filters.minRating ? 0 : 1.5}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Mode */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: semantic.textPrimary }]}>Mode de livraison</Text>
            <View style={styles.modeRow}>
              {MODE_OPTIONS.map((opt) => {
                const isActive = filters.mode === opt.value
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.modeChip, { borderColor: semantic.borderNormal }, isActive && styles.modeChipActive]}
                    onPress={() =>
                      setFilters(p => ({ ...p, mode: opt.value }))}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isActive }}
                    accessibilityLabel={opt.label}
                  >
                    <Text
                      style={[
                        styles.modeChipText,
                        { color: semantic.textSecondary },
                        isActive && styles.modeChipTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

          {/* Validated only toggle */}
          <View style={styles.section}>
            <View style={styles.toggleRow}>
              <Text style={[styles.sectionTitle, { color: semantic.textPrimary }]}>Valide eBio uniquement</Text>
              <Switch
                value={filters.validatedOnly}
                onValueChange={val =>
                  setFilters(p => ({ ...p, validatedOnly: val }))}
                trackColor={{
                  false: colors.neutral[200],
                  true: colors.green[200],
                }}
                thumbColor={
                  filters.validatedOnly
                    ? colors.green[400]
                    : colors.neutral[400]
                }
                accessibilityLabel="Valide eBio uniquement"
              />
            </View>
          </View>
        </ScrollView>

        {/* Sticky footer */}
        <View style={[styles.footer, { borderTopColor: semantic.borderNormal }]}>
          <TouchableOpacity
            style={[styles.resetButton, { borderColor: semantic.borderNormal }]}
            onPress={handleReset}
            accessibilityLabel="Reinitialiser les filtres"
          >
            <Text style={[styles.resetText, { color: semantic.textSecondary }]}>Reinitialiser</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.applyButton}
            onPress={handleApply}
            accessibilityLabel="Appliquer les filtres"
          >
            <Text style={styles.applyText}>Appliquer</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.neutral[0],
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 16,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: spacing[2],
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.neutral[200],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[200],
  },
  title: {
    ...typography.h2,
    color: colors.neutral[800],
  },
  closeButton: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    flex: 1,
  },
  scrollInner: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: spacing[6],
  },
  section: {
    marginBottom: spacing[5],
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.neutral[800],
    marginBottom: spacing[2],
  },
  distanceHint: {
    ...typography.bodyS,
    paddingVertical: spacing[2],
  },
  distanceButtons: {
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[2],
  },
  distanceChip: {
    minHeight: 44,
    paddingHorizontal: spacing[3],
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  distanceChipActive: {
    backgroundColor: colors.green[400],
    borderColor: colors.green[400],
  },
  distanceChipText: {
    fontFamily: fonts.sansMd,
    fontSize: 13,
    color: colors.neutral[600],
  },
  distanceChipTextActive: {
    color: colors.neutral[0],
  },
  chipsRow: {
    flexDirection: 'row',
    gap: spacing[2],
    paddingHorizontal: spacing[1],
  },
  categoryChip: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingHorizontal: spacing[3],
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    backgroundColor: colors.neutral[0],
  },
  categoryChipActive: {
    backgroundColor: colors.green[50],
    borderColor: colors.green[400],
  },
  categoryLabel: {
    fontFamily: fonts.sansMd,
    fontSize: 13,
    color: colors.neutral[600],
  },
  categoryLabelActive: {
    color: colors.green[800],
  },
  priceInput: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    fontFamily: fonts.mono,
    fontSize: 16,
    color: colors.neutral[800],
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ratingRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  starButton: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modeRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  modeChip: {
    minHeight: 44,
    paddingHorizontal: spacing[3],
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  modeChipActive: {
    backgroundColor: colors.green[400],
    borderColor: colors.green[400],
  },
  modeChipText: {
    fontFamily: fonts.sansMd,
    fontSize: 13,
    color: colors.neutral[600],
  },
  modeChipTextActive: {
    color: colors.neutral[0],
  },
  footer: {
    flexDirection: 'row',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    borderTopWidth: 1,
    borderTopColor: colors.neutral[200],
  },
  resetButton: {
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  resetText: {
    fontFamily: fonts.sansSb,
    fontSize: 15,
    color: colors.neutral[600],
  },
  applyButton: {
    flex: 1,
    minHeight: 48,
    backgroundColor: colors.green[400],
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.md,
  },
  applyText: {
    fontFamily: fonts.sansSb,
    fontSize: 15,
    color: colors.neutral[0],
  },
})
