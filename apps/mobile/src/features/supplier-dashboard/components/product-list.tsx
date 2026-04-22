import Check from 'lucide-react-native/dist/esm/icons/check'
import Package from 'lucide-react-native/dist/esm/icons/package'
import TriangleAlert from 'lucide-react-native/dist/esm/icons/triangle-alert'
import X from 'lucide-react-native/dist/esm/icons/x'
import * as React from 'react'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { ConfirmModal } from '../../common/components/confirm-modal'

type ProductStatus = 'ACTIVE' | 'OUT_OF_STOCK' | 'HIDDEN'

interface Product {
  id: string
  name: string
  photoUri: string | null
  price: number
  unit: string
  stock: number
  status: ProductStatus
}

function getStatusConfig(status: ProductStatus): {
  label: string
  bgColor: string
  textColor: string
} {
  switch (status) {
    case 'ACTIVE':
      return {
        label: 'Actif',
        bgColor: colors.green[50],
        textColor: colors.green[800],
      }
    case 'OUT_OF_STOCK':
      return {
        label: 'En rupture',
        bgColor: colors.coral[50],
        textColor: colors.coral[600],
      }
    case 'HIDDEN':
      return {
        label: 'Masqué',
        bgColor: colors.neutral[100],
        textColor: colors.neutral[600],
      }
  }
}

function formatPrice(value: number): string {
  return value.toLocaleString('fr-FR')
}

interface ProductListProps {
  onAddProduct?: () => void
  onEditProduct?: (productId: string) => void
}

