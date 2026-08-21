import * as Location from 'expo-location'
import Locate from 'lucide-react-native/dist/esm/icons/locate'
import MapPin from 'lucide-react-native/dist/esm/icons/map-pin'
import Search from 'lucide-react-native/dist/esm/icons/search'
import X from 'lucide-react-native/dist/esm/icons/x'
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs'
import { useContext, useRef, useState } from 'react'
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
import { colors, fonts, radius, shadows, spacing } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { ScreenHeader } from '../../common/components/screen-header'
import { usePlaceSearch } from '../hooks/use-place-search'

interface LocationPickerScreenProps {
  initialLatitude: number
  initialLongitude: number
  onConfirm: (coords: { latitude: number, longitude: number }) => void
  onGoBack: () => void
}

export function LocationPickerScreen({ initialLatitude, initialLongitude, onConfirm, onGoBack }: LocationPickerScreenProps) {
  // The bottom tab bar overlays these stack screens: without this offset the
  // confirm button hides behind it. Context (not the hook) so the picker also
  // works outside any tab navigator.
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0
  const { semantic } = useTheme()
  const mapRef = useRef<MapView>(null)
  const [center, setCenter] = useState({ latitude: initialLatitude, longitude: initialLongitude })
  const [locating, setLocating] = useState(false)
  const { query, setQuery, suggestions, searching, resolve, accept, reset } = usePlaceSearch()

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
    // Zoom « ville » : assez large pour se repérer, assez serré pour ajuster.
    mapRef.current?.animateToRegion({ ...coords, latitudeDelta: 0.08, longitudeDelta: 0.08 }, 600)
  }

  async function handleUseMyLocation() {
    setLocating(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude }
        setCenter(coords)
        mapRef.current?.animateToRegion({ ...coords, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 500)
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
    <View style={[styles.container, { backgroundColor: semantic.bgPage }]}>
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
            placeholder="Rechercher une ville…"
            placeholderTextColor={semantic.textTertiary}
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Rechercher une ville"
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
          initialRegion={{ ...center, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
          onRegionChangeComplete={r => setCenter({ latitude: r.latitude, longitude: r.longitude })}
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
              Déplacez la carte pour ajuster le point
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
        <TouchableOpacity
          style={styles.confirmButton}
          onPress={() => onConfirm(center)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Confirmer cette position"
        >
          <Text style={styles.confirmText}>Confirmer cette position</Text>
        </TouchableOpacity>
      </View>
    </View>
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
