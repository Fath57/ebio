import Gift from 'lucide-react-native/dist/esm/icons/gift'
import Send from 'lucide-react-native/dist/esm/icons/send'
import * as React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { appAlert } from '../../common/components/app-alert'

/** `gift` block of the payer's order response (contracts/diaspora.md §3). */
export interface OrderGift {
  recipient: { name: string, phone: string }
  confirmationCode: string | null
  smsResendsLeft: number
}

/** `proof` block, present once the basket was handed over. `far` is for support only. */
export interface OrderProof {
  photoUrl: string
  takenAt: string
}

export function parseOrderGift(raw: unknown): OrderGift | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const data = raw as Record<string, unknown>
  const recipient = (data.recipient ?? null) as Record<string, unknown> | null
  if (!recipient || typeof recipient.name !== 'string') {
    return null
  }
  return {
    recipient: { name: recipient.name, phone: typeof recipient.phone === 'string' ? recipient.phone : '' },
    confirmationCode: typeof data.confirmationCode === 'string' ? data.confirmationCode : null,
    smsResendsLeft: typeof data.smsResendsLeft === 'number' ? data.smsResendsLeft : 0,
  }
}

export function parseOrderProof(raw: unknown): OrderProof | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const data = raw as Record<string, unknown>
  if (typeof data.photoUrl !== 'string' || typeof data.takenAt !== 'string') {
    return null
  }
  return { photoUrl: data.photoUrl, takenAt: data.takenAt }
}

/** « 10 h 42 », the French way of writing a time of day. */
export function formatFrenchHour(iso: string): string {
  const date = new Date(iso)
  return `${date.getHours()} h ${String(date.getMinutes()).padStart(2, '0')}`
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name
}

interface GiftRecipientCardProps {
  gift: OrderGift
  proof: OrderProof | null
  checkoutId: string | null
  isDelivered: boolean
  isCancelled: boolean
}

/**
 * Who the basket goes to, the code the recipient hands to the courier, and,
 * once delivered, the photo taken at the door.
 */
export function GiftRecipientCard({ gift, proof, checkoutId, isDelivered, isCancelled }: GiftRecipientCardProps) {
  const { semantic } = useTheme()
  const [resendsLeft, setResendsLeft] = useState(gift.smsResendsLeft)
  const [sending, setSending] = useState(false)
  // A pull-to-refresh brings the server's count back: it wins over the local one.
  useEffect(() => {
    setResendsLeft(gift.smsResendsLeft)
  }, [gift.smsResendsLeft])
  const recipientFirstName = firstName(gift.recipient.name)
  const canResend = !isDelivered && !isCancelled && checkoutId !== null
  const resendDisabled = sending || resendsLeft <= 0

  const resend = useCallback(async () => {
    if (!checkoutId || resendDisabled) {
      return
    }
    setSending(true)
    try {
      const res = await apiFetch(`/api/checkouts/${checkoutId}/recipient-sms`, { method: 'POST' })
      if (res.status === 429) {
        setResendsLeft(0)
        appAlert('Renvois épuisés', `Le SMS a déjà été renvoyé trois fois à ${recipientFirstName}.`)
        return
      }
      if (!res.ok) {
        appAlert('Envoi impossible', 'Le SMS n\'a pas pu être renvoyé. Réessayez dans un instant.')
        return
      }
      setResendsLeft(left => Math.max(0, left - 1))
      appAlert('SMS renvoyé', `${recipientFirstName} va recevoir de nouveau le SMS de suivi.`)
    }
    catch {
      appAlert('Hors connexion', 'Vérifiez votre connexion et réessayez.')
    }
    finally {
      setSending(false)
    }
  }, [checkoutId, resendDisabled, recipientFirstName])

  return (
    <View style={[styles.card, { backgroundColor: semantic.bgCard }]}>
      <View style={styles.header}>
        <View style={[styles.icon, { backgroundColor: semantic.bgPrimaryLight }]}>
          <Gift size={18} color={colors.green[600]} strokeWidth={2} />
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: semantic.textPrimary }]}>
            {isDelivered ? `Livré à ${gift.recipient.name}` : `Pour ${gift.recipient.name}`}
          </Text>
          {gift.recipient.phone.length > 0 && (
            <Text style={[styles.phone, { color: semantic.textSecondary }]}>{gift.recipient.phone}</Text>
          )}
        </View>
      </View>

      {!isDelivered && !isCancelled && gift.confirmationCode && (
        <View style={[styles.codeBox, { backgroundColor: semantic.bgPrimaryLight }]}>
          <Text style={[styles.codeLabel, { color: semantic.textSecondary }]}>
            {`Code de remise, envoyé par SMS à ${recipientFirstName} : le livreur le lui demandera`}
          </Text>
          <Text style={[styles.codeValue, { color: semantic.textPrimaryColor }]}>{gift.confirmationCode}</Text>
        </View>
      )}

      {canResend && (
        <TouchableOpacity
          style={[styles.resendButton, { borderColor: semantic.borderNormal }, resendDisabled && styles.disabled]}
          onPress={() => {
            void resend()
          }}
          disabled={resendDisabled}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Renvoyer le SMS"
          accessibilityState={{ disabled: resendDisabled }}
        >
          {sending
            ? <ActivityIndicator size="small" color={colors.green[600]} />
            : <Send size={16} color={semantic.textPrimaryColor} strokeWidth={2} />}
          <Text style={[styles.resendText, { color: semantic.textPrimaryColor }]}>
            {resendsLeft > 0
              ? `Renvoyer le SMS (${resendsLeft} restant${resendsLeft > 1 ? 's' : ''})`
              : 'Renvoyer le SMS (plus de renvoi possible)'}
          </Text>
        </TouchableOpacity>
      )}

      {proof && (
        <View style={styles.proof}>
          <Image
            source={{ uri: proof.photoUrl }}
            style={styles.proofImage}
            resizeMode="cover"
            accessible
            accessibilityRole="image"
            accessibilityLabel={`Photo de la remise du panier à ${recipientFirstName}, ${formatFrenchHour(proof.takenAt)}`}
          />
          <Text style={[styles.proofCaption, { color: semantic.textSecondary }]}>
            {`Remis à ${recipientFirstName} à ${formatFrenchHour(proof.takenAt)}`}
          </Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    padding: spacing[4],
    gap: spacing[3],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    ...typography.h3,
  },
  phone: {
    ...typography.bodyS,
  },
  codeBox: {
    borderRadius: radius.md,
    padding: spacing[4],
    alignItems: 'center',
  },
  codeLabel: {
    ...typography.caption,
    textAlign: 'center',
  },
  codeValue: {
    fontFamily: fonts.mono,
    fontSize: 32,
    letterSpacing: 10,
    marginTop: spacing[2],
  },
  resendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing[4],
  },
  resendText: {
    fontFamily: fonts.sansSb,
    fontSize: 14,
  },
  disabled: {
    opacity: 0.5,
  },
  proof: {
    gap: spacing[2],
  },
  proofImage: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radius.lg,
    backgroundColor: colors.neutral[100],
  },
  proofCaption: {
    ...typography.bodyS,
  },
})
