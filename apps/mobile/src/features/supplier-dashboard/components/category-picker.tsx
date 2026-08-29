import type { ComponentType } from 'react'
import Check from 'lucide-react-native/dist/esm/icons/check'
import ChevronDown from 'lucide-react-native/dist/esm/icons/chevron-down'
import Search from 'lucide-react-native/dist/esm/icons/search'
import X from 'lucide-react-native/dist/esm/icons/x'
import { useMemo, useState } from 'react'
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'

interface PickerCategory {
  id: string
  label: string
  imageUrl: string | null
  fallbackIcon: ComponentType<{ size?: number, color?: string }>
}

interface CategoryPickerFieldProps {
  categories: PickerCategory[]
  value: string | null
  onChange: (categoryId: string) => void
}

/** Accent- and case-insensitive match so « legume » finds « Légumes ». */
function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036F]/g, '').toLowerCase().trim()
}

/**
 * Category field for the product form: a single row showing the current
 * choice, opening a searchable full-screen list. Scales to hundreds of
 * categories where the former chip grid did not.
 */
export function CategoryPickerField({ categories, value, onChange }: CategoryPickerFieldProps) {
  const { semantic } = useTheme()
  const insets = useSafeAreaInsets()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = categories.find(cat => cat.id === value) ?? null

  const filtered = useMemo(() => {
    const needle = normalize(query)
    if (!needle) {
      return categories
    }
    return categories.filter(cat => normalize(cat.label).includes(needle))
  }, [categories, query])

  function close() {
    setOpen(false)
    setQuery('')
  }

  function pick(id: string) {
    onChange(id)
    close()
  }

  const renderItem = ({ item }: { item: PickerCategory }) => {
    const isSelected = item.id === value
    const Icon = item.fallbackIcon
    return (
      <TouchableOpacity
        style={[styles.row, { borderBottomColor: semantic.borderNormal }, isSelected && { backgroundColor: colors.green[50] }]}
        onPress={() => pick(item.id)}
        accessibilityRole="radio"
        accessibilityState={{ selected: isSelected }}
        accessibilityLabel={item.label}
      >
        {item.imageUrl
          ? <Image source={{ uri: item.imageUrl }} style={styles.rowImage} />
          : (
              <View style={[styles.rowIcon, { backgroundColor: semantic.bgSurface }]}>
                <Icon size={18} color={isSelected ? colors.green[800] : semantic.textSecondary} />
              </View>
            )}
        <Text style={[styles.rowLabel, { color: isSelected ? colors.green[800] : semantic.textPrimary }]} numberOfLines={1}>
          {item.label}
        </Text>
        {isSelected && <Check size={18} color={colors.green[600]} strokeWidth={2.5} />}
      </TouchableOpacity>
    )
  }

  return (
    <>
      <TouchableOpacity
        style={[styles.field, { borderColor: semantic.borderNormal, backgroundColor: semantic.bgSurface }]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={selected ? `Catégorie : ${selected.label}` : 'Choisir une catégorie'}
      >
        {selected
          ? (
              <View style={styles.fieldValue}>
                {selected.imageUrl
                  ? <Image source={{ uri: selected.imageUrl }} style={styles.fieldImage} />
                  : <selected.fallbackIcon size={16} color={colors.green[800]} />}
                <Text style={[styles.fieldText, { color: semantic.textPrimary }]} numberOfLines={1}>{selected.label}</Text>
              </View>
            )
          : <Text style={[styles.fieldText, { color: semantic.textTertiary }]}>Choisir une catégorie</Text>}
        <ChevronDown size={18} color={semantic.textTertiary} />
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" onRequestClose={close}>
        <View style={[styles.sheet, { backgroundColor: semantic.bgPage, paddingTop: insets.top }]}>
          <View style={[styles.header, { borderBottomColor: semantic.borderNormal }]}>
            <Text style={[styles.title, { color: semantic.textPrimary }]}>Catégorie</Text>
            <Pressable onPress={close} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fermer" style={styles.closeButton}>
              <X size={22} color={semantic.textSecondary} />
            </Pressable>
          </View>

          <View style={[styles.searchBox, { borderColor: semantic.borderNormal, backgroundColor: semantic.bgSurface }]}>
            <Search size={18} color={semantic.textTertiary} />
            <TextInput
              style={[styles.searchInput, { color: semantic.textPrimary }]}
              placeholder="Rechercher une catégorie"
              placeholderTextColor={semantic.textTertiary}
              value={query}
              onChangeText={setQuery}
              autoFocus
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Rechercher une catégorie"
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Effacer la recherche">
                <X size={16} color={semantic.textTertiary} />
              </Pressable>
            )}
          </View>

          <FlatList
            data={filtered}
            keyExtractor={item => item.id}
            renderItem={renderItem}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: insets.bottom + spacing[6] }}
            ListEmptyComponent={(
              <Text style={[styles.empty, { color: semantic.textTertiary }]}>
                Aucune catégorie ne correspond à «
                {query}
                »
              </Text>
            )}
          />
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  field: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing[1],
  },
  fieldValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    flex: 1,
  },
  fieldImage: {
    width: 20,
    height: 20,
    borderRadius: 4,
  },
  fieldText: {
    fontFamily: fonts.sansMd,
    fontSize: 15,
    flexShrink: 1,
  },
  sheet: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
  },
  title: {
    ...typography.h3,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    height: 48,
    margin: spacing[4],
    paddingHorizontal: spacing[3],
    borderWidth: 1,
    borderRadius: radius.md,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 15,
    height: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: 56,
    paddingHorizontal: spacing[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowImage: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    flex: 1,
    fontFamily: fonts.sansMd,
    fontSize: 15,
  },
  empty: {
    ...typography.bodyS,
    textAlign: 'center',
    padding: spacing[6],
  },
})
