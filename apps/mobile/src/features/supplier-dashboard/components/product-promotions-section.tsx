import type { LucideIcon } from 'lucide-react-native'
import Gift from 'lucide-react-native/dist/esm/icons/gift'
import Minus from 'lucide-react-native/dist/esm/icons/minus'
import Plus from 'lucide-react-native/dist/esm/icons/plus'
import Tag from 'lucide-react-native/dist/esm/icons/tag'
import Trash2 from 'lucide-react-native/dist/esm/icons/trash-2'
import Truck from 'lucide-react-native/dist/esm/icons/truck'
import * as React from 'react'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { appAlert } from '../../common/components/app-alert'
import { formatPrice } from '../../search/components/search-result-card'

export type PromotionType = 'PRICE' | 'BOGO' | 'FREE_DELIVERY'

export interface ProductPromotion {
  id: string
  type: PromotionType
  promoPrice: number | null
  buyQty: number | null
  getQty: number | null
  startsAt: string
  endsAt: string | null
  createdBy: 'SUPPLIER' | 'PLATFORM'
  isActive: boolean
}

interface ProductPromotionsSectionProps {
  productId: string
  /** Current regular price of the product, used to validate and display the PRICE promo */
  regularPrice: number
}

const TYPE_OPTIONS: Array<{ key: PromotionType, label: string, icon: LucideIcon }> = [
  { key: 'PRICE', label: 'Prix promo', icon: Tag },
  { key: 'BOGO', label: '1 acheté 1 offert', icon: Gift },
  { key: 'FREE_DELIVERY', label: 'Livraison offerte', icon: Truck },
]

// null = no end date (the promotion stays until removed)
const DURATION_OPTIONS: Array<{ days: number | null, label: string }> = [
  { days: 7, label: '7 jours' },
  { days: 15, label: '15 jours' },
  { days: 30, label: '30 jours' },
  { days: null, label: 'Sans fin' },
]

const BOGO_MIN = 1
const BOGO_MAX = 20

function typeIcon(type: PromotionType): LucideIcon {
  return TYPE_OPTIONS.find(o => o.key === type)?.icon ?? Tag
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count > 1 ? 's' : ''}`
}

/** Human readable description of a promotion, e.g. "Prix promo : 1 000 FCFA au lieu de 2 200". */
export function describePromotion(promo: ProductPromotion, regularPrice: number): string {
  switch (promo.type) {
    case 'PRICE':
      return `Prix promo : ${formatPrice(promo.promoPrice ?? 0)} FCFA au lieu de ${formatPrice(regularPrice)}`
    case 'BOGO':
      return `${plural(promo.buyQty ?? 1, 'acheté')} = ${plural(promo.getQty ?? 1, 'offert')}`
    case 'FREE_DELIVERY':
      return 'Livraison offerte'
  }
}

function describeEnd(endsAt: string | null): string {
  if (!endsAt)
    return 'sans fin'
  const date = new Date(endsAt)
  if (Number.isNaN(date.getTime()))
    return 'sans fin'
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `jusqu'au ${day}/${month}`
}

/** Only promotions that are live right now are shown to the supplier. */
function isLive(promo: ProductPromotion): boolean {
  if (!promo.isActive)
    return false
  if (promo.endsAt && new Date(promo.endsAt).getTime() < Date.now())
    return false
  return true
}

async function readError(res: Response): Promise<string> {
  const body = await res.json().catch(() => null) as { message?: string, aggregateErrors?: Array<{ message?: string }> } | null
  return body?.aggregateErrors?.[0]?.message ?? body?.message ?? 'Une erreur est survenue'
}

interface StepperProps {
  label: string
  value: number
  onChange: (value: number) => void
}

