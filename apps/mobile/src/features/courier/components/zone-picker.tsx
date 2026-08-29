import * as Location from 'expo-location'
import Locate from 'lucide-react-native/dist/esm/icons/locate'
import MapPin from 'lucide-react-native/dist/esm/icons/map-pin'
import Search from 'lucide-react-native/dist/esm/icons/search'
import X from 'lucide-react-native/dist/esm/icons/x'
import { useRef, useState } from 'react'
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import MapView, { Circle, PROVIDER_GOOGLE } from 'react-native-maps'
import { colors, fonts, radius, shadows, spacing } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { KeyboardAwareView } from '../../common/components/keyboard-aware-view'
import { usePlaceSearch } from '../../map/hooks/use-place-search'

export interface CourierZone {
  label: string
  latitude: number
  longitude: number
  radiusKm: number
}

interface ZonePickerModalProps {
  visible: boolean
  initial?: CourierZone | null
  onConfirm: (zone: CourierZone) => void
  onClose: () => void
}

// Cotonou — where most of the fleet starts
const DEFAULT_CENTER = { latitude: 6.3703, longitude: 2.3912 }
const DEFAULT_RADIUS_KM = 10
const MIN_RADIUS_KM = 2
const MAX_RADIUS_KM = 50
const THUMB_SIZE = 28

/** Region sized so the whole circle is visible with some margin. */
function regionForRadius(center: { latitude: number, longitude: number }, radiusKm: number) {
  const delta = (radiusKm * 2.6) / 111
  return { ...center, latitudeDelta: delta, longitudeDelta: delta }
}

function RadiusSlider({
  value,
  onChange,
  semantic,
}: {
  value: number
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
    if (trackWidth.current <= 0) {
      return
    }
    const ratio = Math.max(0, Math.min(1, locationX / trackWidth.current))
    const newVal = Math.round(MIN_RADIUS_KM + ratio * (MAX_RADIUS_KM - MIN_RADIUS_KM))
    onChange(newVal)
  }

  const ratio = (value - MIN_RADIUS_KM) / (MAX_RADIUS_KM - MIN_RADIUS_KM)

  return (
    <View style={sliderStyles.container}>
      <Text style={[sliderStyles.label, { color: semantic.textSecondary }]}>
        {MIN_RADIUS_KM}
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
        {MAX_RADIUS_KM}
        {' '}
        km
      </Text>
    </View>
  )
}

/**
 * Full-screen picker for the courier operating zone: city autocomplete
 * (Google Places via the API), map with the coverage circle, radius slider.
 */
