import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'
import * as Location from 'expo-location'
import Trash2 from 'lucide-react-native/dist/esm/icons/trash-2'
import TriangleAlert from 'lucide-react-native/dist/esm/icons/triangle-alert'
import X from 'lucide-react-native/dist/esm/icons/x'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import MapView, { Circle, Marker, PROVIDER_GOOGLE } from 'react-native-maps'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { ConfirmModal } from '../../common/components/confirm-modal'

interface LatLng {
  latitude: number
  longitude: number
}

interface DeliveryZone {
  id: string
  name: string
  fee: number
  estimatedMinutes: number
}

interface DeliveryZoneEditorProps {
  onSave?: () => void
}

const DEFAULT_CENTER: LatLng = { latitude: 6.3703, longitude: 2.3912 }
const DEFAULT_REGION = { ...DEFAULT_CENTER, latitudeDelta: 0.06, longitudeDelta: 0.06 }
const RADIUS_OPTIONS = [1, 2, 3, 5, 10]

/** Approxime un cercle (centre + rayon en mètres) par un polygone pour l'API PostGIS. */
function circleToPolygon(center: LatLng, radiusMeters: number, segments = 24): LatLng[] {
  const earth = 6371000
  const latRad = (center.latitude * Math.PI) / 180
  const points: LatLng[] = []
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * 2 * Math.PI
    const dLat = (radiusMeters * Math.cos(angle)) / earth
    const dLng = (radiusMeters * Math.sin(angle)) / (earth * Math.cos(latRad))
    points.push({
      latitude: center.latitude + (dLat * 180) / Math.PI,
      longitude: center.longitude + (dLng * 180) / Math.PI,
    })
  }
  return points
}

