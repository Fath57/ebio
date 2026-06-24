import * as Location from 'expo-location'
import Locate from 'lucide-react-native/dist/esm/icons/locate'
import MapPin from 'lucide-react-native/dist/esm/icons/map-pin'
import { useRef, useState } from 'react'
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps'
import { colors, fonts, radius, shadows, spacing } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { ScreenHeader } from '../../common/components/screen-header'

interface LocationPickerScreenProps {
  initialLatitude: number
  initialLongitude: number
  onConfirm: (coords: { latitude: number, longitude: number }) => void
  onGoBack: () => void
}

export function LocationPickerScreen({ initialLatitude, initialLongitude, onConfirm, onGoBack }: LocationPickerScreenProps) {
  const { semantic } = useTheme()
  const mapRef = useRef<MapView>(null)
  const [center, setCenter] = useState({ latitude: initialLatitude, longitude: initialLongitude })
  const [locating, setLocating] = useState(false)

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

        {/* Hint */}
        <View style={[styles.hint, { backgroundColor: semantic.bgCard }]}>
          <Text style={[styles.hintText, { color: semantic.textSecondary }]}>
            Déplacez la carte pour ajuster le point
          </Text>
        </View>

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

      <View style={[styles.footer, { backgroundColor: semantic.bgCard, borderTopColor: semantic.borderLight }]}>
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
