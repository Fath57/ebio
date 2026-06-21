import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'
import Trash2 from 'lucide-react-native/dist/esm/icons/trash-2'
import TriangleAlert from 'lucide-react-native/dist/esm/icons/triangle-alert'
import * as React from 'react'
import { useCallback, useEffect, useState } from 'react'
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import MapView, { Marker, Polygon, PROVIDER_GOOGLE } from 'react-native-maps'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { ConfirmModal } from '../../common/components/confirm-modal'

interface DeliveryZone {
  id: string
  name: string
  fee: number
  estimatedMinutes: number
}

interface LatLng {
  latitude: number
  longitude: number
}

const DEFAULT_REGION = {
  latitude: 6.3703,
  longitude: 2.3912,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
}

interface DeliveryZoneEditorProps {
  onSave?: () => void
}

export function DeliveryZoneEditor({ onSave }: DeliveryZoneEditorProps) {
  const { semantic } = useTheme()
  const tabBarHeight = useBottomTabBarHeight()
  const [zones, setZones] = useState<DeliveryZone[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [newZoneName, setNewZoneName] = useState('')
  const [newZoneFee, setNewZoneFee] = useState('')
  const [newZoneMinutes, setNewZoneMinutes] = useState('')
  const [points, setPoints] = useState<LatLng[]>([])
  const [isAdding, setIsAdding] = useState(false)
  const [modal, setModal] = useState<{ visible: boolean, title: string, message: string, type: 'success' | 'error' | 'confirm', onConfirm?: () => void }>({ visible: false, title: '', message: '', type: 'error' })

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
          name: (z.name as string) ?? `Zone ${(z.deliveryFee as number ?? 0)} FCFA`,
          fee: (z.deliveryFee as number) ?? (z.fee as number) ?? 0,
          estimatedMinutes: (z.estimatedMinutes as number) ?? 0,
        })))
      }
    }
    catch {
      // Keep empty list
    }
    finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchZones()
  }, [fetchZones])

  async function handleAddZone(): Promise<void> {
    if (!newZoneName.trim() || !newZoneFee.trim()) {
      showError('Champs requis', 'Veuillez remplir le nom et les frais de livraison.')
      return
    }
    if (points.length < 3) {
      showError('Zone incomplète', 'Tracez au moins 3 points sur la carte pour délimiter la zone.')
      return
    }

    setIsAdding(true)
    try {
      const fee = Number.parseFloat(newZoneFee)
      const minutes = newZoneMinutes ? Number.parseInt(newZoneMinutes, 10) : 30
      const body = {
        polygon: points,
        deliveryFee: fee,
        estimatedMinutes: minutes,
      }
      const res = await apiFetch('/api/suppliers/me/delivery-zones', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const raw = await res.json()
        const created: DeliveryZone = {
          id: raw.id,
          name: newZoneName.trim() || `Zone ${fee} FCFA`,
          fee: raw.deliveryFee ?? fee,
          estimatedMinutes: raw.estimatedMinutes ?? minutes,
        }
        setZones(prev => [...prev, created])
        setNewZoneName('')
        setNewZoneFee('')
        setNewZoneMinutes('')
        setPoints([])
        onSave?.()
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
    showConfirm(
      'Supprimer la zone',
      `Voulez-vous vraiment supprimer la zone "${zoneName}" ?`,
      async () => {
        try {
          const res = await apiFetch(`/api/suppliers/me/delivery-zones/${zoneId}`, {
            method: 'DELETE',
          })
          if (res.ok) {
            setZones(prev => prev.filter(z => z.id !== zoneId))
          }
        }
        catch {
          showError('Erreur', 'Impossible de supprimer la zone.')
        }
      },
    )
  }

  function renderZoneItem({ item }: { item: DeliveryZone }): React.ReactElement {
    return (
      <View style={[styles.zoneCard, { backgroundColor: semantic.bgCard, borderColor: semantic.borderNormal }]}>
        <View style={styles.zoneInfo}>
          <Text style={[styles.zoneName, { color: semantic.textPrimary }]}>{item.name}</Text>
          <View style={styles.zoneMeta}>
            <Text style={[styles.zoneFee, { color: semantic.textPrimaryColor }]}>
              {item.fee.toLocaleString('fr-FR')}
              {' '}
              FCFA
            </Text>
            {item.estimatedMinutes > 0 && (
              <Text style={[styles.zoneTime, { color: semantic.textTertiary }]}>
                ~
                {' '}
                {item.estimatedMinutes}
                {' '}
                min
              </Text>
            )}
          </View>
        </View>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteZone(item.id, item.name)}
          accessibilityLabel={`Supprimer la zone ${item.name}`}
        >
          <Trash2 size={18} color={colors.coral[400]} />
        </TouchableOpacity>
      </View>
    )
  }

  function renderHeader(): React.ReactElement {
    return (
      <View style={styles.formSection}>
        {/* Interactive map — tap to draw the delivery zone polygon */}
        <View style={[styles.mapWrap, { borderColor: semantic.borderNormal }]}>
          <MapView
            provider={PROVIDER_GOOGLE}
            style={styles.map}
            initialRegion={DEFAULT_REGION}
            onPress={e => setPoints(prev => [...prev, e.nativeEvent.coordinate])}
          >
            {points.length >= 3
              ? (
                  <Polygon
                    coordinates={points}
                    fillColor="rgba(42, 157, 78, 0.25)"
                    strokeColor={colors.green[400]}
                    strokeWidth={2}
                  />
                )
              : points.map(p => (
                  <Marker key={`${p.latitude}-${p.longitude}`} coordinate={p} />
                ))}
          </MapView>
          <View style={[styles.mapToolbar, { backgroundColor: semantic.bgCard }]}>
            <Text style={[styles.mapToolbarText, { color: semantic.textSecondary }]}>
              {points.length}
              {' '}
              point
              {points.length > 1 ? 's' : ''}
            </Text>
            {points.length > 0 && (
              <TouchableOpacity onPress={() => setPoints([])} hitSlop={8}>
                <Text style={styles.mapClearText}>Effacer</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        <Text style={[styles.mapHint, { color: semantic.textTertiary }]}>
          Touchez la carte pour tracer votre zone (min. 3 points)
        </Text>

        {/* Add zone form */}
        <Text style={[styles.sectionTitle, { color: semantic.textPrimary }]}>Ajouter une zone</Text>

        <Text style={[styles.label, { color: semantic.textSecondary }]}>Nom de la zone</Text>
        <TextInput
          style={[styles.textInput, { borderColor: semantic.borderNormal, color: semantic.textPrimary, backgroundColor: semantic.bgCard }]}
          placeholder="Ex: Centre-ville Dakar"
          placeholderTextColor={semantic.textTertiary}
          value={newZoneName}
          onChangeText={setNewZoneName}
          accessibilityLabel="Nom de la zone"
        />

        <Text style={[styles.label, { color: semantic.textSecondary }]}>Frais de livraison (FCFA)</Text>
        <TextInput
          style={[styles.textInput, { borderColor: semantic.borderNormal, color: semantic.textPrimary, backgroundColor: semantic.bgCard }]}
          placeholder="Ex: 1500"
          placeholderTextColor={semantic.textTertiary}
          keyboardType="numeric"
          value={newZoneFee}
          onChangeText={setNewZoneFee}
          accessibilityLabel="Frais de livraison"
        />

        <Text style={[styles.label, { color: semantic.textSecondary }]}>Temps de livraison estimé (minutes)</Text>
        <TextInput
          style={[styles.textInput, { borderColor: semantic.borderNormal, color: semantic.textPrimary, backgroundColor: semantic.bgCard }]}
          placeholder="Ex: 45"
          placeholderTextColor={semantic.textTertiary}
          keyboardType="numeric"
          value={newZoneMinutes}
          onChangeText={setNewZoneMinutes}
          accessibilityLabel="Temps de livraison estimé"
        />

        <TouchableOpacity
          style={[styles.addButton, isAdding && styles.buttonDisabled]}
          onPress={handleAddZone}
          disabled={isAdding}
          accessibilityLabel="Ajouter la zone"
        >
          <Text style={styles.addButtonText}>
            {isAdding ? 'Ajout en cours...' : 'Ajouter la zone'}
          </Text>
        </TouchableOpacity>

        {zones.length > 0 && (
          <Text style={[styles.sectionTitle, { color: semantic.textPrimary }]}>Zones existantes</Text>
        )}
      </View>
    )
  }

  function renderEmptyZones(): React.ReactElement | null {
    if (isLoading)
      return null
    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyText, { color: semantic.textTertiary }]}>
          Aucune zone de livraison configurée.
        </Text>
      </View>
    )
  }

  return (
    <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
      <View style={[styles.headerBar, { backgroundColor: semantic.bgCard, borderBottomColor: semantic.borderNormal }]}>
        <Text style={[styles.headerTitle, { color: semantic.textPrimary }]}>Zones de livraison</Text>
      </View>

      <FlatList
        data={zones}
        keyExtractor={item => item.id}
        renderItem={renderZoneItem}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmptyZones}
        contentContainerStyle={[styles.listContent, { paddingBottom: tabBarHeight + spacing[6] }]}
        showsVerticalScrollIndicator={false}
      />

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
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  headerBar: {
    paddingTop: spacing[4],
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    borderBottomWidth: 1,
  },
  headerTitle: {
    ...typography.h1,
  },
  listContent: {
    paddingBottom: spacing[10],
  },
  formSection: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    gap: spacing[2],
  },
  mapWrap: {
    height: 240,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  mapToolbar: {
    position: 'absolute',
    top: spacing[2],
    right: spacing[2],
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: radius.pill,
  },
  mapToolbarText: {
    ...typography.caption,
    fontFamily: fonts.sansSb,
  },
  mapClearText: {
    ...typography.caption,
    fontFamily: fonts.sansSb,
    color: colors.coral[600],
  },
  mapHint: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing[1],
    marginBottom: spacing[3],
  },
  sectionTitle: {
    ...typography.h2,
    marginTop: spacing[3],
  },
  label: {
    ...typography.caption,
    marginTop: spacing[1],
  },
  textInput: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    fontFamily: fonts.sans,
    fontSize: 15,
  },
  addButton: {
    minHeight: 44,
    backgroundColor: colors.green[400],
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing[2],
  },
  addButtonText: {
    fontFamily: fonts.sansSb,
    fontSize: 16,
    color: colors.neutral[0],
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  zoneCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    marginHorizontal: spacing[4],
    marginTop: spacing[2],
    padding: spacing[3],
  },
  zoneInfo: {
    flex: 1,
    gap: spacing[1],
  },
  zoneName: {
    ...typography.h3,
  },
  zoneMeta: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  zoneFee: {
    ...typography.price,
  },
  zoneTime: {
    ...typography.caption,
    alignSelf: 'center',
  },
  deleteButton: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteText: {
    fontSize: 18,
  },
  emptyContainer: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
  },
  emptyText: {
    ...typography.bodyS,
    textAlign: 'center',
  },
})
