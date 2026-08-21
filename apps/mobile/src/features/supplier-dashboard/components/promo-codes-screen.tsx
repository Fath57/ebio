import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs'
import Plus from 'lucide-react-native/dist/esm/icons/plus'
import TicketPercent from 'lucide-react-native/dist/esm/icons/ticket-percent'
import Trash2 from 'lucide-react-native/dist/esm/icons/trash-2'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
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
import { ScreenHeader } from '../../common/components/screen-header'

interface PromoCodeItem {
  id: string
  code: string
  type: 'PERCENT' | 'FIXED'
  value: number
  maxDiscount: number | null
  minOrderAmount: number
  expiresAt: string | null
  maxUses: number | null
  maxUsesPerUser: number
  useCount: number
  isActive: boolean
}

function discountLabel(promo: PromoCodeItem): string {
  return promo.type === 'PERCENT'
    ? `−${promo.value} %${promo.maxDiscount ? ` (max ${promo.maxDiscount.toLocaleString('fr-FR')} F)` : ''}`
    : `−${promo.value.toLocaleString('fr-FR')} FCFA`
}

interface PromoCodesScreenProps {
  onGoBack: () => void
}

/** The shop's own promo codes: list, create, pause, retire. */
export function PromoCodesScreen({ onGoBack }: PromoCodesScreenProps) {
  const { semantic } = useTheme()
  const tabBarHeight = use(BottomTabBarHeightContext) ?? 0
  const [items, setItems] = useState<PromoCodeItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [code, setCode] = useState('')
  const [type, setType] = useState<'PERCENT' | 'FIXED'>('PERCENT')
  const [value, setValue] = useState('10')
  const [minOrder, setMinOrder] = useState('')
  const [maxUses, setMaxUses] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/suppliers/me/promo-codes')
      if (res.ok) {
        const data = await res.json() as { items: PromoCodeItem[] }
        setItems(data.items)
      }
    }
    catch {
      // pull-to-refresh retries
    }
    finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function readError(res: Response): Promise<string> {
    const body = await res.json().catch(() => null) as { message?: string, aggregateErrors?: Array<{ message?: string }> } | null
    return body?.aggregateErrors?.[0]?.message ?? body?.message ?? 'Une erreur est survenue'
  }

  const submit = useCallback(async () => {
    setIsSubmitting(true)
    try {
      const res = await apiFetch('/api/suppliers/me/promo-codes', {
        method: 'POST',
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          type,
          value: Number(value),
          minOrderAmount: minOrder ? Number(minOrder) : 0,
          maxUses: maxUses ? Number(maxUses) : null,
          maxUsesPerUser: 1,
        }),
      })
      if (!res.ok) {
        appAlert('Création impossible', await readError(res))
        return
      }
      setIsCreating(false)
      setCode('')
      setValue('10')
      setMinOrder('')
      setMaxUses('')
      load()
    }
    finally {
      setIsSubmitting(false)
    }
  }, [code, type, value, minOrder, maxUses, load])

  const toggleActive = useCallback(async (promo: PromoCodeItem) => {
    const res = await apiFetch(`/api/suppliers/me/promo-codes/${promo.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: !promo.isActive }),
    })
    if (!res.ok) {
      appAlert('Erreur', await readError(res))
      return
    }
    load()
  }, [load])

  const remove = useCallback(async (promo: PromoCodeItem) => {
    const res = await apiFetch(`/api/suppliers/me/promo-codes/${promo.id}`, { method: 'DELETE' })
    if (!res.ok) {
      appAlert('Erreur', await readError(res))
      return
    }
    load()
  }, [load])

  const isFormValid = code.trim().length >= 3
    && Number(value) > 0
    && (type !== 'PERCENT' || Number(value) <= 100)

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: semantic.bgPage }]}>
        <ActivityIndicator size="large" color={colors.green[400]} />
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader title="Codes promo" onBack={onGoBack} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + spacing[10] }]}
        refreshControl={(
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              setIsRefreshing(true)
              load()
            }}
          />
        )}
      >
        <Text style={[styles.intro, { color: semantic.textTertiary }]}>
          La remise porte sur les articles, jamais sur la livraison, et vient de
          votre marge. Un code utilisé ne peut plus être supprimé, seulement
          désactivé.
        </Text>

        <TouchableOpacity style={styles.addButton} onPress={() => setIsCreating(true)} activeOpacity={0.8}>
          <Plus size={16} color={colors.neutral[0]} strokeWidth={2.5} />
          <Text style={styles.addButtonText}>Nouveau code</Text>
        </TouchableOpacity>

        {items.length === 0
          ? (
              <View style={[styles.emptyCard, { backgroundColor: semantic.bgCard }]}>
                <TicketPercent size={28} color={semantic.textTertiary} />
                <Text style={[styles.emptyText, { color: semantic.textSecondary }]}>
                  Aucun code promo. Créez-en un pour animer vos ventes.
                </Text>
              </View>
            )
          : items.map(promo => (
              <View key={promo.id} style={[styles.card, { backgroundColor: semantic.bgCard }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.code, { color: semantic.textPrimary }]}>{promo.code}</Text>
                  <Text style={[styles.discount, { color: colors.green[600] }]}>{discountLabel(promo)}</Text>
                  <Text style={[styles.meta, { color: semantic.textTertiary }]}>
                    {promo.useCount}
                    {promo.maxUses !== null ? ` / ${promo.maxUses}` : ''}
                    {' '}
                    utilisation
                    {promo.useCount > 1 ? 's' : ''}
                    {promo.minOrderAmount > 0 ? ` · dès ${promo.minOrderAmount.toLocaleString('fr-FR')} F` : ''}
                  </Text>
                </View>
                <Switch
                  value={promo.isActive}
                  onValueChange={() => toggleActive(promo)}
                  trackColor={{ true: colors.green[400], false: colors.neutral[200] }}
                  thumbColor={colors.neutral[0]}
                />
                <TouchableOpacity onPress={() => remove(promo)} hitSlop={8}>
                  <Trash2 size={16} color={colors.coral[400]} />
                </TouchableOpacity>
              </View>
            ))}
      </ScrollView>

      <Modal visible={isCreating} transparent animationType="slide" onRequestClose={() => setIsCreating(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={[styles.modalCard, { backgroundColor: semantic.bgCard }]}>
            <Text style={[styles.modalTitle, { color: semantic.textPrimary }]}>Nouveau code promo</Text>
            <Text style={[styles.inputLabel, { color: semantic.textSecondary }]}>Code</Text>
            <TextInput
              style={[styles.input, { color: semantic.textPrimary, backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }]}
              placeholder="BIO10"
              placeholderTextColor={semantic.textTertiary}
              autoCapitalize="characters"
              autoCorrect={false}
              value={code}
              onChangeText={setCode}
            />
            <Text style={[styles.inputLabel, { color: semantic.textSecondary }]}>Type de remise</Text>
            <View style={styles.typeRow}>
              {(['PERCENT', 'FIXED'] as const).map(option => (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.typeChip,
                    {
                      backgroundColor: semantic.bgSurface,
                      borderColor: type === option ? colors.green[400] : semantic.borderNormal,
                    },
                  ]}
                  onPress={() => setType(option)}
                >
                  <Text style={[styles.typeChipText, { color: semantic.textPrimary }]}>
                    {option === 'PERCENT' ? 'Pourcentage' : 'Montant fixe'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.inputLabel, { color: semantic.textSecondary }]}>
              {type === 'PERCENT' ? 'Pourcentage (%)' : 'Montant (FCFA)'}
            </Text>
            <TextInput
              style={[styles.input, { color: semantic.textPrimary, backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }]}
              keyboardType="number-pad"
              value={value}
              onChangeText={setValue}
            />
            <Text style={[styles.inputLabel, { color: semantic.textSecondary }]}>Minimum d'articles (FCFA, optionnel)</Text>
            <TextInput
              style={[styles.input, { color: semantic.textPrimary, backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }]}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={semantic.textTertiary}
              value={minOrder}
              onChangeText={setMinOrder}
            />
            <Text style={[styles.inputLabel, { color: semantic.textSecondary }]}>Utilisations maximum (optionnel)</Text>
            <TextInput
              style={[styles.input, { color: semantic.textPrimary, backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }]}
              keyboardType="number-pad"
              placeholder="Illimité"
              placeholderTextColor={semantic.textTertiary}
              value={maxUses}
              onChangeText={setMaxUses}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setIsCreating(false)}>
                <Text style={[styles.modalCancelText, { color: semantic.textSecondary }]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, (isSubmitting || !isFormValid) && { opacity: 0.5 }]}
                disabled={isSubmitting || !isFormValid}
                onPress={submit}
              >
                {isSubmitting
                  ? <ActivityIndicator size="small" color={colors.neutral[0]} />
                  : <Text style={styles.modalConfirmText}>Créer</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing[4] },
  intro: { ...typography.bodyS, marginBottom: spacing[4] },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    backgroundColor: colors.green[400],
    borderRadius: radius.md,
    paddingVertical: spacing[3],
    marginBottom: spacing[4],
  },
  addButtonText: { ...typography.h3, color: colors.neutral[0] },
  emptyCard: {
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[6],
    borderRadius: radius.lg,
  },
  emptyText: { ...typography.bodyS, textAlign: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[4],
    borderRadius: radius.lg,
    marginBottom: spacing[2],
  },
  code: { ...typography.h3, fontFamily: fonts.mono },
  discount: { ...typography.bodyS, fontFamily: fonts.sansSb, marginTop: 2 },
  meta: { ...typography.caption, marginTop: 2 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing[5],
    paddingBottom: spacing[8],
    gap: spacing[1],
  },
  modalTitle: { ...typography.h2, marginBottom: spacing[2] },
  inputLabel: { ...typography.caption, marginTop: spacing[2] },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    ...typography.bodyL,
  },
  typeRow: { flexDirection: 'row', gap: spacing[2] },
  typeChip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing[2],
    alignItems: 'center',
  },
  typeChipText: { ...typography.bodyS, fontFamily: fonts.sansSb },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing[3],
    marginTop: spacing[4],
  },
  modalCancel: { paddingVertical: spacing[3], paddingHorizontal: spacing[4] },
  modalCancelText: { ...typography.h3 },
  modalConfirm: {
    backgroundColor: colors.green[400],
    borderRadius: radius.md,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[5],
    minWidth: 110,
    alignItems: 'center',
  },
  modalConfirmText: { ...typography.h3, color: colors.neutral[0] },
})
