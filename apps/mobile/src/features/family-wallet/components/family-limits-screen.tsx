import type { FamilyCategory, FamilyLimits, FamilyMember, FamilyWallet } from '../family-wallet-api'
import ChevronDown from 'lucide-react-native/dist/esm/icons/chevron-down'
import ChevronUp from 'lucide-react-native/dist/esm/icons/chevron-up'
import Square from 'lucide-react-native/dist/esm/icons/square'
import SquareCheck from 'lucide-react-native/dist/esm/icons/square-check'
import * as React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { appAlert } from '../../common/components/app-alert'
import { KeyboardAwareView } from '../../common/components/keyboard-aware-view'
import { ScreenHeader } from '../../common/components/screen-header'
import { formatXof, useMoney } from '../../common/hooks/use-money'
import { fetchFamilyCategories, fetchFamilyWallet, updateFamilyDefaults, updateMemberLimits } from '../family-wallet-api'

interface FamilyLimitsScreenProps {
  onBack: () => void
  /** Opens this member's card first. */
  initialMemberId?: string | null
}

/** One editable amount: `custom` false means null (no limit, or « comme pour tous »). */
interface AmountDraft {
  custom: boolean
  text: string
}

interface LimitsDraft {
  monthlyCap: AmountDraft
  orderMax: AmountDraft
  categoriesCustom: boolean
  categoryIds: string[]
}

/** Labels of the two choices: defaults say « no limit », a member says « like everyone ». */
interface ChoiceLabels {
  inherit: string
  custom: string
}

const DEFAULT_LABELS: ChoiceLabels = { inherit: 'Sans limite', custom: 'Fixer un montant' }
const MEMBER_LABELS: ChoiceLabels = { inherit: 'Comme pour tous', custom: 'Montant propre' }
const DEFAULT_CATEGORY_LABELS: ChoiceLabels = { inherit: 'Toutes', custom: 'Choisir' }
const MEMBER_CATEGORY_LABELS: ChoiceLabels = { inherit: 'Comme pour tous', custom: 'Choisir' }

function toDraft(limits: FamilyLimits): LimitsDraft {
  return {
    monthlyCap: { custom: limits.monthlyCap !== null, text: limits.monthlyCap === null ? '' : String(limits.monthlyCap) },
    orderMax: { custom: limits.orderMax !== null, text: limits.orderMax === null ? '' : String(limits.orderMax) },
    categoriesCustom: limits.categoryIds !== null,
    categoryIds: limits.categoryIds ?? [],
  }
}

function parseAmount(draft: AmountDraft): number | null {
  return draft.custom ? Number(draft.text.replace(/\s/g, '')) : null
}

/** The limits to send, or the French reason they cannot be. */
function fromDraft(draft: LimitsDraft): { limits: FamilyLimits, problem: null } | { limits: null, problem: string } {
  const monthlyCap = parseAmount(draft.monthlyCap)
  const orderMax = parseAmount(draft.orderMax)
  for (const value of [monthlyCap, orderMax]) {
    if (value !== null && (!Number.isInteger(value) || value <= 0))
      return { limits: null, problem: 'Un montant doit être un nombre entier de FCFA, supérieur à zéro.' }
  }
  if (draft.categoriesCustom && draft.categoryIds.length === 0)
    return { limits: null, problem: 'Choisissez au moins une catégorie, ou autorisez-les toutes.' }
  return {
    limits: { monthlyCap, orderMax, categoryIds: draft.categoriesCustom ? draft.categoryIds : null },
    problem: null,
  }
}

interface ChoiceRowProps {
  labels: ChoiceLabels
  custom: boolean
  onChange: (custom: boolean) => void
  accessibilityPrefix: string
}

