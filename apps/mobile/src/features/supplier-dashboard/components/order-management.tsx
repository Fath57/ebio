import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'
import TriangleAlert from 'lucide-react-native/dist/esm/icons/triangle-alert'
import * as React from 'react'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { apiFetch } from '../../../utils/api-client'
import { ConfirmModal } from '../../common/components/confirm-modal'
import { ScreenHeader } from '../../common/components/screen-header'

type OrderStatus = 'PLACED' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'IN_DELIVERY' | 'DELIVERED' | 'CANCELLED' | 'DISPUTED'

interface OrderItem {
  name: string
  quantity: number
  unitPrice: number
}

interface SupplierOrder {
  id: string
  orderNumber: string
  buyerName: string
  items: OrderItem[]
  total: number
  status: OrderStatus
  createdAt: string
}

interface OrderManagementProps {
  supplierId: string
  onOpenOrder?: (orderId: string) => void
  onGoBack?: () => void
}

type Tab = 'all' | 'pending' | 'active' | 'done'

// `all` keeps an empty status list: it means « no filter » (see `filtered`).
const TABS: Array<{ key: Tab, label: string, statuses: OrderStatus[] }> = [
  { key: 'all', label: 'Tous', statuses: [] },
  { key: 'pending', label: 'En attente', statuses: ['PLACED'] },
  { key: 'active', label: 'En cours', statuses: ['ACCEPTED', 'PREPARING', 'READY', 'IN_DELIVERY'] },
  { key: 'done', label: 'Terminées', statuses: ['DELIVERED', 'CANCELLED', 'DISPUTED'] },
]

const STATUS_LABELS: Record<OrderStatus, string> = {
  PLACED: 'Nouvelle',
  ACCEPTED: 'Acceptée',
  PREPARING: 'En préparation',
  READY: 'Prête',
  IN_DELIVERY: 'En livraison',
  DELIVERED: 'Livrée',
  CANCELLED: 'Annulée',
  DISPUTED: 'Litige',
}

function formatPrice(value: number): string {
  return value.toLocaleString('fr-FR').replace(/,/g, ' ')
}

function formatTimeSince(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diffMin = Math.floor((now - then) / 60000)

  if (diffMin < 1)
    return 'à l\u2019instant'
  if (diffMin < 60)
    return `il y a ${diffMin} min`

  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24)
    return `il y a ${diffH}h`

  const diffD = Math.floor(diffH / 24)
  return `il y a ${diffD}j`
}

// Transitions via PATCH /orders/:id/status (statuts acceptés par l'API)
const NEXT_STATUS: Partial<Record<OrderStatus, { status: OrderStatus, label: string }>> = {
  ACCEPTED: { status: 'PREPARING', label: 'En préparation' },
  PREPARING: { status: 'READY', label: 'Prête' },
  READY: { status: 'IN_DELIVERY', label: 'En livraison' },
}

const REJECT_REASONS = ['Rupture de stock', 'Boutique fermée', 'Zone non desservie', 'Autre'] as const

