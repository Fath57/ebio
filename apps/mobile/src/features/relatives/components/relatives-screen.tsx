import type { Relative } from '../relatives-api'
import { useFocusEffect } from '@react-navigation/native'
import MapPin from 'lucide-react-native/dist/esm/icons/map-pin'
import Pen from 'lucide-react-native/dist/esm/icons/pen'
import Phone from 'lucide-react-native/dist/esm/icons/phone'
import Plus from 'lucide-react-native/dist/esm/icons/plus'
import Trash2 from 'lucide-react-native/dist/esm/icons/trash-2'
import Users from 'lucide-react-native/dist/esm/icons/users'
import * as React from 'react'
import { useCallback, useState } from 'react'
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { colors, fonts, radius, shadows, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { appAlert } from '../../common/components/app-alert'
import { ScreenHeader } from '../../common/components/screen-header'
import { deleteRelative, MAX_RELATIVES, useRelatives } from '../relatives-api'

interface RelativesScreenProps {
  onBack: () => void
  /** Opens the form: empty to add, filled to edit. */
  onEdit: (relative: Relative | null) => void
}

interface RelativeCardProps {
  relative: Relative
  onEdit: (relative: Relative) => void
  onDelete: (relative: Relative) => void
}

function RelativeCard({ relative, onEdit, onDelete }: RelativeCardProps) {
  const { semantic } = useTheme()
  return (
    <View style={[styles.card, { backgroundColor: semantic.bgCard }]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitle}>
          <Text style={[styles.nickname, { color: semantic.textPrimary }]} numberOfLines={1}>{relative.nickname}</Text>
          <Text style={[styles.name, { color: semantic.textSecondary }]} numberOfLines={1}>{relative.name}</Text>
        </View>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => onEdit(relative)}
          accessibilityRole="button"
          accessibilityLabel={`Modifier ${relative.nickname}`}
        >
          <Pen size={18} color={semantic.textSecondary} strokeWidth={2} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => onDelete(relative)}
          accessibilityRole="button"
          accessibilityLabel={`Supprimer ${relative.nickname}`}
        >
          <Trash2 size={18} color={colors.coral[600]} strokeWidth={2} />
        </TouchableOpacity>
      </View>
      <View style={styles.detailRow}>
        <Phone size={14} color={semantic.textTertiary} strokeWidth={2} />
        <Text style={[styles.detail, { color: semantic.textSecondary }]}>{relative.phone}</Text>
      </View>
      <View style={styles.detailRow}>
        <MapPin size={14} color={semantic.textTertiary} strokeWidth={2} />
        <Text style={[styles.detail, { color: semantic.textSecondary }]} numberOfLines={2}>{relative.address}</Text>
      </View>
    </View>
  )
}

/**
 * « Mes proches » : the people the payer has baskets delivered to. Saved
 * once, picked again at checkout in one tap.
 */
export function RelativesScreen({ onBack, onEdit }: RelativesScreenProps) {
  const { semantic } = useTheme()
  const { relatives, isLoading, error, reload, setRelatives } = useRelatives(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const atLimit = relatives.length >= MAX_RELATIVES

  // Back from the form: the list reflects what was just saved.
  useFocusEffect(
    useCallback(() => {
      reload()
    }, [reload]),
  )

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    await reload()
    setIsRefreshing(false)
  }, [reload])

  const handleDelete = useCallback((relative: Relative) => {
    appAlert(
      `Supprimer ${relative.nickname} ?`,
      'Les commandes déjà passées pour ce proche ne changent pas.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            deleteRelative(relative.id).then((failure) => {
              if (failure) {
                appAlert('Suppression impossible', failure)
                return
              }
              setRelatives(current => current.filter(entry => entry.id !== relative.id))
            })
          },
        },
      ],
    )
  }, [setRelatives])

  const handleAdd = useCallback(() => {
    if (atLimit) {
      appAlert('Limite atteinte', `Vous pouvez enregistrer au plus ${MAX_RELATIVES} proches. Supprimez-en un pour en ajouter un autre.`)
      return
    }
    onEdit(null)
  }, [atLimit, onEdit])

  const renderItem = useCallback(({ item }: { item: Relative }) => (
    <RelativeCard relative={item} onEdit={onEdit} onDelete={handleDelete} />
  ), [onEdit, handleDelete])

  return (
    <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader
        title="Mes proches"
        subtitle={relatives.length > 0 ? `${relatives.length} sur ${MAX_RELATIVES}` : undefined}
        onBack={onBack}
      />

      {isLoading
        ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.green[600]} />
            </View>
          )
        : (
            <FlatList
              data={relatives}
              renderItem={renderItem}
              keyExtractor={item => item.id}
              contentContainerStyle={[styles.listContent, relatives.length === 0 && styles.listEmpty]}
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              ListEmptyComponent={(
                <View style={styles.centered}>
                  <View style={[styles.emptyIcon, { backgroundColor: semantic.bgPrimaryLight }]}>
                    <Users size={32} color={colors.green[600]} />
                  </View>
                  <Text style={[styles.emptyTitle, { color: semantic.textPrimary }]}>
                    {error ?? 'Aucun proche enregistré'}
                  </Text>
                  <Text style={[styles.emptyText, { color: semantic.textSecondary }]}>
                    Enregistrez les personnes à qui vous faites livrer au Bénin : vous les retrouverez au moment de commander.
                  </Text>
                </View>
              )}
            />
          )}

      <View style={[styles.footer, { borderTopColor: semantic.borderLight, backgroundColor: semantic.bgPage }]}>
        <TouchableOpacity
          style={[styles.addButton, atLimit && styles.addButtonDisabled]}
          onPress={handleAdd}
          accessibilityRole="button"
          accessibilityState={{ disabled: atLimit }}
        >
          <Plus size={18} color={colors.neutral[0]} strokeWidth={2.4} />
          <Text style={styles.addButtonText}>Ajouter un proche</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing[8],
    gap: spacing[3],
  },
  listContent: {
    padding: spacing[4],
    gap: spacing[3],
  },
  listEmpty: {
    flexGrow: 1,
  },
  card: {
    borderRadius: radius.lg,
    padding: spacing[4],
    gap: spacing[2],
    ...shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardTitle: {
    flex: 1,
  },
  nickname: {
    ...typography.h3,
  },
  name: {
    ...typography.bodyS,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
  },
  detail: {
    ...typography.bodyS,
    flex: 1,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    ...typography.h3,
    textAlign: 'center',
  },
  emptyText: {
    ...typography.bodyS,
    textAlign: 'center',
  },
  footer: {
    padding: spacing[4],
    borderTopWidth: 1,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.green[400],
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  addButtonText: {
    fontFamily: fonts.sansSb,
    fontSize: 15,
    color: colors.neutral[0],
  },
})
