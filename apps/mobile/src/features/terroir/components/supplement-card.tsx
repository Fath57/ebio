import type { TerroirShipmentLine, TerroirSupplement } from '../terroir-api'
import CircleCheck from 'lucide-react-native/dist/esm/icons/circle-check'
import Info from 'lucide-react-native/dist/esm/icons/info'
import Weight from 'lucide-react-native/dist/esm/icons/weight'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, fonts, spacing, typography } from '../../../theme/theme'
import { appAlert } from '../../common/components/app-alert'
import { useTerroirMoney } from '../hooks/use-terroir-money'
import { formatKg } from '../terroir-api'
import { terroirStyles } from './terroir-ui'

/** « 22 novembre à 14:00 » */
function formatDeadline(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime()))
    return ''
  const day = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return `${day} à ${time}`
}

function isPast(iso: string | null): boolean {
  if (!iso)
    return false
  const time = new Date(iso).getTime()
  return !Number.isNaN(time) && time < Date.now()
}

interface SupplementCardProps {
  supplement: TerroirSupplement
  lines: TerroirShipmentLine[]
  busy: boolean
  onPay: () => void
  onRemoveLine: (line: TerroirShipmentLine & { id: string }) => void
}

/**
 * The weight supplement of a weighed parcel: while it is due, the buyer pays
 * it or takes a product out; afterwards only what became of it is shown.
 */
export function SupplementCard({ supplement, lines, busy, onPay, onRemoveLine }: SupplementCardProps) {
  const { formatServer } = useTerroirMoney()
  const due = supplement.status === 'REQUESTED' && !isPast(supplement.deadline)
  const waived = supplement.status === 'WAIVED' || (supplement.status === 'REQUESTED' && !due)

  if (!due) {
    const message = waived
      ? 'Votre colis pesait plus que prévu : eBio a pris l’écart à sa charge. Vous n’avez rien à payer.'
      : supplement.status === 'PAID'
        ? 'Le complément de poids est réglé. Votre colis suit son cours.'
        : 'Un produit a été retiré de votre colis et vous a été remboursé.'
    const Icon = supplement.status === 'PAID' ? CircleCheck : Info
    return (
      <View style={[terroirStyles.card, styles.infoCard]}>
        <View style={styles.titleRow}>
          <Icon size={18} color={colors.earth[800]} strokeWidth={2.2} />
          <Text style={[terroirStyles.cardTitle, styles.ink, styles.flex]}>Complément de poids</Text>
        </View>
        <Text style={[styles.line, styles.ink]}>{message}</Text>
      </View>
    )
  }

  const money = formatServer(supplement.amount, supplement.display, 'amount')
  const amountLabel = money.secondary ? `${money.primary} (${money.secondary})` : money.primary
  const weightSentence = supplement.actualWeightG !== null && supplement.estimatedWeightG !== null
    ? `Votre colis pèse ${formatKg(supplement.actualWeightG / 1000)} au lieu de ${formatKg(supplement.estimatedWeightG / 1000)}.`
    : 'Votre colis pèse plus que prévu.'
  const deadline = supplement.deadline ? formatDeadline(supplement.deadline) : ''
  const removable = lines.filter((line): line is TerroirShipmentLine & { id: string } => line.id !== null)

  function pickLine(): void {
    appAlert('Retirer un produit', 'Choisissez le produit à retirer du colis. Il vous sera remboursé.', [
      ...removable.map(line => ({
        text: `${line.quantity} × ${line.name}`,
        onPress: () => {
          confirmRemoval(line)
        },
      })),
      { text: 'Annuler', style: 'cancel' as const },
    ])
  }

  function confirmRemoval(line: TerroirShipmentLine & { id: string }): void {
    appAlert(
      `Retirer « ${line.name} » ?`,
      'Ce produit ne partira pas. Il vous sera remboursé, avec sa part de transport, et vous n’aurez pas de complément à payer.',
      [
        { text: 'Retirer le produit', style: 'destructive', onPress: () => onRemoveLine(line) },
        { text: 'Annuler', style: 'cancel' },
      ],
    )
  }

  return (
    <View style={[terroirStyles.card, styles.dueCard]}>
      <View style={styles.titleRow}>
        <Weight size={18} color={colors.earth[800]} strokeWidth={2.2} />
        <Text style={[terroirStyles.cardTitle, styles.ink, styles.flex]}>Complément de poids à régler</Text>
      </View>
      <Text style={[styles.line, styles.ink]}>{weightSentence}</Text>
      <View style={styles.amountRow}>
        <Text style={[styles.line, styles.ink]}>Complément</Text>
        <Text style={[terroirStyles.price, styles.ink, styles.amount]}>{amountLabel}</Text>
      </View>
      {deadline !== '' && (
        <Text style={[styles.line, styles.inkStrong]}>{`À régler avant le ${deadline}. Passé ce délai, eBio prend l’écart à sa charge.`}</Text>
      )}
      <Pressable
        style={[terroirStyles.primaryButton, busy && terroirStyles.disabled]}
        onPress={onPay}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={`Payer le complément de ${amountLabel}`}
      >
        {busy
          ? <ActivityIndicator color={colors.neutral[0]} />
          : <Text style={terroirStyles.primaryButtonText}>Payer le complément</Text>}
      </Pressable>
      {removable.length > 0 && (
        <Pressable
          style={[terroirStyles.secondaryButton, styles.secondary, busy && terroirStyles.disabled]}
          onPress={pickLine}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Retirer un produit du colis au lieu de payer"
        >
          <Text style={[terroirStyles.secondaryButtonText, styles.ink]}>Retirer un produit</Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  dueCard: {
    backgroundColor: colors.earth[50],
    borderWidth: 1,
    borderColor: colors.earth[200],
  },
  infoCard: {
    backgroundColor: colors.earth[50],
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  flex: {
    flex: 1,
  },
  ink: {
    color: colors.earth[800],
  },
  inkStrong: {
    color: colors.earth[900],
    fontFamily: fonts.sansSb,
  },
  line: {
    ...typography.bodyS,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: spacing[3],
  },
  amount: {
    flexShrink: 1,
    textAlign: 'right',
  },
  secondary: {
    borderColor: colors.earth[400],
  },
})