export function ZonePickerModal({ visible, initial, onConfirm, onClose }: ZonePickerModalProps) {
  const { semantic } = useTheme()
  const mapRef = useRef<MapView>(null)
  const [center, setCenter] = useState(
    initial ? { latitude: initial.latitude, longitude: initial.longitude } : DEFAULT_CENTER,
  )
  const [radiusKm, setRadiusKm] = useState(initial?.radiusKm ?? DEFAULT_RADIUS_KM)
  const [label, setLabel] = useState(initial?.label ?? '')
  const [locating, setLocating] = useState(false)
  const { query, setQuery, suggestions, searching, resolve, accept, reset } = usePlaceSearch()

  async function handleSelectPlace(placeId: string, placeLabel: string) {
    Keyboard.dismiss()
    accept(placeLabel)
    const place = await resolve(placeId)
    if (!place) {
      return
    }
    const coords = { latitude: place.latitude, longitude: place.longitude }
    setCenter(coords)
    setLabel(placeLabel)
    mapRef.current?.animateToRegion(regionForRadius(coords, radiusKm), 600)
  }

  async function handleUseMyLocation() {
    setLocating(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude }
        setCenter(coords)
        if (!label) {
          setLabel('Ma position')
        }
        mapRef.current?.animateToRegion(regionForRadius(coords, radiusKm), 500)
      }
    }
    catch {
      // The user can still search a city or drag the map
    }
    finally {
      setLocating(false)
    }
  }

  function handleRadiusChange(value: number) {
    setRadiusKm(value)
  }

  function handleConfirm() {
    onConfirm({
      label: label.trim() || 'Zone personnalisée',
      latitude: center.latitude,
      longitude: center.longitude,
      radiusKm,
    })
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAwareView style={[styles.container, { backgroundColor: semantic.bgPage }]}>
        <View style={[styles.header, { backgroundColor: semantic.bgCard, borderBottomColor: semantic.borderLight }]}>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fermer">
            <X size={22} color={semantic.textPrimary} strokeWidth={2.2} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: semantic.textPrimary }]}>Ma zone de livraison</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={[styles.searchBar, { backgroundColor: semantic.bgCard, borderBottomColor: semantic.borderLight }]}>
          <View style={[styles.searchField, { backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }]}>
            <Search size={16} color={semantic.textTertiary} strokeWidth={2.2} />
            <TextInput
              style={[styles.searchInput, { color: semantic.textPrimary }]}
              value={query}
              onChangeText={setQuery}
              placeholder="Rechercher votre ville…"
              placeholderTextColor={semantic.textTertiary}
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Rechercher votre ville"
            />
            {searching
              ? <ActivityIndicator size="small" color={colors.green[400]} />
              : query.length > 0
                ? (
                    <Pressable onPress={reset} hitSlop={8} accessibilityLabel="Effacer la recherche">
                      <X size={16} color={semantic.textTertiary} strokeWidth={2.4} />
                    </Pressable>
                  )
                : null}
          </View>
        </View>

        <View style={styles.mapWrap}>
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
            initialRegion={regionForRadius(center, radiusKm)}
            onRegionChangeComplete={(r) => {
              setCenter({ latitude: r.latitude, longitude: r.longitude })
            }}
            showsUserLocation
            showsMyLocationButton={false}
          >
            <Circle
              center={center}
              radius={radiusKm * 1000}
              strokeColor={colors.green[400]}
              strokeWidth={2}
              fillColor="rgba(42, 157, 78, 0.15)"
            />
          </MapView>

          <View style={styles.pinOverlay} pointerEvents="none">
            <MapPin size={40} color={colors.green[600]} fill={colors.green[200]} strokeWidth={2.2} />
            <View style={styles.pinShadow} />
          </View>

          {suggestions.length > 0 && (
            <View style={[styles.suggestions, { backgroundColor: semantic.bgCard }]}>
              <ScrollView keyboardShouldPersistTaps="handled">
                {suggestions.map(suggestion => (
                  <Pressable
                    key={suggestion.placeId}
                    style={styles.suggestion}
                    onPress={() => handleSelectPlace(suggestion.placeId, suggestion.label)}
                    accessibilityRole="button"
                    accessibilityLabel={`${suggestion.label} ${suggestion.context}`}
                  >
                    <MapPin size={15} color={colors.green[400]} strokeWidth={2.2} />
                    <View style={styles.suggestionText}>
                      <Text style={[styles.suggestionLabel, { color: semantic.textPrimary }]} numberOfLines={1}>
                        {suggestion.label}
                      </Text>
                      {suggestion.context
                        ? (
                            <Text style={[styles.suggestionContext, { color: semantic.textTertiary }]} numberOfLines={1}>
                              {suggestion.context}
                            </Text>
                          )
                        : null}
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          {suggestions.length === 0 && (
            <View style={[styles.hint, { backgroundColor: semantic.bgCard }]}>
              <Text style={[styles.hintText, { color: semantic.textSecondary }]}>
                Vous recevrez les courses dans ce cercle
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.gpsButton, { backgroundColor: semantic.bgCard }]}
            onPress={handleUseMyLocation}
            accessibilityRole="button"
            accessibilityLabel="Utiliser ma position actuelle"
          >
            {locating
              ? <ActivityIndicator size="small" color={colors.green[400]} />
              : <Locate size={20} color={semantic.textPrimary} />}
          </TouchableOpacity>
        </View>

        <View style={[styles.footer, { backgroundColor: semantic.bgCard, borderTopColor: semantic.borderLight }]}>
          <Text style={[styles.radiusLabel, { color: semantic.textPrimary }]}>
            Rayon d'action —
            {' '}
            {radiusKm}
            {' '}
            km
          </Text>
          <RadiusSlider value={radiusKm} onChange={handleRadiusChange} semantic={semantic} />
          <TouchableOpacity
            style={styles.confirmButton}
            onPress={handleConfirm}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Valider ma zone"
          >
            <Text style={styles.confirmText}>Valider ma zone</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAwareView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingTop: spacing[12],
    paddingBottom: spacing[3],
    borderBottomWidth: 1,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.sansBd,
    fontSize: 17,
  },
  headerSpacer: {
    width: 22,
  },
  searchBar: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    minHeight: 44,
    paddingHorizontal: spacing[4],
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 15,
    minHeight: 44,
  },
  mapWrap: {
    flex: 1,
  },
  suggestions: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    maxHeight: 260,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    zIndex: 2,
    ...shadows.lg,
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    minHeight: 52,
  },
  suggestionText: {
    flex: 1,
  },
  suggestionLabel: {
    fontFamily: fonts.sansSb,
    fontSize: 15,
  },
  suggestionContext: {
    fontFamily: fonts.sans,
    fontSize: 12,
    marginTop: 1,
  },
  pinOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 40,
  },
  pinShadow: {
    width: 10,
    height: 4,
    borderRadius: 5,
    backgroundColor: 'rgba(0,0,0,0.2)',
    marginTop: -2,
  },
  hint: {
    position: 'absolute',
    top: spacing[3],
    alignSelf: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: radius.pill,
    ...shadows.sm,
  },
  hintText: {
    fontFamily: fonts.sansMd,
    fontSize: 13,
  },
  gpsButton: {
    position: 'absolute',
    bottom: spacing[4],
    right: spacing[4],
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.md,
  },
  footer: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[6],
    borderTopWidth: 1,
    gap: spacing[3],
  },
  radiusLabel: {
    fontFamily: fonts.sansSb,
    fontSize: 15,
  },
  confirmButton: {
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.green[400],
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmText: {
    fontFamily: fonts.sansBd,
    fontSize: 16,
    color: colors.neutral[0],
  },
})

const sliderStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  label: {
    fontFamily: fonts.sans,
    fontSize: 12,
    width: 40,
  },
  track: {
    flex: 1,
    height: 32,
    borderRadius: radius.pill,
    justifyContent: 'center',
  },
  fill: {
    position: 'absolute',
    left: 0,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.green[200],
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: colors.green[400],
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.sm,
  },
  thumbText: {
    fontFamily: fonts.sansBd,
    fontSize: 10,
    color: colors.neutral[0],
  },
})