export function ProductList({ onAddProduct, onEditProduct }: ProductListProps) {
  const { semantic } = useTheme()
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [editingStockId, setEditingStockId] = useState<string | null>(null)
  const [editingStockValue, setEditingStockValue] = useState('')
  const [modal, setModal] = useState<{ visible: boolean, title: string, message: string, type: 'success' | 'error' | 'confirm', onConfirm?: () => void }>({ visible: false, title: '', message: '', type: 'error' })

  function showError(title: string, message: string): void {
    setModal({ visible: true, title, message, type: 'error' })
  }

  const fetchProducts = useCallback(async (): Promise<void> => {
    try {
      const res = await apiFetch('/api/suppliers/me/products')
      if (res.ok) {
        const json = await res.json()
        const items = (json.data ?? json ?? []) as Array<Record<string, unknown>>
        setProducts(items.map((p): Product => ({
          id: p.id as string,
          name: p.name as string,
          photoUri: (p.photo as string) ?? null,
          price: (p.pricePerUnit as number) ?? 0,
          unit: (p.unit as string) ?? '',
          stock: (p.stock as number) ?? 0,
          status: (p.status as ProductStatus) ?? 'ACTIVE',
        })))
      }
    }
    catch {
      // Silently fail — products stay empty
    }
    finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void fetchProducts()
  }, [fetchProducts])

  function handleRefresh(): void {
    setIsRefreshing(true)
    void fetchProducts()
  }

  function handleStartEditStock(product: Product): void {
    setEditingStockId(product.id)
    setEditingStockValue(String(product.stock))
  }

  async function handleSaveStock(productId: string): Promise<void> {
    const newStock = Number.parseInt(editingStockValue, 10)
    if (Number.isNaN(newStock) || newStock < 0) {
      showError('Erreur', 'Veuillez saisir un nombre valide.')
      return
    }

    try {
      const res = await apiFetch(`/api/suppliers/me/products/${productId}/stock`, {
        method: 'PATCH',
        body: JSON.stringify({ stock: newStock }),
      })
      if (res.ok) {
        setProducts(prev =>
          prev.map(p =>
            p.id === productId
              ? {
                  ...p,
                  stock: newStock,
                  status: newStock === 0 ? 'OUT_OF_STOCK' : p.status === 'OUT_OF_STOCK' ? 'ACTIVE' : p.status,
                }
              : p,
          ),
        )
      }
    }
    catch {
      showError('Erreur', 'Impossible de mettre à jour le stock.')
    }
    finally {
      setEditingStockId(null)
    }
  }

  function renderProductCard({ item }: { item: Product }): React.ReactElement {
    const statusConfig = getStatusConfig(item.status)
    const isEditingStock = editingStockId === item.id

    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: semantic.bgCard, borderColor: semantic.borderNormal }]}
        activeOpacity={0.7}
        onPress={() => onEditProduct?.(item.id)}
        accessibilityRole="button"
        accessibilityLabel={`Modifier ${item.name}`}
      >
        <View style={styles.cardRow}>
          {item.photoUri
            ? (
                <Image
                  source={{ uri: item.photoUri }}
                  style={styles.thumbnail}
                  resizeMode="cover"
                />
              )
            : (
                <View style={[styles.thumbnail, styles.thumbnailPlaceholder, { backgroundColor: semantic.bgSurface }]}>
                  <Text style={[styles.thumbnailPlaceholderText, { color: semantic.textTertiary }]}>
                    {item.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}

          <View style={styles.cardContent}>
            <Text style={[styles.productName, { color: semantic.textPrimary }]} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={[styles.productPrice, { color: semantic.textPrimaryColor }]}>
              {formatPrice(item.price)}
              {' '}
              FCFA /
              {item.unit}
            </Text>

            <View style={styles.cardFooter}>
              {isEditingStock
                ? (
                    <View style={styles.stockEditRow}>
                      <TextInput
                        style={[styles.stockInput, { color: semantic.textPrimary }]}
                        value={editingStockValue}
                        onChangeText={setEditingStockValue}
                        keyboardType="numeric"
                        autoFocus
                        selectTextOnFocus
                        accessibilityLabel="Modifier le stock"
                        onSubmitEditing={() => handleSaveStock(item.id)}
                      />
                      <TouchableOpacity
                        style={styles.stockSaveButton}
                        onPress={() => handleSaveStock(item.id)}
                        accessibilityLabel="Enregistrer le stock"
                      >
                        <Check size={14} color={colors.neutral[0]} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.stockCancelButton}
                        onPress={() => setEditingStockId(null)}
                        accessibilityLabel="Annuler"
                      >
                        <X size={14} color={semantic.textTertiary} />
                      </TouchableOpacity>
                    </View>
                  )
                : (
                    <TouchableOpacity
                      style={styles.stockButton}
                      onPress={() => handleStartEditStock(item)}
                      accessibilityLabel={`Stock: ${item.stock}. Appuyez pour modifier.`}
                    >
                      <Text style={[styles.stockText, { color: semantic.textSecondary }]}>
                        Stock:
                        {' '}
                        {item.stock}
                      </Text>
                    </TouchableOpacity>
                  )}

              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: statusConfig.bgColor },
                ]}
              >
                <Text
                  style={[
                    styles.statusText,
                    { color: statusConfig.textColor },
                  ]}
                >
                  {statusConfig.label}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    )
  }

  function renderEmptyState(): React.ReactElement {
    return (
      <View style={styles.emptyContainer}>
        <Package size={48} color={semantic.textTertiary} />
        <Text style={[styles.emptyTitle, { color: semantic.textPrimary }]}>Aucun produit</Text>
        <Text style={[styles.emptyDescription, { color: semantic.textSecondary }]}>
          Ajoutez votre premier produit pour commencer à vendre sur eBio.
        </Text>
        <TouchableOpacity
          style={styles.emptyAddButton}
          onPress={onAddProduct}
          accessibilityLabel="Ajouter un produit"
        >
          <Text style={styles.emptyAddButtonText}>Ajouter un produit</Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: semantic.bgPage }]}>
        <ActivityIndicator size="large" color={colors.green[400]} />
      </View>
    )
  }

  return (
    <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
      <View style={[styles.header, { backgroundColor: semantic.bgCard, borderBottomColor: semantic.borderNormal }]}>
        <Text style={[styles.headerTitle, { color: semantic.textPrimary }]}>Mes produits</Text>
        <Text style={[styles.headerCount, { color: semantic.textTertiary }]}>
          {products.length}
          {' '}
          produit
          {products.length > 1 ? 's' : ''}
        </Text>
      </View>

      <FlatList
        data={products}
        keyExtractor={item => item.id}
        renderItem={renderProductCard}
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshing={isRefreshing}
        onRefresh={handleRefresh}
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={onAddProduct}
        accessibilityRole="button"
        accessibilityLabel="Ajouter un nouveau produit"
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <ConfirmModal
        visible={modal.visible}
        icon={TriangleAlert}
        iconColor={colors.coral[600]}
        iconBg={colors.coral[50]}
        title={modal.title}
        message={modal.message}
        confirmLabel="OK"
        confirmStyle="primary"
        onConfirm={() => setModal(prev => ({ ...prev, visible: false }))}
        onCancel={() => setModal(prev => ({ ...prev, visible: false }))}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingTop: spacing[4],
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    borderBottomWidth: 1,
  },
  headerTitle: {
    ...typography.h1,
  },
  headerCount: {
    ...typography.caption,
    marginTop: spacing[1],
  },
  listContent: {
    paddingTop: spacing[3],
    paddingBottom: spacing[12],
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    marginHorizontal: spacing[4],
    marginBottom: spacing[2],
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
    overflow: 'hidden',
  },
  cardRow: {
    flexDirection: 'row',
  },
  thumbnail: {
    width: 80,
    height: 80,
  },
  thumbnailPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailPlaceholderText: {
    fontFamily: fonts.sansBd,
    fontSize: 20,
  },
  cardContent: {
    flex: 1,
    padding: spacing[3],
    justifyContent: 'space-between',
  },
  productName: {
    ...typography.h3,
  },
  productPrice: {
    ...typography.price,
    marginTop: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing[1],
  },
  stockButton: {
    minHeight: 28,
    justifyContent: 'center',
  },
  stockText: {
    ...typography.caption,
  },
  stockEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  stockInput: {
    minHeight: 28,
    width: 60,
    borderWidth: 1,
    borderColor: colors.green[400],
    borderRadius: radius.sm,
    paddingHorizontal: spacing[2],
    fontFamily: fonts.mono,
    fontSize: 13,
    textAlign: 'center',
  },
  stockSaveButton: {
    minHeight: 28,
    minWidth: 28,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.green[400],
    borderRadius: radius.sm,
  },
  stockSaveText: {
    fontSize: 14,
    color: colors.neutral[0],
  },
  stockCancelButton: {
    minHeight: 28,
    minWidth: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stockCancelText: {
    fontSize: 14,
    color: colors.neutral[400],
  },
  statusBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
  },
  statusText: {
    fontFamily: fonts.sansSb,
    fontSize: 10,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingHorizontal: spacing[8],
    paddingTop: spacing[12],
    gap: spacing[3],
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyTitle: {
    ...typography.h2,
  },
  emptyDescription: {
    ...typography.bodyL,
    textAlign: 'center',
  },
  emptyAddButton: {
    minHeight: 44,
    paddingHorizontal: spacing[5],
    backgroundColor: colors.green[400],
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing[2],
  },
  emptyAddButtonText: {
    fontFamily: fonts.sansSb,
    fontSize: 16,
    color: colors.neutral[0],
  },
  fab: {
    position: 'absolute',
    bottom: spacing[6],
    right: spacing[4],
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.green[400],
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  fabText: {
    fontFamily: fonts.sansBd,
    fontSize: 28,
    color: colors.neutral[0],
    marginTop: -2,
  },
})
