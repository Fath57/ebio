import type { DeliveryItem } from '../types'
import Gift from 'lucide-react-native/dist/esm/icons/gift'
import Package from 'lucide-react-native/dist/esm/icons/package'
import { useState } from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'
import { colors, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'

interface DeliveryItemsCardProps {
  items: DeliveryItem[]
  /** Shown while the item lines are unknown (older API): at least the count. */
  itemsCount: number
}

/**
 * What the courier carries, line by line — to check the bag at the shop
 * counter before leaving, and to know in advance whether it fits the bike.
 */
export function DeliveryItemsCard({ items, itemsCount }: DeliveryItemsCardProps) {
  const { semantic } = useTheme()
  const units = items.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <View style={[styles.card, { backgroundColor: semantic.bgCard }]}>
      <Text style={[styles.title, { color: semantic.textPrimary }]}>À récupérer</Text>
      <Text style={[styles.subtitle, { color: semantic.textSecondary }]}>
        {items.length > 0
          ? `${items.length} produit${items.length > 1 ? 's' : ''} · ${units} article${units > 1 ? 's' : ''}`
          : `${itemsCount} article${itemsCount > 1 ? 's' : ''}`}
      </Text>
      {items.map((item, index) => (
        <DeliveryItemRow
          // eslint-disable-next-line react/no-array-index-key -- lines have no id of their own; a gift repeats its product
          key={`${item.name}-${item.variantLabel ?? ''}-${index}`}
          item={item}
        />
      ))}
    </View>
  )
}

/** One line of the load: thumbnail, name, format, quantity. */
export function DeliveryItemRow({ item }: { item: DeliveryItem }) {
  const { semantic } = useTheme()
  const [broken, setBroken] = useState(false)

  return (
    <View style={[styles.row, { borderTopColor: semantic.borderLight }]}>
      {item.photo && !broken
        ? (
            <Image
              source={{ uri: item.photo }}
              style={[styles.photo, { backgroundColor: semantic.bgSurface }]}
              resizeMode="contain"
              onError={() => setBroken(true)}
              accessibilityIgnoresInvertColors
            />
          )
        : (
            <View style={[styles.photo, styles.photoFallback, { backgroundColor: semantic.bgSurface }]}>
              <Package size={18} color={semantic.textTertiary} />
            </View>
          )}
      <View style={styles.rowText}>
        <Text style={[styles.name, { color: semantic.textPrimary }]} numberOfLines={2}>{item.name}</Text>
        {item.variantLabel
          ? <Text style={[styles.variant, { color: semantic.textSecondary }]}>{item.variantLabel}</Text>
          : null}
        {item.isGift
          ? (
              <View style={styles.gift}>
                <Gift size={12} color={colors.earth[600]} />
                <Text style={[styles.giftText, { color: colors.earth[600] }]}>Offert</Text>
              </View>
            )
          : null}
      </View>
      <Text style={[styles.quantity, { color: semantic.textPrimary }]}>{`× ${item.quantity}`}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: spacing[4],
    marginBottom: spacing[3],
  },
  title: {
    ...typography.h3,
  },
  subtitle: {
    ...typography.caption,
    marginTop: spacing[1],
    marginBottom: spacing[2],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[2],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  photo: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
  },
  photoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  name: {
    ...typography.bodyS,
    fontFamily: typography.h3.fontFamily,
  },
  variant: {
    ...typography.caption,
  },
  gift: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    marginTop: spacing[1],
  },
  giftText: {
    ...typography.caption,
  },
  quantity: {
    ...typography.price,
  },
})
