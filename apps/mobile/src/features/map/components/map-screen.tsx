import Locate from 'lucide-react-native/dist/esm/icons/locate'
import RefreshCw from 'lucide-react-native/dist/esm/icons/refresh-cw'
import Star from 'lucide-react-native/dist/esm/icons/star'
import * as React from 'react'
import { useCallback, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import MapView, { Callout, Marker, PROVIDER_GOOGLE } from 'react-native-maps'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { useNearbySuppliers } from '../hooks/use-nearby-suppliers'
import { SupplierMarker } from './supplier-marker'

const DAKAR_REGION = {
  latitude: 14.6928,
  longitude: -17.4467,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
}

export function MapScreen() {
  const { semantic } = useTheme()
  const mapRef = useRef<MapView>(null)
  const { suppliers, userLocation, loading, error, refresh } = useNearbySuppliers()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const handleRecenter = useCallback(() => {
    if (userLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        ...userLocation,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }, 500)
    }
  }, [userLocation])

  const handleMarkerPress = useCallback((supplierId: string) => {
    setSelectedId(supplierId)
  }, [])

  const initialRegion = userLocation
    ? { ...userLocation, latitudeDelta: 0.08, longitudeDelta: 0.08 }
    : DAKAR_REGION

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
        mapPadding={{ top: 0, right: 0, bottom: 100, left: 0 }}
      >
        {suppliers.map(supplier => (
          <Marker
            key={supplier.id}
            coordinate={{
              latitude: supplier.latitude,
              longitude: supplier.longitude,
            }}
            onPress={() => handleMarkerPress(supplier.id)}
          >
            <SupplierMarker
              shopName={supplier.shopName}
              isValidated={supplier.isValidated}
              isOpen={supplier.isOpen}
            />
            <Callout tooltip>
              <View style={[styles.callout, { backgroundColor: semantic.bgCard }]}>
                <Text style={[styles.calloutName, { color: semantic.textPrimary }]}>{supplier.shopName}</Text>
                {supplier.rating !== null && (
                  <View style={styles.calloutRating}>
                    <Star
                      size={12}
                      color={colors.earth[400]}
                      fill={colors.earth[400]}
                      strokeWidth={0}
                    />
                    <Text style={styles.calloutRatingText}>
                      {supplier.rating.toFixed(1)}
                    </Text>
                  </View>
                )}
                {supplier.topProduct && (
                  <Text style={[styles.calloutProduct, { color: semantic.textSecondary }]} numberOfLines={1}>
                    {supplier.topProduct}
                  </Text>
                )}
                <Text style={[styles.calloutDistance, { color: semantic.textTertiary }]}>
                  {supplier.distance.toFixed(1)}
                  {' '}
                  km
                </Text>
                <View style={[
                  styles.calloutBadge,
                  supplier.isOpen ? styles.calloutBadgeOpen : styles.calloutBadgeClosed,
                ]}>
                  <Text style={[
                    styles.calloutBadgeText,
                    supplier.isOpen ? styles.calloutBadgeTextOpen : styles.calloutBadgeTextClosed,
                  ]}>
                    {supplier.isOpen ? 'Ouvert' : 'Fermé'}
                  </Text>
                </View>
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>

      {/* Floating controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.controlButton, { backgroundColor: semantic.bgCard }]}
          onPress={handleRecenter}
          accessibilityLabel="Recentrer sur ma position"
        >
          <Locate size={20} color={semantic.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.controlButton, { backgroundColor: semantic.bgCard }]}
          onPress={refresh}
          accessibilityLabel="Rafraîchir les fournisseurs"
        >
          <RefreshCw size={20} color={semantic.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Supplier count */}
      <View style={[styles.countBadge, { backgroundColor: semantic.bgCard }]}>
        <Text style={[styles.countText, { color: semantic.textPrimary }]}>
          {suppliers.length}
          {' '}
          fournisseur
          {suppliers.length > 1 ? 's' : ''}
          {' '}
          à proximité
        </Text>
      </View>

      {/* Loading overlay */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.green[400]} />
        </View>
      )}

      {/* Error */}
      {error && !loading && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={refresh}>
            <Text style={styles.errorRetry}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      )}
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  countBadge: {
    position: 'absolute',
    bottom: spacing[4],
    left: spacing[4],
    right: spacing[4],
    borderRadius: radius.lg,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 6,
    alignItems: 'center',
  },
  countText: {
    ...typography.bodyS,
    fontFamily: fonts.sansSb,
  },
  callout: {
    borderRadius: radius.lg,
    padding: spacing[3],
    minWidth: 160,
    maxWidth: 220,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
    gap: spacing[1],
  },
  calloutName: {
    ...typography.h3,
  },
  calloutRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  calloutRatingText: {
    fontFamily: fonts.sansMd,
    fontSize: 12,
    color: colors.earth[600],
  },
  calloutProduct: {
    ...typography.caption,
  },
  calloutDistance: {
    ...typography.caption,
  },
  calloutBadge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    marginTop: spacing[1],
  },
  calloutBadgeOpen: {
    backgroundColor: colors.green[50],
  },
  calloutBadgeClosed: {
    backgroundColor: colors.neutral[100],
  },
  calloutBadgeText: {
    fontFamily: fonts.sansSb,
    fontSize: 10,
  },
  calloutBadgeTextOpen: {
    color: colors.green[800],
  },
  calloutBadgeTextClosed: {
    color: colors.neutral[600],
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorBanner: {
    position: 'absolute',
    bottom: spacing[12],
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
