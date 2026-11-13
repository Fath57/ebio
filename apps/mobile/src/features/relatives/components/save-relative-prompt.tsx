import type { RelativeInput } from '../relatives-api'
import * as React from 'react'
import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { fetchRelatives, MAX_RELATIVES, saveRelative } from '../relatives-api'

interface SaveRelativePromptProps {
  orderId: string
}

/** What the order says about its recipient, enough to save them; null when not a gift. */
async function readGiftRecipient(orderId: string): Promise<Omit<RelativeInput, 'nickname'> | null> {
  const res = await apiFetch(`/api/orders/${orderId}`)
  if (!res.ok)
    return null
  const order = await res.json() as Record<string, unknown>
  const gift = order.gift as Record<string, unknown> | null | undefined
  const recipient = gift?.recipient as Record<string, unknown> | undefined
  const latitude = Number(order.deliveryLatitude)
  const longitude = Number(order.deliveryLongitude)
  if (!recipient || typeof recipient.name !== 'string' || typeof recipient.phone !== 'string')
    return null
  if (typeof order.deliveryAddress !== 'string' || !Number.isFinite(latitude) || !Number.isFinite(longitude))
    return null
  return { name: recipient.name, phone: recipient.phone, address: order.deliveryAddress, latitude, longitude }
}

/**
 * After a basket ordered for someone not yet in the address book:
 * « Enregistrer Afiavi dans vos proches ? », with a nickname. Silent for an
 * ordinary order, a relative already saved, or a full book.
 */
export function SaveRelativePrompt({ orderId }: SaveRelativePromptProps) {
  const { semantic } = useTheme()
  const [candidate, setCandidate] = useState<Omit<RelativeInput, 'nickname'> | null>(null)
  const [nickname, setNickname] = useState('')
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'dismissed'>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      try {
        const recipient = await readGiftRecipient(orderId)
        if (!recipient || cancelled)
          return
        const saved = await fetchRelatives()
        if (cancelled || saved.length >= MAX_RELATIVES || saved.some(relative => relative.phone === recipient.phone))
          return
        setCandidate(recipient)
      }
      catch {
        // No prompt rather than a broken one.
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [orderId])

  if (!candidate || state === 'dismissed')
    return null

  const firstName = candidate.name.trim().split(/\s+/)[0] ?? candidate.name

  if (state === 'saved') {
    return (
      <View style={[styles.card, { backgroundColor: semantic.bgPrimaryLight }]}>
        <Text style={[styles.title, { color: colors.green[800] }]}>{`${firstName} est dans vos proches.`}</Text>
      </View>
    )
  }

  async function handleSave(): Promise<void> {
    if (!candidate)
      return
    const label = nickname.trim() || firstName
    setState('saving')
    const result = await saveRelative({ ...candidate, nickname: label })
    if (result.error !== null) {
      setError(result.error)
      setState('idle')
      return
    }
    setState('saved')
  }

  return (
    <View style={[styles.card, { backgroundColor: semantic.bgCard, borderColor: semantic.borderLight }]}>
      <Text style={[styles.title, { color: semantic.textPrimary }]}>
        {`Enregistrer ${firstName} dans vos proches ?`}
      </Text>
      <Text style={[styles.hint, { color: semantic.textSecondary }]}>
        Vous le retrouverez en un geste à votre prochaine commande.
      </Text>
      <Text style={[styles.label, { color: semantic.textSecondary }]}>Surnom</Text>
      <TextInput
        style={[styles.input, { color: semantic.textPrimary, backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }]}
        placeholder={`${firstName}, Maman, Tonton…`}
        placeholderTextColor={semantic.textTertiary}
        value={nickname}
        onChangeText={setNickname}
        maxLength={40}
        autoCapitalize="words"
        accessibilityLabel="Surnom"
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, styles.ghostButton]}
          onPress={() => setState('dismissed')}
          accessibilityRole="button"
        >
          <Text style={[styles.ghostText, { color: semantic.textSecondary }]}>Non merci</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          onPress={() => {
            void handleSave()
          }}
          disabled={state === 'saving'}
          accessibilityRole="button"
          accessibilityState={{ busy: state === 'saving' }}
        >
          {state === 'saving'
            ? <ActivityIndicator color={colors.neutral[0]} />
            : <Text style={styles.primaryText}>Enregistrer</Text>}
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'transparent',
    padding: spacing[4],
    gap: spacing[2],
  },
  title: {
    fontFamily: fonts.sansSb,
    fontSize: 15,
  },
  hint: {
    ...typography.bodyS,
  },
  label: {
    ...typography.caption,
    marginTop: spacing[1],
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    fontFamily: fonts.sans,
    fontSize: 15,
  },
  error: {
    ...typography.caption,
    color: colors.coral[600],
  },
  actions: {
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[1],
  },
  button: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostButton: {
    backgroundColor: 'transparent',
  },
  primaryButton: {
    backgroundColor: colors.green[400],
  },
  ghostText: {
    fontFamily: fonts.sansSb,
    fontSize: 14,
  },
  primaryText: {
    fontFamily: fonts.sansSb,
    fontSize: 14,
    color: colors.neutral[0],
  },
})
