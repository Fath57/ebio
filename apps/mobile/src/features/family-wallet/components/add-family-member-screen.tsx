import type { Relative } from '../../relatives/relatives-api'
import type { FamilyMember } from '../family-wallet-api'
import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right'
import UserPlus from 'lucide-react-native/dist/esm/icons/user-plus'
import * as React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import {
  normalizeRecipientPhone,
  RECIPIENT_PHONE_PATTERN,
  RECIPIENT_PHONE_PREFIX,
} from '../../cart/components/recipient-step'
import { appAlert } from '../../common/components/app-alert'
import { KeyboardAwareView } from '../../common/components/keyboard-aware-view'
import { ScreenHeader } from '../../common/components/screen-header'
import { ContactPickButton } from '../../relatives/components/contact-pick-button'
import { useRelatives } from '../../relatives/relatives-api'
import { addFamilyMember, fetchFamilyWallet } from '../family-wallet-api'

const NICKNAME_MAX = 40
const NAME_MAX = 120

interface AddFamilyMemberScreenProps {
  onBack: () => void
  /** A member was added: usually goes back to the wallet. */
  onAdded: () => void
}

/** First blocking problem of the « Nouveau proche » form, or null. */
function formProblem(nickname: string, name: string, phone: string): string | null {
  if (nickname.trim().length === 0)
    return 'Donnez un surnom à votre proche (ex. Maman).'
  if (name.trim().length === 0)
    return 'Indiquez le nom de votre proche.'
  if (!RECIPIENT_PHONE_PATTERN.test(normalizeRecipientPhone(phone)))
    return 'Le numéro doit être béninois : +229 suivi de 10 chiffres.'
  return null
}

/** Tells the payer what happens next, depending on whether the relative already has an account. */
function announceAdded(member: FamilyMember): void {
  if (member.status === 'ACTIVE') {
    appAlert(
      `${member.nickname} est ajouté(e)`,
      `${member.nickname} a déjà un compte eBio et peut dès maintenant payer ses courses avec le portefeuille famille.`,
    )
    return
  }
  appAlert(
    `${member.nickname} est invité(e)`,
    `Un SMS d’invitation a été envoyé à ${member.phone}. Dès que votre proche installe eBio avec ce numéro, il pourra payer avec le portefeuille famille.`,
  )
}

