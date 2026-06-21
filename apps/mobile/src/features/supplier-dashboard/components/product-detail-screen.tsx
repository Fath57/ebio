import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'
import ArrowLeft from 'lucide-react-native/dist/esm/icons/arrow-left'
import Box from 'lucide-react-native/dist/esm/icons/box'
import Edit from 'lucide-react-native/dist/esm/icons/pencil'
import Tag from 'lucide-react-native/dist/esm/icons/tag'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'

interface Variant {
  id: string
  label: string
  pricePerUnit: number
  stock: number
}

interface ProductDetail {
  id: string
  name: string
  description: string | null
  categoryName: string
  photos: string[]
  pricePerUnit: number
  unit: string
  stock: number
  stockAlertThreshold: number
  status: string
  promotionalPrice: number | null
  promotionExpiresAt: string | null
  variants: Variant[]
  createdAt: string
  updatedAt: string
}

const UNIT_LABELS: Record<string, string> = {
  KG: 'kg',
  LITER: 'litre',
  SACHET: 'sachet',
  PIECE: 'pièce',
  LOT: 'lot',
}

const STATUS_LABELS: Record<string, { label: string, color: string, bg: string }> = {
  ACTIVE: { label: 'Actif', color: colors.green[800], bg: colors.green[50] },
  OUT_OF_STOCK: { label: 'En rupture', color: colors.coral[800], bg: colors.coral[50] },
  HIDDEN: { label: 'Masqué', color: colors.neutral[600], bg: colors.neutral[100] },
}

function formatPrice(n: number): string {
  return n.toLocaleString('fr-FR')
}

interface ProductDetailScreenProps {
  productId: string
  onGoBack: () => void
  onEdit: (productId: string) => void
}