export function OrderManagement({ supplierId, onOpenOrder, onGoBack }: OrderManagementProps) {
  const tabBarHeight = useBottomTabBarHeight()
  const [orders, setOrders] = useState<SupplierOrder[]>([])
  const [tab, setTab] = useState<Tab>('pending')
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [modal, setModal] = useState<{ visible: boolean, title: string, message: string, type: 'success' | 'error' | 'confirm', onConfirm?: () => void }>({ visible: false, title: '', message: '', type: 'error' })

  function showError(title: string, message: string): void {
    setModal({ visible: true, title, message, type: 'error' })
  }

  // Reject-reason picker state
  const [rejectOrderId, setRejectOrderId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState<string>(REJECT_REASONS[0])
  const [rejectCustomText, setRejectCustomText] = useState('')

  const fetchOrders = useCallback(async () => {
    try {
      const res = await apiFetch('/api/orders?limit=100')
      if (res.ok) {
        const json = await res.json()
        const items = (json.orders ?? json.data ?? json ?? []) as Array<Record<string, unknown>>
        setOrders(items.map((o): SupplierOrder => ({
          id: o.id as string,
          orderNumber: o.orderNumber as string,
          buyerName: (o.buyerName as string) ?? '',
          items: ((o.items as Array<Record<string, unknown>>) ?? []).map(it => ({
            name: (it.productName as string) ?? (it.name as string) ?? '',
            quantity: (it.quantity as number) ?? 0,
            unitPrice: (it.unitPrice as number) ?? 0,
          })),
          total: (o.totalAmount as number) ?? (o.total as number) ?? 0,
          status: o.status as OrderStatus,
          createdAt: o.createdAt as string,
        })))
      }
    }
    catch {
      // Silently fail
    }
    finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [supplierId])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true)
    fetchOrders()
  }, [fetchOrders])

  async function handleAccept(orderId: string): Promise<void> {
    setProcessingId(orderId)
    try {
      const res = await apiFetch(`/api/orders/${orderId}/accept`, { method: 'PATCH' })
      if (res.ok) {
        setOrders(prev =>
          prev.map(o =>
            o.id === orderId ? { ...o, status: 'ACCEPTED' as OrderStatus } : o,
          ),
        )
      }
      else {
        showError('Erreur', 'Impossible d\u2019accepter la commande.')
      }
    }
    catch {
      showError('Erreur', 'Impossible d\u2019accepter la commande.')
    }
    finally {
      setProcessingId(null)
    }
  }

  function handleReject(orderId: string): void {
    setRejectReason(REJECT_REASONS[0])
    setRejectCustomText('')
    setRejectOrderId(orderId)
  }

  async function submitReject(): Promise<void> {
    if (!rejectOrderId)
      return
    const reason = rejectReason === 'Autre' ? rejectCustomText.trim() : rejectReason
    if (!reason)
      return
    const orderId = rejectOrderId
    setRejectOrderId(null)
    setProcessingId(orderId)
    try {
      const res = await apiFetch(`/api/orders/${orderId}/reject`, {
        method: 'PATCH',
        body: JSON.stringify({ reason }),
      })
      if (res.ok) {
        setOrders(prev =>
          prev.map(o =>
            o.id === orderId ? { ...o, status: 'CANCELLED' as OrderStatus } : o,
          ),
        )
      }
      else {
        showError('Erreur', 'Impossible de refuser la commande.')
      }
    }
    catch {
      showError('Erreur', 'Impossible de refuser la commande.')
    }
    finally {
      setProcessingId(null)
    }
  }

  async function handleConfirmDelivery(orderId: string): Promise<void> {
    setProcessingId(orderId)
    try {
      const res = await apiFetch(`/api/orders/${orderId}/confirm-delivery`, { method: 'PATCH' })
      if (res.ok) {
        setOrders(prev =>
          prev.map(o =>
            o.id === orderId ? { ...o, status: 'DELIVERED' as OrderStatus } : o,
          ),
        )
      }
      else {
        showError('Erreur', 'Impossible de confirmer la livraison.')
      }
    }
    catch {
      showError('Erreur', 'Impossible de confirmer la livraison.')
    }
    finally {
      setProcessingId(null)
    }
  }

  async function handleUpdateStatus(orderId: string, newStatus: OrderStatus): Promise<void> {
    setProcessingId(orderId)
    try {
      const res = await apiFetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        setOrders(prev =>
          prev.map(o =>
            o.id === orderId ? { ...o, status: newStatus } : o,
          ),
        )
      }
    }
    catch {
      showError('Erreur', 'Impossible de mettre à jour le statut.')
    }
    finally {
      setProcessingId(null)
    }
  }

  const renderItem = useCallback(
    ({ item }: { item: SupplierOrder }) => {
      const isProcessing = processingId === item.id
      const itemsSummary = item.items
        .map(i => `${i.quantity}x ${i.name}`)
        .join(', ')
      const nextStep = NEXT_STATUS[item.status]

      return (
        <View style={styles.card}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => onOpenOrder?.(item.id)}
            accessibilityRole="button"
            accessibilityLabel={`Détails de la commande ${item.orderNumber}`}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.orderNumber}>{item.orderNumber}</Text>
              <Text style={styles.timeSince}>
                {formatTimeSince(item.createdAt)}
              </Text>
            </View>

            <View style={styles.badgeRow}>
              <Text style={styles.statusBadge}>{STATUS_LABELS[item.status]}</Text>
            </View>

            <Text style={styles.buyerName}>{item.buyerName}</Text>
            <Text style={styles.itemsSummary} numberOfLines={2}>
              {itemsSummary}
            </Text>

            <Text style={styles.totalPrice}>
              {formatPrice(item.total)}
              {' '}
              FCFA
            </Text>
          </TouchableOpacity>

          {/* Actions */}
          {item.status === 'PLACED' && (
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.acceptButton, isProcessing && styles.buttonDisabled]}
                onPress={() => handleAccept(item.id)}
                disabled={isProcessing}
                accessibilityRole="button"
                accessibilityLabel="Accepter la commande"
              >
                {isProcessing
                  ? (
                      <ActivityIndicator size="small" color={colors.neutral[0]} />
                    )
                  : (
                      <Text style={styles.acceptButtonText}>Accepter</Text>
                    )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.rejectButton, isProcessing && styles.buttonDisabled]}
                onPress={() => handleReject(item.id)}
                disabled={isProcessing}
                accessibilityRole="button"
                accessibilityLabel="Refuser la commande"
              >
                <Text style={styles.rejectButtonText}>Refuser</Text>
              </TouchableOpacity>
            </View>
          )}

          {nextStep && (
            <TouchableOpacity
              style={[styles.statusButton, isProcessing && styles.buttonDisabled]}
              onPress={() => handleUpdateStatus(item.id, nextStep.status)}
              disabled={isProcessing}
              accessibilityRole="button"
              accessibilityLabel={`Marquer comme ${nextStep.label}`}
            >
              {isProcessing
                ? (
                    <ActivityIndicator size="small" color={colors.neutral[0]} />
                  )
                : (
                    <Text style={styles.statusButtonText}>
                      Marquer :
                      {' '}
                      {nextStep.label}
                    </Text>
                  )}
            </TouchableOpacity>
          )}

          {item.status === 'IN_DELIVERY' && (
            <TouchableOpacity
              style={[styles.statusButton, isProcessing && styles.buttonDisabled]}
              onPress={() => handleConfirmDelivery(item.id)}
              disabled={isProcessing}
              accessibilityRole="button"
              accessibilityLabel="Confirmer la livraison"
            >
              {isProcessing
                ? (
                    <ActivityIndicator size="small" color={colors.neutral[0]} />
                  )
                : (
                    <Text style={styles.statusButtonText}>Confirmer la livraison</Text>
                  )}
            </TouchableOpacity>
          )}
        </View>
      )
    },
    [processingId, onOpenOrder],
  )

  const keyExtractor = useCallback((item: SupplierOrder) => item.id, [])

  if (isLoading) {
    return (
      <View style={styles.emptyContainer}>
        <ActivityIndicator size="large" color={colors.green[400]} />
      </View>
    )
  }

  const activeTab = TABS.find(t => t.key === tab) ?? TABS[0]
  const filtered = activeTab.statuses.length === 0 ? orders : orders.filter(o => activeTab.statuses.includes(o.status))

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Commandes reçues" onBack={onGoBack} />
      <View style={styles.tabsRow}>
        {TABS.map((t) => {
          const isActive = t.key === tab
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => setTab(t.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

      <FlatList
        data={filtered}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        style={styles.list}
        contentContainerStyle={[styles.listContent, { paddingBottom: tabBarHeight + spacing[4] }]}
        refreshing={isRefreshing}
        onRefresh={handleRefresh}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={(
          <View style={styles.emptylist}>
            <Text style={styles.emptyText}>Aucune commande</Text>
          </View>
        )}
      />

      {/* Reject reason picker */}
      <Modal
        visible={rejectOrderId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRejectOrderId(null)}
      >
        <View style={styles.rejectOverlay}>
          <View style={styles.rejectCard}>
            <Text style={styles.rejectTitle}>Refuser la commande</Text>
            <Text style={styles.rejectSubtitle}>Indiquez le motif du refus, il sera transmis au client.</Text>
            {REJECT_REASONS.map((r) => {
              const isSelected = rejectReason === r
              return (
                <TouchableOpacity
                  key={r}
                  style={[styles.rejectOption, isSelected && styles.rejectOptionActive]}
                  onPress={() => setRejectReason(r)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={r}
                >
                  <View style={[styles.rejectRadio, isSelected && styles.rejectRadioActive]} />
                  <Text style={[styles.rejectOptionText, isSelected && styles.rejectOptionTextActive]}>{r}</Text>
                </TouchableOpacity>
              )
            })}
            {rejectReason === 'Autre' && (
              <TextInput
                style={styles.rejectInput}
                placeholder="Précisez le motif"
                placeholderTextColor={colors.neutral[400]}
                value={rejectCustomText}
                onChangeText={setRejectCustomText}
                multiline
                accessibilityLabel="Motif du refus"
              />
            )}
            <View style={styles.rejectActions}>
              <TouchableOpacity
                style={styles.rejectCancelButton}
                onPress={() => setRejectOrderId(null)}
                accessibilityRole="button"
                accessibilityLabel="Annuler"
              >
                <Text style={styles.rejectCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.rejectConfirmButton,
                  rejectReason === 'Autre' && rejectCustomText.trim() === '' && styles.buttonDisabled,
                ]}
                onPress={submitReject}
                disabled={rejectReason === 'Autre' && rejectCustomText.trim() === ''}
                accessibilityRole="button"
                accessibilityLabel="Confirmer le refus"
              >
                <Text style={styles.rejectConfirmText}>Refuser</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmModal
        visible={modal.visible}
        icon={TriangleAlert}
        iconColor={modal.type === 'confirm' ? colors.coral[600] : colors.coral[600]}
        iconBg={colors.coral[50]}
        title={modal.title}
        message={modal.message}
        confirmLabel={modal.type === 'confirm' ? 'Refuser' : 'OK'}
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
    backgroundColor: colors.neutral[0],
  },
  tabsRow: {
    flexDirection: 'row',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
  },
  tab: {
    flex: 1,
    paddingVertical: spacing[2],
    borderRadius: radius.pill,
    backgroundColor: colors.neutral[100],
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: colors.green[400],
  },
  tabText: {
    ...typography.caption,
    fontFamily: fonts.sansSb,
    color: colors.neutral[600],
  },
  tabTextActive: {
    color: colors.neutral[0],
  },
  badgeRow: {
    flexDirection: 'row',
  },
  statusBadge: {
    ...typography.caption,
    fontFamily: fonts.sansSb,
    color: colors.green[800],
    backgroundColor: colors.green[50],
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  emptylist: {
    paddingTop: spacing[12],
    alignItems: 'center',
  },
  list: {
    flex: 1,
    backgroundColor: colors.neutral[0],
  },
  listContent: {
    padding: spacing[4],
    gap: spacing[3],
  },
  card: {
    padding: spacing[4],
    borderWidth: 1,
    borderColor: colors.neutral[200],
    borderRadius: radius.lg,
    gap: spacing[2],
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderNumber: {
    fontFamily: fonts.mono,
    fontSize: 14,
    color: colors.neutral[800],
  },
  timeSince: {
    ...typography.caption,
    color: colors.neutral[400],
  },
  buyerName: {
    ...typography.bodyS,
    fontFamily: fonts.sansSb,
    color: colors.neutral[800],
  },
  itemsSummary: {
    ...typography.bodyS,
    color: colors.neutral[400],
  },
  totalPrice: {
    ...typography.price,
    color: colors.green[600],
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[1],
  },
  acceptButton: {
    flex: 1,
    minHeight: 44,
    backgroundColor: colors.green[400],
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  acceptButtonText: {
    fontFamily: fonts.sansSb,
    fontSize: 14,
    color: colors.neutral[0],
  },
  rejectButton: {
    flex: 1,
    minHeight: 44,
    backgroundColor: colors.coral[400],
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rejectButtonText: {
    fontFamily: fonts.sansSb,
    fontSize: 14,
    color: colors.neutral[0],
  },
  statusButton: {
    minHeight: 44,
    backgroundColor: colors.green[400],
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing[1],
  },
  statusButtonText: {
    fontFamily: fonts.sansSb,
    fontSize: 14,
    color: colors.neutral[0],
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.neutral[0],
  },
  rejectOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: spacing[4],
  },
  rejectCard: {
    backgroundColor: colors.neutral[0],
    borderRadius: radius.lg,
    padding: spacing[4],
    gap: spacing[2],
  },
  rejectTitle: {
    ...typography.h3,
    color: colors.neutral[800],
  },
  rejectSubtitle: {
    ...typography.bodyS,
    color: colors.neutral[400],
    marginBottom: spacing[1],
  },
  rejectOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    minHeight: 44,
    paddingHorizontal: spacing[3],
    borderWidth: 1,
    borderColor: colors.neutral[200],
    borderRadius: radius.md,
  },
  rejectOptionActive: {
    borderColor: colors.green[400],
    backgroundColor: colors.green[50],
  },
  rejectRadio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.neutral[200],
  },
  rejectRadioActive: {
    borderColor: colors.green[400],
    backgroundColor: colors.green[400],
  },
  rejectOptionText: {
    ...typography.bodyS,
    fontFamily: fonts.sansMd,
    color: colors.neutral[600],
  },
  rejectOptionTextActive: {
    color: colors.green[800],
  },
  rejectInput: {
    minHeight: 64,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingTop: spacing[2],
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.neutral[800],
    textAlignVertical: 'top',
  },
  rejectActions: {
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[2],
  },
  rejectCancelButton: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rejectCancelText: {
    fontFamily: fonts.sansMd,
    fontSize: 14,
    color: colors.neutral[600],
  },
  rejectConfirmButton: {
    flex: 1,
    minHeight: 44,
    backgroundColor: colors.coral[400],
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rejectConfirmText: {
    fontFamily: fonts.sansSb,
    fontSize: 14,
    color: colors.neutral[0],
  },
  emptyText: {
    ...typography.bodyL,
    color: colors.neutral[400],
  },
})