function QtyStepper({ label, value, onChange }: StepperProps): React.ReactElement {
  const { semantic } = useTheme()
  const canDecrement = value > BOGO_MIN
  const canIncrement = value < BOGO_MAX
  return (
    <View style={styles.stepper}>
      <Text style={[styles.stepperLabel, { color: semantic.textTertiary }]}>{label}</Text>
      <View style={[styles.stepperControl, { borderColor: semantic.borderNormal, backgroundColor: semantic.bgSurface }]}>
        <TouchableOpacity
          style={[styles.stepperButton, !canDecrement && styles.disabled]}
          onPress={() => onChange(value - 1)}
          disabled={!canDecrement}
          accessibilityRole="button"
          accessibilityLabel={`Diminuer ${label}`}
        >
          <Minus size={16} color={semantic.textSecondary} />
        </TouchableOpacity>
        <Text style={[styles.stepperValue, { color: semantic.textPrimary }]}>{value}</Text>
        <TouchableOpacity
          style={[styles.stepperButton, !canIncrement && styles.disabled]}
          onPress={() => onChange(value + 1)}
          disabled={!canIncrement}
          accessibilityRole="button"
          accessibilityLabel={`Augmenter ${label}`}
        >
          <Plus size={16} color={semantic.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  )
}

export function ProductPromotionsSection({ productId, regularPrice }: ProductPromotionsSectionProps): React.ReactElement {
  const { semantic } = useTheme()
  const [promotions, setPromotions] = useState<ProductPromotion[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Inline "add" form
  const [formOpen, setFormOpen] = useState(false)
  const [type, setType] = useState<PromotionType>('PRICE')
  const [promoPrice, setPromoPrice] = useState('')
  const [buyQty, setBuyQty] = useState(1)
  const [getQty, setGetQty] = useState(1)
  const [durationDays, setDurationDays] = useState<number | null>(7)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    try {
      const res = await apiFetch(`/api/suppliers/me/products/${productId}/promotions`)
      if (!res.ok)
        return
      const list = await res.json().catch(() => []) as ProductPromotion[]
      setPromotions(Array.isArray(list) ? list.filter(isLive) : [])
    }
    catch {
      // Offline: the list simply stays as it was
    }
    finally {
      setLoading(false)
    }
  }, [productId])

  useEffect(() => {
    void load()
  }, [load])

  function resetForm(): void {
    setFormOpen(false)
    setType('PRICE')
    setPromoPrice('')
    setBuyQty(1)
    setGetQty(1)
    setDurationDays(7)
  }

  async function remove(promotionId: string): Promise<void> {
    setDeletingId(promotionId)
    try {
      const res = await apiFetch(`/api/suppliers/me/products/${productId}/promotions/${promotionId}`, { method: 'DELETE' })
      if (!res.ok) {
        appAlert('Suppression impossible', await readError(res))
        return
      }
      await load()
    }
    catch {
      appAlert('Erreur', 'Impossible de retirer la promotion. Vérifiez votre connexion.')
    }
    finally {
      setDeletingId(null)
    }
  }

  function confirmRemove(promo: ProductPromotion): void {
    appAlert(
      'Retirer la promotion ?',
      `« ${describePromotion(promo, regularPrice)} » ne sera plus proposée aux clients.`,
      [
        { text: 'Retirer', style: 'destructive', onPress: () => {
          void remove(promo.id)
        } },
        { text: 'Annuler', style: 'cancel' },
      ],
    )
  }

  /** Client-side mirror of the API rules; returns a French error or null. */
  function validate(): string | null {
    if (type === 'PRICE') {
      const value = Number.parseFloat(promoPrice.replace(',', '.'))
      if (Number.isNaN(value) || value <= 0)
        return 'Saisissez un prix promo valide.'
      if (regularPrice > 0 && value >= regularPrice)
        return `Le prix promo doit être inférieur au prix normal (${formatPrice(regularPrice)} FCFA).`
    }
    if (type === 'BOGO') {
      if (buyQty < BOGO_MIN || buyQty > BOGO_MAX || getQty < BOGO_MIN || getQty > BOGO_MAX)
        return `Les quantités doivent être comprises entre ${BOGO_MIN} et ${BOGO_MAX}.`
    }
    return null
  }

  async function submit(): Promise<void> {
    const error = validate()
    if (error) {
      appAlert('Promotion invalide', error)
      return
    }
    const body: Record<string, unknown> = { type }
    if (type === 'PRICE')
      body.promoPrice = Number.parseFloat(promoPrice.replace(',', '.'))
    if (type === 'BOGO') {
      body.buyQty = buyQty
      body.getQty = getQty
    }
    if (durationDays != null)
      body.endsAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString()

    setSubmitting(true)
    try {
      const res = await apiFetch(`/api/suppliers/me/products/${productId}/promotions`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        appAlert('Promotion non ajoutée', await readError(res))
        return
      }
      resetForm()
      await load()
    }
    catch {
      appAlert('Erreur', 'Impossible d\'ajouter la promotion. Vérifiez votre connexion.')
    }
    finally {
      setSubmitting(false)
    }
  }

  return (
    <View>
      <View style={styles.sectionHeader}>
        <Text style={[styles.label, { color: semantic.textSecondary }]}>Promotions</Text>
        {!formOpen && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setFormOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Ajouter une promotion"
          >
            <Text style={[styles.addButtonText, { color: semantic.colorPrimary }]}>+ Ajouter une promotion</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading && (
        <ActivityIndicator size="small" color={colors.green[400]} style={styles.loader} />
      )}

      {!loading && promotions.length === 0 && !formOpen && (
        <Text style={[styles.emptyText, { color: semantic.textTertiary }]}>
          Aucune promotion en cours sur ce produit.
        </Text>
      )}

      {promotions.map((promo) => {
        const Icon = typeIcon(promo.type)
        const isPlatform = promo.createdBy === 'PLATFORM'
        const isDeleting = deletingId === promo.id
        return (
          <View
            key={promo.id}
            style={[styles.row, { borderColor: semantic.borderNormal, backgroundColor: semantic.bgSurface }]}
          >
            <View style={[styles.rowIcon, { backgroundColor: semantic.bgPrimaryLight }]}>
              <Icon size={18} color={semantic.colorPrimary} />
            </View>
            <View style={styles.rowBody}>
              <Text style={[styles.rowTitle, { color: semantic.textPrimary }]}>
                {describePromotion(promo, regularPrice)}
              </Text>
              <View style={styles.rowMeta}>
                <Text style={[styles.rowDate, { color: semantic.textTertiary }]}>{describeEnd(promo.endsAt)}</Text>
                {isPlatform && (
                  <View style={styles.platformBadge}>
                    <Text style={styles.platformBadgeText}>Promo eBio</Text>
                  </View>
                )}
              </View>
            </View>
            {!isPlatform && (
              <TouchableOpacity
                style={[styles.trashButton, isDeleting && styles.disabled]}
                onPress={() => confirmRemove(promo)}
                disabled={isDeleting}
                accessibilityRole="button"
                accessibilityLabel="Retirer la promotion"
              >
                {isDeleting
                  ? <ActivityIndicator size="small" color={colors.coral[600]} />
                  : <Trash2 size={18} color={colors.coral[600]} />}
              </TouchableOpacity>
            )}
          </View>
        )
      })}

      {formOpen && (
        <View style={[styles.form, { borderColor: semantic.borderNormal, backgroundColor: semantic.bgSurface }]}>
          <Text style={[styles.formLabel, { color: semantic.textSecondary }]}>Type de promotion</Text>
          <View style={styles.chipWrap} accessibilityRole="radiogroup">
            {TYPE_OPTIONS.map((option) => {
              const isSelected = type === option.key
              const OptionIcon = option.icon
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.chip,
                    { borderColor: semantic.borderNormal, backgroundColor: semantic.bgPage },
                    isSelected && styles.chipActive,
                  ]}
                  onPress={() => setType(option.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={option.label}
                >
                  <OptionIcon size={14} color={isSelected ? colors.green[800] : semantic.textSecondary} />
                  <Text style={[styles.chipText, { color: semantic.textSecondary }, isSelected && styles.chipTextActive]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          {type === 'PRICE' && (
            <View>
              <Text style={[styles.formLabel, { color: semantic.textSecondary }]}>
                Prix promo (FCFA) — prix normal :
                {' '}
                {formatPrice(regularPrice)}
                {' '}
                FCFA
              </Text>
              <TextInput
                style={[styles.textInput, { borderColor: semantic.borderNormal, color: semantic.textPrimary, backgroundColor: semantic.bgPage }]}
                placeholder="Prix promo (FCFA)"
                placeholderTextColor={semantic.textTertiary}
                keyboardType="numeric"
                value={promoPrice}
                onChangeText={setPromoPrice}
                accessibilityLabel="Prix promo"
              />
            </View>
          )}

          {type === 'BOGO' && (
            <View style={styles.stepperRow}>
              <QtyStepper label="Achetés" value={buyQty} onChange={setBuyQty} />
              <QtyStepper label="Offerts" value={getQty} onChange={setGetQty} />
            </View>
          )}

          <Text style={[styles.formLabel, { color: semantic.textSecondary }]}>Durée</Text>
          <View style={styles.chipWrap} accessibilityRole="radiogroup">
            {DURATION_OPTIONS.map((option) => {
              const isSelected = durationDays === option.days
              return (
                <TouchableOpacity
                  key={option.label}
                  style={[
                    styles.chip,
                    { borderColor: semantic.borderNormal, backgroundColor: semantic.bgPage },
                    isSelected && styles.chipActive,
                  ]}
                  onPress={() => setDurationDays(option.days)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={option.label}
                >
                  <Text style={[styles.chipText, { color: semantic.textSecondary }, isSelected && styles.chipTextActive]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          <View style={styles.formActions}>
            <TouchableOpacity
              style={[styles.cancelButton, { borderColor: semantic.borderNormal }]}
              onPress={resetForm}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel="Annuler"
            >
              <Text style={[styles.cancelButtonText, { color: semantic.textSecondary }]}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitButton, submitting && styles.disabled]}
              onPress={submit}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel="Ajouter la promotion"
            >
              {submitting
                ? <ActivityIndicator size="small" color={colors.neutral[0]} />
                : <Text style={styles.submitButtonText}>Ajouter</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing[3],
  },
  label: {
    ...typography.caption,
  },
  addButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing[2],
  },
  addButtonText: {
    fontFamily: fonts.sansSb,
    fontSize: 13,
  },
  loader: {
    marginTop: spacing[2],
    alignSelf: 'flex-start',
  },
  emptyText: {
    ...typography.bodyS,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing[2],
    paddingLeft: spacing[3],
    paddingRight: spacing[1],
    marginTop: spacing[1],
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontFamily: fonts.sansSb,
    fontSize: 14,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  rowDate: {
    ...typography.caption,
  },
  platformBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    backgroundColor: colors.earth[50],
  },
  platformBadgeText: {
    fontFamily: fonts.sansSb,
    fontSize: 10,
    color: colors.earth[600],
  },
  trashButton: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  form: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing[3],
    marginTop: spacing[2],
    gap: spacing[1],
  },
  formLabel: {
    ...typography.caption,
    marginTop: spacing[2],
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[1],
    marginTop: spacing[1],
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    minHeight: 40,
    paddingHorizontal: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  chipActive: {
    backgroundColor: colors.green[50],
    borderColor: colors.green[400],
  },
  chipText: {
    fontFamily: fonts.sansMd,
    fontSize: 13,
  },
  chipTextActive: {
    color: colors.green[800],
  },
  textInput: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    fontFamily: fonts.mono,
    fontSize: 15,
    marginTop: spacing[1],
  },
  stepperRow: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[2],
  },
  stepper: {
    flex: 1,
    gap: 4,
  },
  stepperLabel: {
    fontFamily: fonts.sansMd,
    fontSize: 11,
  },
  stepperControl: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: radius.md,
    minHeight: 44,
  },
  stepperButton: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperValue: {
    fontFamily: fonts.mono,
    fontSize: 16,
    minWidth: 32,
    textAlign: 'center',
  },
  formActions: {
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[3],
  },
  cancelButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontFamily: fonts.sansMd,
    fontSize: 14,
  },
  submitButton: {
    flex: 2,
    minHeight: 44,
    backgroundColor: colors.green[400],
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitButtonText: {
    fontFamily: fonts.sansSb,
    fontSize: 14,
    color: colors.neutral[0],
  },
  disabled: {
    opacity: 0.5,
  },
})