export function ProductDetailScreen({ productId, onGoBack, onEdit }: ProductDetailScreenProps) {
  const { semantic } = useTheme()
  const tabBarHeight = useBottomTabBarHeight()
  const [product, setProduct] = useState<ProductDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPhoto, setSelectedPhoto] = useState(0)
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await apiFetch(`/api/products/${productId}`)
        if (res.ok) {
          setProduct(await res.json())
        }
      }
      catch {
        // ignore
      }
      finally {
        setLoading(false)
      }
    }
    load()
  }, [productId])

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: semantic.bgPage }]}>
        <ActivityIndicator size="large" color={colors.green[400]} />
      </View>
    )
  }

  if (!product) {
    return (
      <View style={[styles.center, { backgroundColor: semantic.bgPage }]}>
        <Text style={[styles.emptyText, { color: semantic.textTertiary }]}>Produit introuvable</Text>
        <TouchableOpacity onPress={onGoBack} style={styles.backLink}>
          <Text style={[styles.backLinkText, { color: semantic.textPrimaryColor }]}>Retour</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const hasPromotion = product.promotionalPrice != null && product.promotionalPrice < product.pricePerUnit
  const discountPercent = hasPromotion ? Math.round((1 - product.promotionalPrice! / product.pricePerUnit) * 100) : 0
  const activePrice = selectedVariant?.pricePerUnit ?? (hasPromotion ? product.promotionalPrice! : product.pricePerUnit)
  const activeStock = selectedVariant?.stock ?? product.stock
  const isOutOfStock = activeStock === 0 || product.status === 'OUT_OF_STOCK'
  const unitLabel = UNIT_LABELS[product.unit] ?? product.unit
  const statusInfo = STATUS_LABELS[product.status] ?? STATUS_LABELS.ACTIVE

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: semantic.bgPage }]}
      contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + spacing[6] }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onGoBack} hitSlop={8}>
          <ArrowLeft size={24} color={semantic.textPrimary} strokeWidth={2} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onEdit(product.id)} hitSlop={8}>
          <Edit size={20} color={semantic.textPrimaryColor} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {/* Photo */}
      {product.photos.length > 0
        ? (
            <View>
              <Image
                source={{ uri: product.photos[selectedPhoto] }}
                style={styles.mainPhoto}
                resizeMode="cover"
              />
              {hasPromotion && !selectedVariant && (
                <View style={styles.promoBadge}>
                  <Text style={styles.promoBadgeText}>
                    -
                    {discountPercent}
                    %
                  </Text>
                </View>
              )}
              {product.photos.length > 1 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbnailRow} contentContainerStyle={styles.thumbnailContent}>
                  {product.photos.map((url, i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => setSelectedPhoto(i)}
                      style={[styles.thumbnail, i === selectedPhoto && styles.thumbnailActive]}
                    >
                      <Image source={{ uri: url }} style={styles.thumbnailImage} resizeMode="cover" />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          )
        : (
            <View style={[styles.mainPhoto, styles.photoPlaceholder]}>
              <Text style={styles.photoPlaceholderText}>{product.name.charAt(0).toUpperCase()}</Text>
            </View>
          )}

      {/* Info */}
      <View style={styles.infoSection}>
        {/* Category + Status */}
        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: semantic.bgSurface }]}>
            <Tag size={12} color={semantic.textSecondary} />
            <Text style={[styles.badgeText, { color: semantic.textSecondary }]}>{product.categoryName}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: statusInfo.bg }]}>
            <Text style={[styles.badgeText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
          </View>
        </View>

        {/* Name */}
        <Text style={[styles.productName, { color: semantic.textPrimary }]}>{product.name}</Text>

        {/* Price */}
        <View style={styles.priceRow}>
          <Text style={styles.price}>
            {formatPrice(activePrice)}
            {' '}
            FCFA
          </Text>
          <Text style={[styles.priceUnit, { color: semantic.textTertiary }]}>
            /
            {unitLabel}
          </Text>
        </View>
        {hasPromotion && !selectedVariant && (
          <Text style={styles.originalPrice}>
            {formatPrice(product.pricePerUnit)}
            {' '}
            FCFA
          </Text>
        )}

        {/* Variants */}
        {product.variants.length > 0 && (
          <View style={styles.variantsSection}>
            <Text style={[styles.sectionLabel, { color: semantic.textSecondary }]}>Variantes</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <TouchableOpacity
                onPress={() => setSelectedVariant(null)}
                style={[styles.variantChip, !selectedVariant && styles.variantChipActive]}
              >
                <Text style={[styles.variantChipText, !selectedVariant && styles.variantChipTextActive]}>
                  Standard
                </Text>
              </TouchableOpacity>
              {product.variants.map(v => (
                <TouchableOpacity
                  key={v.id}
                  onPress={() => setSelectedVariant(v)}
                  disabled={v.stock === 0}
                  style={[
                    styles.variantChip,
                    selectedVariant?.id === v.id && styles.variantChipActive,
                    v.stock === 0 && styles.variantChipDisabled,
                  ]}
                >
                  <Text style={[
                    styles.variantChipText,
                    selectedVariant?.id === v.id && styles.variantChipTextActive,
                  ]}
                  >
                    {v.label}
                    {' '}
                    —
                    {formatPrice(v.pricePerUnit)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Stock */}
        <View style={styles.stockRow}>
          <Box size={16} color={isOutOfStock ? colors.coral[600] : colors.green[600]} />
          <Text style={[styles.stockText, { color: isOutOfStock ? colors.coral[600] : colors.green[600] }]}>
            {isOutOfStock ? 'En rupture de stock' : `En stock — ${activeStock} ${unitLabel}`}
          </Text>
        </View>

        {/* Description */}
        {product.description && (
          <View style={styles.descriptionSection}>
            <Text style={[styles.sectionLabel, { color: semantic.textSecondary }]}>Description</Text>
            <Text style={[styles.description, { color: semantic.textPrimary }]}>{product.description}</Text>
          </View>
        )}

        {/* Meta */}
        <View style={styles.metaRow}>
          <Text style={[styles.metaText, { color: semantic.textTertiary }]}>
            Créé le
            {' '}
            {new Date(product.createdAt).toLocaleDateString('fr-FR')}
          </Text>
          <Text style={[styles.metaText, { color: semantic.textTertiary }]}>
            Modifié le
            {' '}
            {new Date(product.updatedAt).toLocaleDateString('fr-FR')}
          </Text>
        </View>

        {/* Edit button */}
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => onEdit(product.id)}
          activeOpacity={0.8}
        >
          <Edit size={18} color={colors.neutral[0]} />
          <Text style={styles.editButtonText}>Modifier le produit</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: spacing[10] },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { ...typography.bodyL },
  backLink: { marginTop: spacing[4] },
  backLinkText: { ...typography.bodyS, fontFamily: fonts.sansSb },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },

  mainPhoto: { width: '100%', height: 300 },
  photoPlaceholder: {
    backgroundColor: colors.neutral[100],
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoPlaceholderText: { fontFamily: fonts.sansBd, fontSize: 48, color: colors.neutral[400] },

  promoBadge: {
    position: 'absolute',
    left: spacing[4],
    top: spacing[4],
    backgroundColor: colors.coral[400],
    borderRadius: radius.pill,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  promoBadgeText: { fontFamily: fonts.sansBd, fontSize: 14, color: colors.neutral[0] },

  thumbnailRow: { marginTop: spacing[3] },
  thumbnailContent: { paddingHorizontal: spacing[4], gap: spacing[2] },
  thumbnail: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    overflow: 'hidden',
    opacity: 0.5,
  },
  thumbnailActive: { opacity: 1, borderWidth: 2, borderColor: colors.green[400] },
  thumbnailImage: { width: '100%', height: '100%' },

  infoSection: { paddingHorizontal: spacing[4], paddingTop: spacing[5] },

  badgeRow: { flexDirection: 'row', gap: spacing[2], marginBottom: spacing[3] },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: radius.sm,
  },
  badgeText: { ...typography.caption },

  productName: { ...typography.h1, marginBottom: spacing[3] },

  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing[2] },
  price: { fontFamily: fonts.mono, fontSize: 28, fontWeight: '800', color: colors.green[600] },
  priceUnit: { ...typography.bodyL },
  originalPrice: {
    fontFamily: fonts.mono,
    fontSize: 14,
    color: colors.neutral[400],
    textDecorationLine: 'line-through',
    marginTop: spacing[1],
  },

  variantsSection: { marginTop: spacing[5] },
  sectionLabel: { ...typography.caption, fontFamily: fonts.sansSb, marginBottom: spacing[2] },
  variantChip: {
    borderWidth: 1.5,
    borderColor: colors.neutral[200],
    borderRadius: radius.lg,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    marginRight: spacing[2],
  },
  variantChipActive: { borderColor: colors.green[400], backgroundColor: colors.green[50] },
  variantChipDisabled: { opacity: 0.4 },
  variantChipText: { ...typography.bodyS, fontFamily: fonts.sansMd, color: colors.neutral[600] },
  variantChipTextActive: { color: colors.green[800] },

  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginTop: spacing[5],
  },
  stockText: { ...typography.bodyS, fontFamily: fonts.sansMd },

  descriptionSection: { marginTop: spacing[5] },
  description: { ...typography.bodyL, lineHeight: 15 * 1.7 },

  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing[6],
    paddingTop: spacing[4],
    borderTopWidth: 1,
    borderTopColor: colors.neutral[100],
  },
  metaText: { ...typography.caption },

  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    marginTop: spacing[6],
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.green[400],
  },
  editButtonText: { ...typography.h3, color: colors.neutral[0] },
})