/** Adds a member to the family wallet: from the address book, or as a new relative. */
export function AddFamilyMemberScreen({ onBack, onAdded }: AddFamilyMemberScreenProps) {
  const { semantic } = useTheme()
  const { relatives, isLoading, error } = useRelatives()
  const [memberPhones, setMemberPhones] = useState<Set<string>>(() => new Set())
  const [addingId, setAddingId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [nickname, setNickname] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState(RECIPIENT_PHONE_PREFIX)
  const [address, setAddress] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function loadMembers(): Promise<void> {
      try {
        const wallet = await fetchFamilyWallet()
        if (!cancelled && wallet)
          setMemberPhones(new Set(wallet.members.map(member => member.phone)))
      }
      catch {
        // The server refuses a duplicate anyway (FAMILY_MEMBER_EXISTS).
      }
    }
    loadMembers()
    return () => {
      cancelled = true
    }
  }, [])

  const candidates = useMemo(
    () => relatives.filter(relative => !memberPhones.has(relative.phone)),
    [relatives, memberPhones],
  )

  // The form opens by itself when the address book has nobody left to offer.
  const showForm = formOpen || (!isLoading && candidates.length === 0)

  const normalizedPhone = normalizeRecipientPhone(phone)
  const phoneInvalid = normalizedPhone.length > RECIPIENT_PHONE_PREFIX.length && !RECIPIENT_PHONE_PATTERN.test(normalizedPhone)

  const addFromBook = useCallback(async (relative: Relative) => {
    setAddingId(relative.id)
    const result = await addFamilyMember({ savedRelativeId: relative.id })
    setAddingId(null)
    if (result.error !== null) {
      appAlert('Ajout impossible', result.error)
      return
    }
    announceAdded(result.data)
    onAdded()
  }, [onAdded])

  const addNew = useCallback(async () => {
    const problem = formProblem(nickname, name, phone)
    if (problem) {
      appAlert('Informations incomplètes', problem)
      return
    }
    setSaving(true)
    const result = await addFamilyMember({
      relative: {
        nickname: nickname.trim(),
        name: name.trim(),
        phone: normalizedPhone,
        address: address.trim().length > 0 ? address.trim() : null,
        latitude: null,
        longitude: null,
      },
    })
    setSaving(false)
    if (result.error !== null) {
      appAlert('Ajout impossible', result.error)
      return
    }
    announceAdded(result.data)
    onAdded()
  }, [nickname, name, phone, address, normalizedPhone, onAdded])

  const inputStyle = [styles.input, { color: semantic.textPrimary, backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }]

  return (
    <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader title="Ajouter un proche" onBack={onBack} />
      <KeyboardAwareView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={[styles.intro, { color: semantic.textSecondary }]}>
            Votre proche reçoit un SMS. Il paie ses courses avec le portefeuille famille dès qu’il utilise eBio avec ce numéro.
          </Text>

          <Text style={[styles.sectionTitle, { color: semantic.textTertiary }]}>Depuis mes proches</Text>
          {isLoading && <ActivityIndicator color={colors.green[400]} style={styles.loader} />}
          {error && <Text style={[styles.hint, { color: colors.coral[600] }]}>{error}</Text>}
          {!isLoading && !error && candidates.length === 0 && (
            <Text style={[styles.hint, { color: semantic.textSecondary }]}>
              Tous vos proches enregistrés font déjà partie du portefeuille, ou votre carnet est vide.
            </Text>
          )}
          {candidates.length > 0 && (
            <View style={[styles.listCard, { backgroundColor: semantic.bgCard }]}>
              {candidates.map((relative, index) => (
                <TouchableOpacity
                  key={relative.id}
                  style={[styles.relativeRow, index > 0 && { borderTopWidth: 1, borderTopColor: semantic.borderLight }]}
                  onPress={() => {
                    void addFromBook(relative)
                  }}
                  disabled={addingId !== null}
                  accessibilityRole="button"
                  accessibilityLabel={`Ajouter ${relative.nickname} au portefeuille famille`}
                  accessibilityState={{ busy: addingId === relative.id }}
                >
                  <View style={styles.flex}>
                    <Text style={[styles.relativeName, { color: semantic.textPrimary }]} numberOfLines={1}>
                      {relative.nickname}
                    </Text>
                    <Text style={[styles.relativeMeta, { color: semantic.textSecondary }]} numberOfLines={1}>
                      {`${relative.name} · ${relative.phone}`}
                    </Text>
                  </View>
                  {addingId === relative.id
                    ? <ActivityIndicator size="small" color={colors.green[400]} />
                    : <ChevronRight size={18} color={semantic.textTertiary} strokeWidth={2} />}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {!showForm && (
            <TouchableOpacity
              style={[styles.secondaryButton, { borderColor: colors.green[400], backgroundColor: semantic.bgCard }]}
              onPress={() => setFormOpen(true)}
              accessibilityRole="button"
            >
              <UserPlus size={18} color={colors.green[600]} strokeWidth={2} />
              <Text style={[styles.secondaryButtonText, { color: colors.green[600] }]}>Nouveau proche</Text>
            </TouchableOpacity>
          )}

          {showForm && (
            <>
              <Text style={[styles.sectionTitle, { color: semantic.textTertiary }]}>Nouveau proche</Text>
              <Text style={[styles.label, { color: semantic.textSecondary }]}>Surnom *</Text>
              <TextInput
                style={inputStyle}
                placeholder="Maman, Tonton Koffi…"
                placeholderTextColor={semantic.textTertiary}
                value={nickname}
                onChangeText={setNickname}
                maxLength={NICKNAME_MAX}
                autoCapitalize="words"
                accessibilityLabel="Surnom"
              />

              <ContactPickButton
                onPicked={(pickedName, pickedPhone) => {
                  setName(pickedName)
                  setPhone(pickedPhone)
                }}
              />

              <Text style={[styles.label, { color: semantic.textSecondary }]}>Nom du proche *</Text>
              <TextInput
                style={inputStyle}
                placeholder="Prénom et nom"
                placeholderTextColor={semantic.textTertiary}
                value={name}
                onChangeText={setName}
                maxLength={NAME_MAX}
                autoCapitalize="words"
                textContentType="name"
                accessibilityLabel="Nom du proche"
              />

              <Text style={[styles.label, { color: semantic.textSecondary }]}>Téléphone du proche *</Text>
              <TextInput
                style={[...inputStyle, phoneInvalid && { borderColor: colors.coral[600] }]}
                placeholder="+229 01 97 12 34 56"
                placeholderTextColor={semantic.textTertiary}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                accessibilityLabel="Téléphone du proche"
              />
              <Text style={[styles.hint, { color: phoneInvalid ? colors.coral[600] : semantic.textTertiary }]}>
                {phoneInvalid
                  ? 'Numéro béninois attendu : +229 suivi de 10 chiffres.'
                  : 'Le numéro avec lequel votre proche utilisera eBio.'}
              </Text>

              <Text style={[styles.label, { color: semantic.textSecondary }]}>Adresse (facultative)</Text>
              <TextInput
                style={[...inputStyle, styles.multiline]}
                placeholder="Quartier, rue, repère"
                placeholderTextColor={semantic.textTertiary}
                value={address}
                onChangeText={setAddress}
                multiline
                accessibilityLabel="Adresse du proche, facultative"
              />
            </>
          )}
        </ScrollView>
      </KeyboardAwareView>

      {showForm && (
        <View style={[styles.footer, { borderTopColor: semantic.borderLight }]}>
          <TouchableOpacity
            style={[styles.saveButton, saving && styles.busy]}
            onPress={() => {
              void addNew()
            }}
            disabled={saving}
            accessibilityRole="button"
            accessibilityState={{ busy: saving }}
          >
            {saving
              ? <ActivityIndicator color={colors.neutral[0]} />
              : <Text style={styles.saveButtonText}>Ajouter au portefeuille</Text>}
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: spacing[4], gap: spacing[2] },
  intro: { ...typography.bodyS },
  sectionTitle: { ...typography.overline, marginTop: spacing[4] },
  loader: { marginVertical: spacing[4] },
  listCard: { borderRadius: radius.lg, paddingHorizontal: spacing[4] },
  relativeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: 56,
    paddingVertical: spacing[2],
  },
  relativeName: { ...typography.bodyL, fontFamily: fonts.sansSb },
  relativeMeta: { ...typography.caption },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    marginTop: spacing[4],
  },
  secondaryButtonText: { fontFamily: fonts.sansSb, fontSize: 15 },
  label: { ...typography.caption, marginTop: spacing[2] },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    fontFamily: fonts.sans,
    fontSize: 15,
  },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  hint: { ...typography.caption },
  footer: { padding: spacing[4], borderTopWidth: 1 },
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
