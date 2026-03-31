import TriangleAlert from 'lucide-react-native/dist/esm/icons/triangle-alert'
import * as React from 'react'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { apiFetch } from '../../../utils/api-client'
import { ConfirmModal } from '../../common/components/confirm-modal'

type OrderStatus = 'PLACED' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'DELIVERED'

interface OrderItem {
  name: string
  quantity: number
  unit: string
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

const NEXT_STATUS: Partial<Record<OrderStatus, { status: OrderStatus, label: string }>> = {
  ACCEPTED: { status: 'PREPARING', label: 'En préparation' },
  PREPARING: { status: 'READY', label: 'Prête' },
  READY: { status: 'DELIVERED', label: 'Livrée' },
}

export function OrderManagement({ supplierId }: OrderManagementProps) {
  const [orders, setOrders] = useState<SupplierOrder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [modal, setModal] = useState<{ visible: boolean, title: string, message: string, type: 'success' | 'error' | 'confirm', onConfirm?: () => void }>({ visible: false, title: '', message: '', type: 'error' })

  function showError(title: string, message: string): void {
    setModal({ visible: true, title, message, type: 'error' })
  }

  function showConfirm(title: string, message: string, onConfirm: () => void): void {
    setModal({ visible: true, title, message, type: 'confirm', onConfirm })
  }

  const fetchOrders = useCallback(async () => {
    try {
      const res = await apiFetch('/api/orders?role=supplier')
      if (res.ok) {
        const json = await res.json()
        const items = (json.orders ?? json.data ?? json ?? []) as Array<Record<string, unknown>>
        setOrders(items.map((o): SupplierOrder => ({
          id: o.id as string,
          orderNumber: o.orderNumber as string,
          buyerName: (o.buyerName as string) ?? '',
          items: (o.items as OrderItem[]) ?? [],
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
      const res = await apiFetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'ACCEPTED' }),
      })
      if (res.ok) {
        setOrders(prev =>
          prev.map(o =>
            o.id === orderId ? { ...o, status: 'ACCEPTED' as OrderStatus } : o,
          ),
        )
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
    showConfirm(
      'Refuser la commande',
      'Êtes-vous sûr de vouloir refuser cette commande ?',
      async () => {
        setProcessingId(orderId)
        try {
          const res = await apiFetch(`/api/orders/${orderId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'REJECTED' }),
          })
          if (res.ok) {
            setOrders(prev => prev.filter(o => o.id !== orderId))
          }
        }
        catch {
          showError('Erreur', 'Impossible de refuser la commande.')
        }
        finally {
          setProcessingId(null)
        }
      },
    )
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
          <View style={styles.cardHeader}>
            <Text style={styles.orderNumber}>{item.orderNumber}</Text>
            <Text style={styles.timeSince}>
              {formatTimeSince(item.createdAt)}
            </Text>
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
        </View>
      )
    },
    [processingId],
  )

  const keyExtractor = useCallback((item: SupplierOrder) => item.id, [])

  if (isLoading) {
    return (
      <View style={styles.emptyContainer}>
        <ActivityIndicator size="large" color={colors.green[400]} />
      </View>
    )
  }

  if (orders.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Aucune commande en attente</Text>
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={orders}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        refreshing={isRefreshing}
        onRefresh={handleRefresh}
        showsVerticalScrollIndicator={false}
      />

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
  emptyText: {
    ...typography.bodyL,
    color: colors.neutral[400],
  },
})