/** Two-way switch « inherit / custom », as a pair of radio buttons. */
function ChoiceRow({ labels, custom, onChange, accessibilityPrefix }: ChoiceRowProps) {
  const { semantic } = useTheme()
  return (
    <View style={styles.choiceRow} accessibilityRole="radiogroup">
      {[false, true].map((value) => {
        const selected = custom === value
        return (
          <TouchableOpacity
            key={String(value)}
            style={[
              styles.choice,
              selected
                ? { borderColor: colors.green[400], backgroundColor: semantic.bgPrimaryLight }
                : { borderColor: semantic.borderNormal, backgroundColor: semantic.bgSurface },
            ]}
            onPress={() => onChange(value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={`${accessibilityPrefix} : ${value ? labels.custom : labels.inherit}`}
          >
            <Text style={[styles.choiceText, { color: selected ? colors.green[800] : semantic.textSecondary }]}>
              {value ? labels.custom : labels.inherit}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

interface AmountFieldProps {
  label: string
  labels: ChoiceLabels
  draft: AmountDraft
  onChange: (draft: AmountDraft) => void
  /** What applies when the choice is « inherit », said in words. */
  inheritedText: string
}

function AmountField({ label, labels, draft, onChange, inheritedText }: AmountFieldProps) {
  const { semantic } = useTheme()
  const { formatMoney, currency } = useMoney()
  const amount = Number(draft.text.replace(/\s/g, ''))
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: semantic.textPrimary }]}>{label}</Text>
      <ChoiceRow
        labels={labels}
        custom={draft.custom}
        onChange={custom => onChange({ ...draft, custom })}
        accessibilityPrefix={label}
      />
      {draft.custom
        ? (
            <>
              <TextInput
                style={[styles.input, { color: semantic.textPrimary, backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }]}
                placeholder="Montant en FCFA"
                placeholderTextColor={semantic.textTertiary}
                keyboardType="number-pad"
                value={draft.text}
                onChangeText={text => onChange({ ...draft, text })}
                accessibilityLabel={`${label}, en FCFA`}
              />
              {currency !== 'XOF' && amount > 0 && (
                <Text style={[styles.hint, { color: semantic.textSecondary }]}>
                  {`≈ ${formatMoney(amount).primary}`}
                </Text>
              )}
            </>
          )
        : <Text style={[styles.hint, { color: semantic.textSecondary }]}>{inheritedText}</Text>}
    </View>
  )
}

interface CategoryFieldProps {
  labels: ChoiceLabels
  categories: FamilyCategory[]
  custom: boolean
  selectedIds: string[]
  onChange: (custom: boolean, selectedIds: string[]) => void
  inheritedText: string
}

function CategoryField({ labels, categories, custom, selectedIds, onChange, inheritedText }: CategoryFieldProps) {
  const { semantic } = useTheme()
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: semantic.textPrimary }]}>Catégories autorisées</Text>
      <ChoiceRow
        labels={labels}
        custom={custom}
        onChange={next => onChange(next, selectedIds)}
        accessibilityPrefix="Catégories autorisées"
      />
      {!custom && <Text style={[styles.hint, { color: semantic.textSecondary }]}>{inheritedText}</Text>}
      {custom && categories.map((category) => {
        const checked = selectedIds.includes(category.id)
        const Icon = checked ? SquareCheck : Square
        return (
          <TouchableOpacity
            key={category.id}
            style={styles.checkRow}
            onPress={() => onChange(true, checked
              ? selectedIds.filter(id => id !== category.id)
              : [...selectedIds, category.id])}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            accessibilityLabel={category.name}
          >
            <Icon size={20} color={checked ? colors.green[600] : semantic.textTertiary} strokeWidth={2} />
            <Text style={[styles.checkText, { color: semantic.textPrimary }]}>{category.name}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

interface LimitsEditorProps {
  initial: FamilyLimits
  isMember: boolean
  /** The defaults, to say what « Comme pour tous » means for a member. */
  defaults: FamilyLimits
  categories: FamilyCategory[]
  onSave: (limits: FamilyLimits) => Promise<string | null>
}

function describeAmount(value: number | null): string {
  return value === null ? 'Sans limite.' : `${formatXof(value)}.`
}

function describeCategories(ids: string[] | null, categories: FamilyCategory[]): string {
  if (ids === null)
    return 'Toutes les catégories.'
  const names = categories.filter(category => ids.includes(category.id)).map(category => category.name)
  return names.length > 0 ? `${names.join(', ')}.` : `${ids.length} catégorie(s).`
}

function LimitsEditor({ initial, isMember, defaults, categories, onSave }: LimitsEditorProps) {
  const [draft, setDraft] = useState<LimitsDraft>(() => toDraft(initial))
  const [saving, setSaving] = useState(false)
  const amountLabels = isMember ? MEMBER_LABELS : DEFAULT_LABELS

  const save = useCallback(async () => {
    const result = fromDraft(draft)
    if (result.problem !== null) {
      appAlert('Limites incomplètes', result.problem)
      return
    }
    setSaving(true)
    const error = await onSave(result.limits)
    setSaving(false)
    if (error)
      appAlert('Enregistrement impossible', error)
    else
      appAlert('Limites enregistrées', 'Elles s’appliquent aux prochaines commandes.')
  }, [draft, onSave])

  return (
    <View style={styles.editor}>
      <AmountField
        label="Plafond par mois"
        labels={amountLabels}
        draft={draft.monthlyCap}
        onChange={monthlyCap => setDraft(previous => ({ ...previous, monthlyCap }))}
        inheritedText={isMember ? `Comme pour tous : ${describeAmount(defaults.monthlyCap)}` : 'Aucun plafond mensuel.'}
      />
      <AmountField
        label="Maximum par commande"
        labels={amountLabels}
        draft={draft.orderMax}
        onChange={orderMax => setDraft(previous => ({ ...previous, orderMax }))}
        inheritedText={isMember ? `Comme pour tous : ${describeAmount(defaults.orderMax)}` : 'Aucun maximum par commande.'}
      />
      <CategoryField
        labels={isMember ? MEMBER_CATEGORY_LABELS : DEFAULT_CATEGORY_LABELS}
        categories={categories}
        custom={draft.categoriesCustom}
        selectedIds={draft.categoryIds}
        onChange={(categoriesCustom, categoryIds) => setDraft(previous => ({ ...previous, categoriesCustom, categoryIds }))}
        inheritedText={isMember
          ? `Comme pour tous : ${describeCategories(defaults.categoryIds, categories)}`
          : 'Toutes les catégories.'}
      />
      <TouchableOpacity
        style={[styles.saveButton, saving && styles.busy]}
        onPress={() => {
          void save()
        }}
        disabled={saving}
        accessibilityRole="button"
        accessibilityState={{ busy: saving }}
      >
        {saving
          ? <ActivityIndicator color={colors.neutral[0]} />
          : <Text style={styles.saveButtonText}>Enregistrer</Text>}
      </TouchableOpacity>
    </View>
  )
}

interface MemberCardProps {
  member: FamilyMember
  expanded: boolean
  onToggle: () => void
  defaults: FamilyLimits
  categories: FamilyCategory[]
  onSave: (memberId: string, limits: FamilyLimits) => Promise<string | null>
}

function MemberCard({ member, expanded, onToggle, defaults, categories, onSave }: MemberCardProps) {
  const { semantic } = useTheme()
  const Chevron = expanded ? ChevronUp : ChevronDown
  const ownCount = [member.limits.monthlyCap, member.limits.orderMax, member.limits.categoryIds].filter(value => value !== null).length
  return (
    <View style={[styles.card, { backgroundColor: semantic.bgCard }]}>
      <TouchableOpacity
        style={styles.memberHead}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`Limites de ${member.nickname}`}
      >
        <View style={styles.flex}>
          <Text style={[styles.memberName, { color: semantic.textPrimary }]} numberOfLines={1}>{member.nickname}</Text>
          <Text style={[styles.hint, { color: semantic.textSecondary }]}>
            {ownCount === 0 ? 'Comme pour tous' : `${ownCount} limite(s) propre(s)`}
          </Text>
        </View>
        <Chevron size={20} color={semantic.textSecondary} strokeWidth={2} />
      </TouchableOpacity>
      {expanded && (
        <LimitsEditor
          initial={member.limits}
          isMember
          defaults={defaults}
          categories={categories}
          onSave={limits => onSave(member.id, limits)}
        />
      )}
    </View>
  )
}

/** Default limits of the family wallet, and each member's own limits. */
export function FamilyLimitsScreen({ onBack, initialMemberId = null }: FamilyLimitsScreenProps) {
  const { semantic } = useTheme()
  const [wallet, setWallet] = useState<FamilyWallet | null>(null)
  const [categories, setCategories] = useState<FamilyCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(initialMemberId)
  // Remounts the editors after a save so they start from what the server kept.
  const [version, setVersion] = useState(0)

  const load = useCallback(async (): Promise<void> => {
    try {
      const [loadedWallet, loadedCategories] = await Promise.all([
        fetchFamilyWallet(),
        fetchFamilyCategories().catch(() => [] as FamilyCategory[]),
      ])
      setWallet(loadedWallet)
      setCategories(loadedCategories)
      setError(loadedWallet ? null : 'Ouvrez d’abord votre portefeuille famille.')
      setVersion(previous => previous + 1)
    }
    catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible de charger les limites.')
    }
    finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const saveDefaults = useCallback(async (limits: FamilyLimits): Promise<string | null> => {
    const result = await updateFamilyDefaults(limits)
    if (result.error !== null)
      return result.error
    await load()
    return null
  }, [load])

  const saveMember = useCallback(async (memberId: string, limits: FamilyLimits): Promise<string | null> => {
    const result = await updateMemberLimits(memberId, limits)
    if (result.error !== null)
      return result.error
    await load()
    return null
  }, [load])

  return (
    <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader title="Limites" onBack={onBack} />
      {loading && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.green[400]} />
        </View>
      )}
      {!loading && (
        <KeyboardAwareView style={styles.screen}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {error && <Text style={[styles.body, { color: semantic.textSecondary }]}>{error}</Text>}
            {wallet && (
              <>
                <Text style={[styles.body, { color: semantic.textSecondary }]}>
                  Les limites s’appliquent au moment du paiement. Une commande déjà payée n’est jamais remise en cause.
                </Text>

                <Text style={[styles.sectionTitle, { color: semantic.textTertiary }]}>Pour tous mes proches</Text>
                <View style={[styles.card, { backgroundColor: semantic.bgCard }]}>
                  <LimitsEditor
                    key={`defaults-${version}`}
                    initial={wallet.defaults}
                    isMember={false}
                    defaults={wallet.defaults}
                    categories={categories}
                    onSave={saveDefaults}
                  />
                </View>

                {wallet.members.length > 0 && (
                  <Text style={[styles.sectionTitle, { color: semantic.textTertiary }]}>Pour un proche en particulier</Text>
                )}
                {wallet.members.map(member => (
                  <MemberCard
                    key={`${member.id}-${version}`}
                    member={member}
                    expanded={expandedId === member.id}
                    onToggle={() => setExpandedId(previous => (previous === member.id ? null : member.id))}
                    defaults={wallet.defaults}
                    categories={categories}
                    onSave={saveMember}
                  />
                ))}
              </>
            )}
          </ScrollView>
        </KeyboardAwareView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  content: { padding: spacing[4], gap: spacing[3], paddingBottom: spacing[10] },
  body: { ...typography.bodyS },
  sectionTitle: { ...typography.overline, marginTop: spacing[3] },
  card: { borderRadius: radius.lg, padding: spacing[4], gap: spacing[3] },
  editor: { gap: spacing[4] },
  field: { gap: spacing[2] },
  fieldLabel: { ...typography.bodyL, fontFamily: fonts.sansSb },
  choiceRow: { flexDirection: 'row', gap: spacing[2] },
  choice: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[2],
  },
  choiceText: { ...typography.caption, fontFamily: fonts.sansSb, textAlign: 'center' },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    fontFamily: fonts.mono,
    fontSize: 15,
  },
  hint: { ...typography.caption },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], minHeight: 44 },
  checkText: { ...typography.bodyL, flex: 1 },
  memberHead: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], minHeight: 44 },
  memberName: { ...typography.bodyL, fontFamily: fonts.sansSb },
  saveButton: {
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.green[400],
    alignItems: 'center',
    justifyContent: 'center',
  },
  busy: { opacity: 0.7 },
  saveButtonText: { fontFamily: fonts.sansSb, fontSize: 15, color: colors.neutral[0] },
})
