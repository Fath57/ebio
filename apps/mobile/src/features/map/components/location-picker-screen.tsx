import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs'
import * as Location from 'expo-location'
import Locate from 'lucide-react-native/dist/esm/icons/locate'
import MapPin from 'lucide-react-native/dist/esm/icons/map-pin'
import Search from 'lucide-react-native/dist/esm/icons/search'
import X from 'lucide-react-native/dist/esm/icons/x'
import { use, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps'
import { colors, fonts, radius, shadows, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { KeyboardAwareView } from '../../common/components/keyboard-aware-view'
import { ScreenHeader } from '../../common/components/screen-header'
import { usePlaceSearch } from '../hooks/use-place-search'
import { reverseGeocode } from '../utils/reverse-geocode'

interface LocationPickerScreenProps {
  initialLatitude: number
  initialLongitude: number
  /** `label` is the reverse-geocoded address of the pin when one was found. */
  onConfirm: (coords: { latitude: number, longitude: number, label?: string | null }) => void
  onGoBack: () => void
  /**
   * `door` is for a delivery point: street-level zoom, search on places and
   * neighbourhoods, high-accuracy GPS. `area` (default) picks a town or a shop.
   */
  precision?: 'area' | 'door'
  /** Start from a fresh GPS fix instead of the given point (no point chosen yet). */
  locateOnOpen?: boolean
}

/** Map span per precision: ~2 km to find one's way, ~400 m to put a pin on a door. */
const SPAN = { area: 0.02, door: 0.004 }
/** Beyond this GPS uncertainty, the buyer is asked to move the pin to the door themself. */
const ROUGH_FIX_M = 50

export function LocationPickerScreen({ initialLatitude, initialLongitude, onConfirm, onGoBack, precision = 'area', locateOnOpen = false }: LocationPickerScreenProps) {
  const door = precision === 'door'
  const span = SPAN[precision]
  // The bottom tab bar overlays these stack screens: without this offset the
  // confirm button hides behind it. Context (not the hook) so the picker also
  // works outside any tab navigator.
  const tabBarHeight = use(BottomTabBarHeightContext) ?? 0
  const { semantic } = useTheme()
  const mapRef = useRef<MapView>(null)
  const [center, setCenter] = useState({ latitude: initialLatitude, longitude: initialLongitude })
  const [locating, setLocating] = useState(false)
  // Address under the pin, refreshed a moment after the map stops moving.
  const [centerLabel, setCenterLabel] = useState<string | null>(null)
  /** Uncertainty of the last GPS fix, in metres; cleared once the user moves the map by hand. */
  const [fixAccuracy, setFixAccuracy] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    setCenterLabel(null)
    const timer = setTimeout(async () => {
      const label = await reverseGeocode(center.latitude, center.longitude)
      if (!cancelled)
        setCenterLabel(label)
    }, 600)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [center.latitude, center.longitude])
  const { query, setQuery, suggestions, searching, resolve, accept, reset } = usePlaceSearch(door ? 'address' : 'city')

  // No point chosen yet: start where the buyer actually stands, not from the
  // town they browse — that one is often kilometres from the door.
  useEffect(() => {
    if (locateOnOpen)
      void handleUseMyLocation()
    // Once, on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSelectPlace(placeId: string, label: string) {
    Keyboard.dismiss()
    // Close the list before the network round-trip: the choice is already made,
    // and keeping it open while resolving feels sluggish.
    accept(label)
    const place = await resolve(placeId)
    if (!place) {
      return
    }
    const coords = { latitude: place.latitude, longitude: place.longitude }
    setCenter(coords)
    // A town needs room to find one's way; a place for a delivery is already close.
    const zoom = door ? span : 0.08
    mapRef.current?.animateToRegion({ ...coords, latitudeDelta: zoom, longitudeDelta: zoom }, 600)
    setFixAccuracy(null)
  }

  async function handleUseMyLocation() {
    setLocating(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status === 'granted') {
        // A fresh, precise fix: the balanced one is often a cell tower 100 m+ away,
        // which is how pins ended up a street off the door.
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
        const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude }
        setCenter(coords)
        setFixAccuracy(loc.coords.accuracy ?? null)
        mapRef.current?.animateToRegion({ ...coords, latitudeDelta: span, longitudeDelta: span }, 500)
      }
    }
    catch {
      // Ignorer — l'utilisateur peut placer le pin manuellement
    }
    finally {
      setLocating(false)
    }
  }

  return (
    <KeyboardAwareView style={[styles.container, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader title="Choisir ma position" onBack={onGoBack} />

      {/* Recherche de ville — évite de faire glisser la carte sur des centaines
          de kilomètres pour changer de région. */}
      <View style={[styles.searchBar, { backgroundColor: semantic.bgCard, borderBottomColor: semantic.borderLight }]}>
        <View style={[styles.searchField, { backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }]}>
          <Search size={16} color={semantic.textTertiary} strokeWidth={2.2} />
          <TextInput
            style={[styles.searchInput, { color: semantic.textPrimary }]}
            value={query}
            onChangeText={setQuery}
            placeholder={door ? 'Rechercher un quartier, un lieu…' : 'Rechercher une ville…'}
            placeholderTextColor={semantic.textTertiary}
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel={door ? 'Rechercher un quartier ou un lieu' : 'Rechercher une ville'}
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
          initialRegion={{ ...center, latitudeDelta: span, longitudeDelta: span }}
          onRegionChangeComplete={r => setCenter({ latitude: r.latitude, longitude: r.longitude })}
          onPanDrag={() => setFixAccuracy(null)}
          showsUserLocation
          showsMyLocationButton={false}
        />

        {/* Pin fixe au centre — la carte glisse dessous */}
        <View style={styles.pinOverlay} pointerEvents="none">
          <MapPin size={44} color={colors.green[600]} fill={colors.green[200]} strokeWidth={2.2} />
          <View style={styles.pinShadow} />
        </View>

        {/* Suggestions — superposées à la carte, elles disparaissent au choix */}
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

        {/* Fine-tuning hint — irrelevant, and in the way, while the city list
            is open. */}
        {suggestions.length === 0 && (
          <View style={[styles.hint, { backgroundColor: semantic.bgCard }]}>
            <Text style={[styles.hintText, { color: semantic.textSecondary }]}>
              {pickerHint(door, fixAccuracy)}
            </Text>
          </View>
        )}

        {/* Recentrage GPS */}
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

      <View style={[styles.footer, { backgroundColor: semantic.bgCard, borderTopColor: semantic.borderLight, paddingBottom: tabBarHeight + spacing[5] }]}>
        <Text style={[styles.centerLabel, { color: centerLabel ? semantic.textPrimary : semantic.textTertiary }]} numberOfLines={2}>
          {centerLabel ?? 'Recherche de l\'adresse…'}
        </Text>
        <TouchableOpacity
          style={styles.confirmButton}
          onPress={() => onConfirm({ ...center, label: centerLabel })}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Confirmer cette position"
        >
          <Text style={styles.confirmText}>Confirmer cette position</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAwareView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  mapWrap: {
    flex: 1,
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
  suggestions: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    maxHeight: 260,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    // Sits above the pin and the GPS button: on Android elevation decides the
    // stacking, not render order.
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
    // Remonte le pin pour que sa pointe soit pile au centre
    paddingBottom: 44,
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
    paddingBottom: spacing[5],
    borderTopWidth: 1,
  },
  centerLabel: {
    ...typography.bodyS,
    textAlign: 'center',
    marginBottom: spacing[3],
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

/** What the floating hint says, from the most useful to the most generic. */
function pickerHint(door: boolean, accuracy: number | null): string {
  if (door && accuracy !== null && accuracy > ROUGH_FIX_M)
    return `Position approximative (± ${Math.round(accuracy)} m) : glissez la carte pour placer le repère sur votre porte`
  if (door && accuracy !== null)
    return `Position GPS à ± ${Math.round(accuracy)} m — ajustez si besoin sur votre porte`
  if (door)
    return 'Placez le repère exactement sur votre porte'
  return 'Déplacez la carte pour ajuster le point'
}