export function DeliveryZoneEditor({ onSave }: DeliveryZoneEditorProps) {
  const { semantic } = useTheme()
  const tabBarHeight = useBottomTabBarHeight()
  const mapRef = useRef<MapView>(null)

  const [zones, setZones] = useState<DeliveryZone[]>([])
  const [name, setName] = useState('')
  const [fee, setFee] = useState('')
  const [minutes, setMinutes] = useState('')
  const [center, setCenter] = useState<LatLng>(DEFAULT_CENTER)
  const [radiusKm, setRadiusKm] = useState(2)
  const [isAdding, setIsAdding] = useState(false)
  const [modal, setModal] = useState<{ visible: boolean, title: string, message: string, type: 'error' | 'confirm', onConfirm?: () => void }>({ visible: false, title: '', message: '', type: 'error' })

  function showError(title: string, message: string): void {
    setModal({ visible: true, title, message, type: 'error' })
  }

  function showConfirm(title: string, message: string, onConfirm: () => void): void {
    setModal({ visible: true, title, message, type: 'confirm', onConfirm })
  }

  const fetchZones = useCallback(async (): Promise<void> => {
    try {
      const res = await apiFetch('/api/suppliers/me/settings')
      if (res.ok) {
        const settings = await res.json()
        const raw = (settings.deliveryZones ?? []) as Array<Record<string, unknown>>
        setZones(raw.map((z): DeliveryZone => ({
          id: z.id as string,
          name: (z.name as string) ?? `Zone ${(z.deliveryFee as number) ?? 0} FCFA`,
          fee: (z.deliveryFee as number) ?? 0,
          estimatedMinutes: (z.estimatedMinutes as number) ?? 0,
        })))
      }
    }
    catch {
      // garde la liste vide
    }
  }, [])

  useEffect(() => {
    void fetchZones()
    let cancelled = false
    async function locate(): Promise<void> {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status !== 'granted')
          return
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
        if (cancelled)
          return
        const c = { latitude: pos.coords.latitude, longitude: pos.coords.longitude }
        setCenter(c)
        mapRef.current?.animateToRegion({ ...c, latitudeDelta: 0.05, longitudeDelta: 0.05 }, 600)
      }
      catch {
        // garde le centre par défaut
      }
    }
    void locate()
    return () => {
      cancelled = true
    }
  }, [fetchZones])

  async function handleAddZone(): Promise<void> {
    if (!name.trim() || !fee.trim()) {
      showError('Champs requis', 'Veuillez remplir le nom et les frais de livraison.')
      return
    }
    setIsAdding(true)
    try {
      const feeValue = Number.parseFloat(fee)
      const minutesValue = minutes ? Number.parseInt(minutes, 10) : 30
      const body = {
        polygon: circleToPolygon(center, radiusKm * 1000),
        deliveryFee: feeValue,
        estimatedMinutes: minutesValue,
      }
      const res = await apiFetch('/api/suppliers/me/delivery-zones', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const raw = await res.json()
        setZones(prev => [...prev, {
          id: raw.id,
          name: name.trim(),
          fee: raw.deliveryFee ?? feeValue,
          estimatedMinutes: raw.estimatedMinutes ?? minutesValue,
        }])
        setName('')
        setFee('')
        setMinutes('')
        onSave?.()
      }
      else {
        showError('Erreur', 'Impossible de créer la zone.')
      }
    }
    catch {
      showError('Erreur', 'Impossible de créer la zone.')
    }
    finally {
      setIsAdding(false)
    }
  }

  function handleDeleteZone(zoneId: string, zoneName: string): void {
    showConfirm('Supprimer la zone', `Supprimer la zone "${zoneName}" ?`, async () => {
      try {
        const res = await apiFetch(`/api/suppliers/me/delivery-zones/${zoneId}`, { method: 'DELETE' })
        if (res.ok)
          setZones(prev => prev.filter(z => z.id !== zoneId))
      }
      catch {
        showError('Erreur', 'Impossible de supprimer la zone.')
      }
    })
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: semantic.bgPage }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.headerBar, { backgroundColor: semantic.bgCard, borderBottomColor: semantic.borderLight }]}>
        <Text style={[styles.headerTitle, { color: semantic.textPrimary }]}>Zones de livraison</Text>
      </View>

      {/* Carte (enfant stable -> ne se remonte pas à chaque frappe) */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFill}
          initialRegion={DEFAULT_REGION}
        >
          <Marker
            draggable
            coordinate={center}
            onDragEnd={e => setCenter(e.nativeEvent.coordinate)}
          />
          <Circle
            center={center}
            radius={radiusKm * 1000}
            fillColor="rgba(42, 157, 78, 0.18)"
            strokeColor={colors.green[400]}
            strokeWidth={2}
          />
        </MapView>
        <View style={[styles.mapHint, { backgroundColor: semantic.bgCard }]}>
          <Text style={[styles.mapHintText, { color: semantic.textSecondary }]}>
            Déplacez le repère au centre de la zone
          </Text>
        </View>
      </View>

      {/* Panneau formulaire */}
      <View style={[styles.panel, { backgroundColor: semantic.bgCard, paddingBottom: tabBarHeight + spacing[3] }]}>
        {zones.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {zones.map(z => (
              <View key={z.id} style={[styles.zoneChip, { backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }]}>
                <Text style={[styles.zoneChipText, { color: semantic.textPrimary }]} numberOfLines={1}>
                  {z.name}
                  {' · '}
                  {z.fee.toLocaleString('fr-FR')}
                  {' F'}
                </Text>
                <TouchableOpacity onPress={() => handleDeleteZone(z.id, z.name)} hitSlop={8}>
                  <X size={14} color={colors.coral[600]} />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        <Text style={[styles.label, { color: semantic.textSecondary }]}>
          Rayon :
          {' '}
          {radiusKm}
          {' '}
          km
        </Text>
        <View style={styles.radiusRow}>
          {RADIUS_OPTIONS.map((r) => {
            const isSel = radiusKm === r
            return (
              <TouchableOpacity
                key={r}
                style={[styles.radiusChip, { borderColor: semantic.borderNormal }, isSel && styles.radiusChipActive]}
                onPress={() => setRadiusKm(r)}
              >
                <Text style={[styles.radiusChipText, { color: semantic.textSecondary }, isSel && styles.radiusChipTextActive]}>
                  {r}
                  {' '}
                  km
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>

        <TextInput
          style={[styles.input, { borderColor: semantic.borderNormal, color: semantic.textPrimary, backgroundColor: semantic.bgSurface }]}
          placeholder="Nom de la zone (ex: Centre-ville)"
          placeholderTextColor={semantic.textTertiary}
          value={name}
          onChangeText={setName}
        />
        <View style={styles.inlineRow}>
          <TextInput
            style={[styles.input, styles.inlineInput, { borderColor: semantic.borderNormal, color: semantic.textPrimary, backgroundColor: semantic.bgSurface }]}
            placeholder="Frais (FCFA)"
            placeholderTextColor={semantic.textTertiary}
            keyboardType="numeric"
            value={fee}
            onChangeText={setFee}
          />
          <TextInput
            style={[styles.input, styles.inlineInput, { borderColor: semantic.borderNormal, color: semantic.textPrimary, backgroundColor: semantic.bgSurface }]}
            placeholder="Délai (min)"
            placeholderTextColor={semantic.textTertiary}
            keyboardType="numeric"
            value={minutes}
            onChangeText={setMinutes}
          />
        </View>

        <TouchableOpacity
          style={[styles.addButton, isAdding && styles.buttonDisabled]}
          onPress={handleAddZone}
          disabled={isAdding}
        >
          <Text style={styles.addButtonText}>{isAdding ? 'Ajout...' : 'Ajouter la zone'}</Text>
        </TouchableOpacity>
      </View>

      <ConfirmModal
        visible={modal.visible}
        icon={modal.type === 'confirm' ? Trash2 : TriangleAlert}
        iconColor={colors.coral[600]}
        iconBg={colors.coral[50]}
        title={modal.title}
        message={modal.message}
        confirmLabel={modal.type === 'confirm' ? 'Supprimer' : 'OK'}
        cancelLabel={modal.type === 'confirm' ? 'Annuler' : undefined}
        confirmStyle={modal.type === 'confirm' ? 'destructive' : 'primary'}
        onConfirm={() => {
          const onConfirm = modal.onConfirm
          setModal(prev => ({ ...prev, visible: false }))
          onConfirm?.()
        }}
        onCancel={() => setModal(prev => ({ ...prev, visible: false }))}
      />
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerBar: {
    paddingTop: spacing[4],
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    borderBottomWidth: 1,
  },
  headerTitle: { ...typography.h2 },
  mapContainer: { flex: 1 },
  mapHint: {
    position: 'absolute',
    top: spacing[2],
    alignSelf: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: radius.pill,
  },
  mapHintText: { ...typography.caption, fontFamily: fonts.sansSb },
  panel: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    gap: spacing[2],
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  chipsRow: { gap: spacing[2], paddingBottom: spacing[1] },
  zoneChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: radius.pill,
    borderWidth: 1,
    maxWidth: 200,
  },
  zoneChipText: { ...typography.caption, fontFamily: fonts.sansSb, flexShrink: 1 },
  label: { ...typography.caption },
  radiusRow: { flexDirection: 'row', gap: spacing[2] },
  radiusChip: {
    flex: 1,
    paddingVertical: spacing[2],
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  radiusChipActive: { backgroundColor: colors.green[400], borderColor: colors.green[400] },
  radiusChipText: { ...typography.caption, fontFamily: fonts.sansSb },
  radiusChipTextActive: { color: colors.neutral[0] },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    fontFamily: fonts.sans,
    fontSize: 15,
  },
  inlineRow: { flexDirection: 'row', gap: spacing[2] },
  inlineInput: { flex: 1 },
  addButton: {
    minHeight: 50,
    backgroundColor: colors.green[400],
    borderRadius: radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing[1],
  },
  addButtonText: { fontFamily: fonts.sansSb, fontSize: 16, color: colors.neutral[0] },
  buttonDisabled: { opacity: 0.5 },
})
