import Locate from 'lucide-react-native/dist/esm/icons/locate'
import RefreshCw from 'lucide-react-native/dist/esm/icons/refresh-cw'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps'
import { colors, fonts, radius, shadows, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { useLocation } from '../../common/location-context'
import { useNearbySuppliers } from '../hooks/use-nearby-suppliers'
import { SupplierMarker } from './supplier-marker'
import { SupplierSheet } from './supplier-sheet'

interface MapScreenProps {
  onNavigateToSupplier?: (supplierId: string) => void
}

/** Niveau de zoom d'ouverture — environ un quart d'agglomération. */
const DEFAULT_DELTA = 0.08

/** Hauteur de la tab bar flottante à dégager en bas de carte. */
const TAB_BAR_CLEARANCE = 64
/**
 * Les vues de marqueur personnalisées doivent cesser de se redessiner une fois
 * posées, sinon Android repeint la carte en continu.
 */
const TRACK_CHANGES_MS = 600

export function MapScreen({ onNavigateToSupplier }: MapScreenProps) {
  const { semantic } = useTheme()
  const mapRef = useRef<MapView>(null)
  const { suppliers, loading, error, refresh } = useNearbySuppliers()
  // Position de référence de l'app : GPS ou choix manuel de l'utilisateur.
  const { latitude, longitude, loading: locationLoading } = useLocation()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tracksChanges, setTracksChanges] = useState(true)
  const hasAutoCentered = useRef(false)

  // `initialRegion` est figé au premier rendu : si la position se résout après,
  // la carte resterait sur le repli. On recadre une seule fois, sans reprendre
  // la main sur les déplacements manuels ensuite.
  useEffect(() => {
    if (locationLoading || hasAutoCentered.current)
      return
    hasAutoCentered.current = true
    mapRef.current?.animateToRegion({
      latitude,
      longitude,
      latitudeDelta: DEFAULT_DELTA,
      longitudeDelta: DEFAULT_DELTA,
    }, 600)
  }, [locationLoading, latitude, longitude])

  useEffect(() => {
    setTracksChanges(true)
    const timer = setTimeout(() => setTracksChanges(false), TRACK_CHANGES_MS)
    return () => clearTimeout(timer)
  }, [selectedId, suppliers.length])

  const handleRecenter = useCallback(() => {
    mapRef.current?.animateToRegion({
      latitude,
      longitude,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    }, 500)
  }, [latitude, longitude])

  const handleMarkerPress = useCallback((supplierId: string, latitude: number, longitude: number) => {
    setSelectedId(supplierId)
    // Décale le centrage vers le haut pour que le pin ne finisse pas sous la fiche.
    mapRef.current?.animateToRegion({
      latitude: latitude - 0.012,
      longitude,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    }, 350)
  }, [])

  const selected = suppliers.find(s => s.id === selectedId) ?? null

  const initialRegion = {
    latitude,
    longitude,
    latitudeDelta: DEFAULT_DELTA,
    longitudeDelta: DEFAULT_DELTA,
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        mapPadding={{ top: 0, right: 0, bottom: TAB_BAR_CLEARANCE, left: 0 }}
        onPress={() => setSelectedId(null)}
      >
        {suppliers.map(supplier => (
          <Marker
            key={supplier.id}
            coordinate={{
              latitude: supplier.latitude,
              longitude: supplier.longitude,
            }}
            anchor={{ x: 0.5, y: 1 }}
            zIndex={supplier.id === selectedId ? 2 : 1}
            tracksViewChanges={tracksChanges}
            onPress={() => handleMarkerPress(supplier.id, supplier.latitude, supplier.longitude)}
            accessibilityLabel={supplier.shopName}
          >
            <SupplierMarker
              isValidated={supplier.isValidated}
              isOpen={supplier.isOpen}
              isSelected={supplier.id === selectedId}
            />
          </Marker>
        ))}
      </MapView>

      {/* Compteur */}
      <View style={[styles.countBadge, { backgroundColor: semantic.bgCard }]}>
        <Text style={[styles.countText, { color: semantic.textPrimary }]}>
          {suppliers.length}
          {' '}
          fournisseur
          {suppliers.length > 1 ? 's' : ''}
        </Text>
      </View>

      {/* Contrôles carte */}
      <View style={styles.controls}>
        <Pressable
          style={[styles.controlButton, { backgroundColor: semantic.bgCard }]}
          onPress={handleRecenter}
          accessibilityRole="button"
          accessibilityLabel="Recentrer sur ma position"
        >
          <Locate size={20} color={semantic.textPrimary} strokeWidth={2.2} />
        </Pressable>
        <Pressable
          style={[styles.controlButton, { backgroundColor: semantic.bgCard }]}
          onPress={refresh}
          accessibilityRole="button"
          accessibilityLabel="Rafraîchir les fournisseurs"
        >
          <RefreshCw size={20} color={semantic.textPrimary} strokeWidth={2.2} />
        </Pressable>
      </View>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.green[400]} />
        </View>
      )}

      {error && !loading && (
        <View style={[styles.errorBanner, { bottom: TAB_BAR_CLEARANCE + spacing[4] }]}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={refresh} accessibilityRole="button" accessibilityLabel="Réessayer">
            <Text style={styles.errorRetry}>Réessayer</Text>
          </Pressable>
        </View>
      )}

      <SupplierSheet
        supplier={selected}
        onClose={() => setSelectedId(null)}
        onOpenSupplier={(id) => {
          setSelectedId(null)
          onNavigateToSupplier?.(id)
        }}
        bottomInset={TAB_BAR_CLEARANCE}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  countBadge: {
    position: 'absolute',
    top: spacing[4],
    left: spacing[4],
    borderRadius: radius.pill,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    ...shadows.md,
  },
  countText: {
    ...typography.caption,
    fontFamily: fonts.sansSb,
  },
  controls: {
    position: 'absolute',
    top: spacing[4],
    right: spacing[4],
    gap: spacing[2],
  },
  controlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.md,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorBanner: {
    position: 'absolute',
    left: spacing[4],
    right: spacing[4],
    backgroundColor: colors.coral[50],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.coral[200],
    padding: spacing[3],
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorText: {
    ...typography.bodyS,
    color: colors.coral[800],
    flex: 1,
  },
  errorRetry: {
    fontFamily: fonts.sansSb,
    fontSize: 13,
    color: colors.coral[600],
    marginLeft: spacing[2],
  },
})
