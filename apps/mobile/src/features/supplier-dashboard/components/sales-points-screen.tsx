import type { ApiWeekHours } from './week-schedule-editor'
import * as Location from 'expo-location'
import Check from 'lucide-react-native/dist/esm/icons/check'
import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right'
import Locate from 'lucide-react-native/dist/esm/icons/locate'
import MapIcon from 'lucide-react-native/dist/esm/icons/map'
import MapPin from 'lucide-react-native/dist/esm/icons/map-pin'
import Plus from 'lucide-react-native/dist/esm/icons/plus'
import Trash2 from 'lucide-react-native/dist/esm/icons/trash-2'
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs'
import { useCallback, useContext, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { appAlert } from '../../common/components/app-alert'
import { ConfirmModal } from '../../common/components/confirm-modal'
import { ScreenHeader } from '../../common/components/screen-header'
import { LocationPickerScreen } from '../../map/components/location-picker-screen'
import { WeekScheduleEditor } from './week-schedule-editor'

/** Cotonou, quand ni le point ni le téléphone n'ont encore de position. */
const FALLBACK_CENTER = { latitude: 6.3703, longitude: 2.3912 }

interface SalesPoint {
  id: string
  name: string
  address: string | null
  phone: string | null
  latitude: number | null
  longitude: number | null
  openingHours: ApiWeekHours | null
  isActive: boolean
}

interface SalesPointsScreenProps {
  onGoBack: () => void
}

/**
 * Gestion des points de vente du fournisseur : sa boutique reste sa position
 * principale, chaque étal de marché ou kiosque devient un lieu de plus,
 * visible sur la carte des acheteurs à sa vraie position.
 */
export function SalesPointsScreen({ onGoBack }: SalesPointsScreenProps) {
  // The tab bar overlays the bottom of these screens.
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0
  const { semantic } = useTheme()
  const [points, setPoints] = useState<SalesPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<SalesPoint | 'new' | null>(null)
  const [deleting, setDeleting] = useState<SalesPoint | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/suppliers/me/sales-points')
      if (res.ok) {
        const data = await res.json() as { items: SalesPoint[] }
        setPoints(data.items)
      }
    }
    catch {
      // La liste vide affiche l'état d'accueil ; un toast serait du bruit.
    }
    finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleDelete(): Promise<void> {
    if (!deleting) {
      return
    }
    try {
      const res = await apiFetch(`/api/suppliers/me/sales-points/${deleting.id}`, { method: 'DELETE' })
      if (!res.ok) {
        appAlert('Erreur', 'Impossible de supprimer ce point de vente.')
        return
      }
      setPoints(current => current.filter(point => point.id !== deleting.id))
    }
    catch {
      appAlert('Erreur', 'Vérifiez votre connexion.')
    }
    finally {
      setDeleting(null)
    }
  }

  async function handleToggle(point: SalesPoint, isActive: boolean): Promise<void> {
    // Optimiste : le switch répond au doigt, l'API confirme derrière.
    setPoints(current => current.map(p => (p.id === point.id ? { ...p, isActive } : p)))
    try {
      const res = await apiFetch(`/api/suppliers/me/sales-points/${point.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      })
      if (!res.ok) {
        throw new Error('failed')
      }
    }
    catch {
      setPoints(current => current.map(p => (p.id === point.id ? { ...p, isActive: !isActive } : p)))
      appAlert('Erreur', 'Le changement n\'a pas pu être enregistré.')
    }
  }

  if (editing) {
    return (
      <SalesPointForm
        point={editing === 'new' ? null : editing}
        onDone={(saved) => {
          setEditing(null)
          if (saved) {
            load()
          }
        }}
      />
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader title="Points de vente" onBack={onGoBack} />
      {loading
        ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.green[400]} />
            </View>
          )
        : (
            <ScrollView contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + spacing[10] }]}>
              <Text style={[styles.intro, { color: semantic.textTertiary }]}>
                Votre boutique reste votre adresse principale. Ajoutez ici vos autres
                lieux de vente : étal de marché, kiosque, dépôt… Chacun apparaît sur
                la carte des acheteurs.
              </Text>

              {points.map(point => (
                <View
                  key={point.id}
                  style={[styles.pointCard, { backgroundColor: semantic.bgCard, borderColor: semantic.borderNormal }]}
                >
                  <TouchableOpacity
                    style={styles.pointMain}
                    onPress={() => setEditing(point)}
                    activeOpacity={0.6}
                    accessibilityRole="button"
                    accessibilityLabel={`Modifier ${point.name}`}
                  >
                    <View style={styles.pointText}>
                      <Text style={[styles.pointName, { color: semantic.textPrimary }]} numberOfLines={1}>
                        {point.name}
                      </Text>
                      {point.address
                        ? (
                            <Text style={[styles.pointAddress, { color: semantic.textTertiary }]} numberOfLines={1}>
                              {point.address}
                            </Text>
                          )
                        : null}
                      <View style={styles.pointBadges}>
                        <View style={[styles.badge, { backgroundColor: point.latitude !== null ? colors.green[50] : colors.neutral[100] }]}>
                          <MapPin size={11} color={point.latitude !== null ? colors.green[600] : colors.neutral[400]} />
                          <Text style={[styles.badgeText, { color: point.latitude !== null ? colors.green[800] : semantic.textTertiary }]}>
                            {point.latitude !== null ? 'Position définie' : 'Sans position'}
                          </Text>
                        </View>
                        {point.openingHours
                          ? (
                              <View style={[styles.badge, { backgroundColor: colors.blue[50] }]}>
                                <Text style={[styles.badgeText, { color: colors.blue[800] }]}>Horaires propres</Text>
                              </View>
                            )
                          : null}
                      </View>
                    </View>
                    <ChevronRight size={18} color={semantic.textTertiary} />
                  </TouchableOpacity>
                  <View style={[styles.pointActions, { borderTopColor: semantic.borderLight }]}>
                    <View style={styles.pointToggle}>
                      <Text style={[styles.toggleLabel, { color: point.isActive ? colors.green[600] : semantic.textTertiary }]}>
                        {point.isActive ? 'Visible sur la carte' : 'En pause'}
                      </Text>
                      <Switch
                        value={point.isActive}
                        onValueChange={value => handleToggle(point, value)}
                        trackColor={{ false: colors.neutral[200], true: colors.green[200] }}
                        thumbColor={point.isActive ? colors.green[600] : colors.neutral[400]}
                      />
                    </View>
                    <TouchableOpacity
                      onPress={() => setDeleting(point)}
                      accessibilityRole="button"
                      accessibilityLabel={`Supprimer ${point.name}`}
                      style={styles.deleteButton}
                    >
                      <Trash2 size={17} color={colors.coral[600]} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              {points.length === 0 && (
                <View style={[styles.emptyState, { borderColor: semantic.borderNormal }]}>
                  <MapPin size={28} color={semantic.textTertiary} />
                  <Text style={[styles.emptyText, { color: semantic.textTertiary }]}>
                    Aucun point de vente pour l'instant.
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={styles.addButton}
                onPress={() => setEditing('new')}
                activeOpacity={0.8}
                accessibilityRole="button"
              >
                <Plus size={18} color={colors.neutral[0]} />
                <Text style={styles.addButtonText}>Ajouter un point de vente</Text>
              </TouchableOpacity>
            </ScrollView>
          )}

      <ConfirmModal
        visible={!!deleting}
        title="Supprimer ce point de vente ?"
        message={deleting ? `« ${deleting.name} » disparaîtra de la carte et de votre fiche boutique.` : ''}
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        confirmStyle="destructive"
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </View>
  )
}

interface SalesPointFormProps {
  point: SalesPoint | null
  onDone: (saved: boolean) => void
}

function SalesPointForm({ point, onDone }: SalesPointFormProps) {
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0
  const { semantic } = useTheme()
  const [name, setName] = useState(point?.name ?? '')
  const [address, setAddress] = useState(point?.address ?? '')
  const [phone, setPhone] = useState(point?.phone ?? '')
  const [latitude, setLatitude] = useState<number | null>(point?.latitude ?? null)
  const [longitude, setLongitude] = useState<number | null>(point?.longitude ?? null)
  const [hasOwnHours, setHasOwnHours] = useState(!!point?.openingHours)
  const [hours, setHours] = useState<ApiWeekHours>(point?.openingHours ?? {})
  const [pickingOnMap, setPickingOnMap] = useState(false)
  const [locating, setLocating] = useState(false)
  const [saving, setSaving] = useState(false)

  const hasLocation = latitude !== null && longitude !== null

  async function handleDetectLocation(): Promise<void> {
    setLocating(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        appAlert('Permission requise', 'Autorisez la localisation pour positionner ce point de vente.')
        return
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
      setLatitude(position.coords.latitude)
      setLongitude(position.coords.longitude)
    }
    catch {
      appAlert('Erreur', 'Impossible de récupérer votre position.')
    }
    finally {
      setLocating(false)
    }
  }

  async function handleSave(): Promise<void> {
    if (name.trim().length < 2) {
      appAlert('Nom requis', 'Donnez un nom à ce point de vente, par exemple « Étal marché Dantokpa ».')
      return
    }
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
        // Sans horaires propres, le point suit ceux de la boutique.
        openingHours: hasOwnHours ? hours : point ? null : undefined,
      }
      if (hasLocation) {
        body.latitude = latitude
        body.longitude = longitude
      }

      const res = point
        ? await apiFetch(`/api/suppliers/me/sales-points/${point.id}`, { method: 'PATCH', body: JSON.stringify(body) })
        : await apiFetch('/api/suppliers/me/sales-points', { method: 'POST', body: JSON.stringify(body) })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { message?: string }).message ?? 'Enregistrement impossible')
      }
      onDone(true)
    }
    catch (error) {
      appAlert('Erreur', error instanceof Error ? error.message : 'Vérifiez votre connexion.')
    }
    finally {
      setSaving(false)
    }
  }

  if (pickingOnMap) {
    return (
      <LocationPickerScreen
        initialLatitude={latitude ?? FALLBACK_CENTER.latitude}
        initialLongitude={longitude ?? FALLBACK_CENTER.longitude}
        onConfirm={(coords) => {
          setLatitude(coords.latitude)
          setLongitude(coords.longitude)
          setPickingOnMap(false)
        }}
        onGoBack={() => setPickingOnMap(false)}
      />
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader
        title={point ? 'Modifier le point de vente' : 'Nouveau point de vente'}
        onBack={() => onDone(false)}
      />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + spacing[10] }]} keyboardShouldPersistTaps="handled">
        <Text style={[styles.label, { color: semantic.textSecondary }]}>Nom *</Text>
        <TextInput
          style={[styles.input, { backgroundColor: semantic.bgCard, borderColor: semantic.borderNormal, color: semantic.textPrimary }]}
          placeholder="Étal marché Dantokpa"
          placeholderTextColor={semantic.textTertiary}
          value={name}
          onChangeText={setName}
          maxLength={100}
        />

        <Text style={[styles.label, { color: semantic.textSecondary }]}>Adresse</Text>
        <TextInput
          style={[styles.input, { backgroundColor: semantic.bgCard, borderColor: semantic.borderNormal, color: semantic.textPrimary }]}
          placeholder="Marché Dantokpa, allée 4"
          placeholderTextColor={semantic.textTertiary}
          value={address}
          onChangeText={setAddress}
          maxLength={255}
        />

        <Text style={[styles.label, { color: semantic.textSecondary }]}>Téléphone du lieu</Text>
        <TextInput
          style={[styles.input, { backgroundColor: semantic.bgCard, borderColor: semantic.borderNormal, color: semantic.textPrimary }]}
          placeholder="+229 01 00 00 00 00"
          placeholderTextColor={semantic.textTertiary}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          maxLength={20}
        />

        <Text style={[styles.label, { color: semantic.textSecondary }]}>Position sur la carte</Text>
        <View style={[styles.locationStatus, { backgroundColor: semantic.bgSurface, borderColor: hasLocation ? colors.green[400] : semantic.borderNormal }]}>
          {hasLocation
            ? (
                <>
                  <Check size={18} color={colors.green[600]} />
                  <View>
                    <Text style={[styles.locationText, { color: colors.green[600] }]}>Position enregistrée</Text>
                    <Text style={[styles.locationCoords, { color: semantic.textTertiary }]}>
                      {`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`}
                    </Text>
                  </View>
                </>
              )
            : (
                <>
                  <MapPin size={18} color={semantic.textSecondary} />
                  <Text style={[styles.locationText, { color: semantic.textSecondary }]}>
                    Aucune position — le point n'apparaîtra pas sur la carte
                  </Text>
                </>
              )}
        </View>
        <View style={styles.locationActions}>
          <TouchableOpacity
            style={[styles.locationAction, { borderColor: semantic.borderNormal, backgroundColor: semantic.bgSurface }]}
            onPress={handleDetectLocation}
            disabled={locating}
            activeOpacity={0.7}
          >
            {locating
              ? <ActivityIndicator size="small" color={colors.green[400]} />
              : (
                  <>
                    <Locate size={16} color={semantic.textSecondary} />
                    <Text style={[styles.locationActionText, { color: semantic.textSecondary }]}>Ma position</Text>
                  </>
                )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.locationAction, { borderColor: semantic.borderNormal, backgroundColor: semantic.bgSurface }]}
            onPress={() => setPickingOnMap(true)}
            activeOpacity={0.7}
          >
            <MapIcon size={16} color={semantic.textSecondary} />
            <Text style={[styles.locationActionText, { color: semantic.textSecondary }]}>Sur la carte</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.hoursHeader}>
          <View style={styles.hoursHeaderText}>
            <Text style={[styles.label, { color: semantic.textSecondary }]}>Horaires propres</Text>
            <Text style={[styles.hoursHint, { color: semantic.textTertiary }]}>
              Un étal de marché n'ouvre que les jours de marché. Désactivé, le
              point suit les horaires de la boutique.
            </Text>
          </View>
          <Switch
            value={hasOwnHours}
            onValueChange={setHasOwnHours}
            trackColor={{ false: colors.neutral[200], true: colors.green[200] }}
            thumbColor={hasOwnHours ? colors.green[600] : colors.neutral[400]}
          />
        </View>
        {hasOwnHours && <WeekScheduleEditor value={hours} onChange={setHours} />}

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
          accessibilityRole="button"
        >
          {saving
            ? <ActivityIndicator size="small" color={colors.neutral[0]} />
            : <Text style={styles.saveButtonText}>Enregistrer</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  addButton: {
    alignItems: 'center',
    backgroundColor: colors.green[400],
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing[2],
    height: 48,
    justifyContent: 'center',
    marginTop: spacing[4],
  },
  addButtonText: { color: colors.neutral[0], fontFamily: fonts.sansSb, fontSize: 15 },
  badge: {
    alignItems: 'center',
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
  },
  badgeText: { fontFamily: fonts.sansMd, fontSize: 11 },
  center: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  container: { flex: 1 },
  content: { padding: spacing[4], paddingBottom: spacing[10] },
  deleteButton: { padding: spacing[2] },
  emptyState: {
    alignItems: 'center',
    borderRadius: radius.lg,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: spacing[2],
    paddingVertical: spacing[8],
  },
  emptyText: { ...typography.caption },
  hoursHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[3],
    justifyContent: 'space-between',
    marginBottom: spacing[3],
    marginTop: spacing[5],
  },
  hoursHeaderText: { flex: 1 },
  hoursHint: { ...typography.caption, marginTop: 2 },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    fontFamily: fonts.sans,
    fontSize: 15,
    height: 48,
    marginBottom: spacing[4],
    paddingHorizontal: spacing[3],
  },
  intro: { ...typography.caption, lineHeight: 18, marginBottom: spacing[4] },
  label: { fontFamily: fonts.sansSb, fontSize: 13, marginBottom: spacing[2] },
  locationAction: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: spacing[2],
    height: 44,
    justifyContent: 'center',
  },
  locationActionText: { fontFamily: fonts.sansMd, fontSize: 13 },
  locationActions: { flexDirection: 'row', gap: spacing[3], marginBottom: spacing[4], marginTop: spacing[3] },
  locationCoords: { fontFamily: fonts.mono, fontSize: 12, marginTop: 2 },
  locationStatus: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing[3],
    minHeight: 52,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  locationText: { fontFamily: fonts.sansMd, fontSize: 14 },
  pointActions: {
    alignItems: 'center',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: spacing[4],
    paddingRight: spacing[2],
    paddingVertical: spacing[1],
  },
  pointAddress: { ...typography.caption, marginTop: 2 },
  pointBadges: { flexDirection: 'row', gap: spacing[2], marginTop: spacing[2] },
  pointCard: { borderRadius: radius.lg, borderWidth: 1, marginBottom: spacing[3] },
  pointMain: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[3],
    padding: spacing[4],
  },
  pointName: { fontFamily: fonts.sansSb, fontSize: 15 },
  pointText: { flex: 1 },
  pointToggle: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  saveButton: {
    alignItems: 'center',
    backgroundColor: colors.green[400],
    borderRadius: radius.md,
    height: 48,
    justifyContent: 'center',
    marginTop: spacing[6],
  },
  saveButtonDisabled: { opacity: 0.5 },
  saveButtonText: { color: colors.neutral[0], fontFamily: fonts.sansSb, fontSize: 16 },
  toggleLabel: { fontFamily: fonts.sansMd, fontSize: 13 },
})
