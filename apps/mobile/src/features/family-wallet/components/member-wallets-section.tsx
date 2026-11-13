import type { MemberFamilyWallet } from '../family-wallet-api'
import { useFocusEffect } from '@react-navigation/native'
import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right'
import CircleCheck from 'lucide-react-native/dist/esm/icons/circle-check'
import CirclePause from 'lucide-react-native/dist/esm/icons/circle-pause'
import * as React from 'react'
import { useCallback, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { formatXof } from '../../common/hooks/use-money'
import { fetchMyFamilyWallets, useFamilyWalletEnabled } from '../family-wallet-api'

interface MemberWalletsSectionProps {
  /** Opens the member's own purchases on that wallet; the link hides without it. */
  onOpenPurchases?: (memberId: string, payerFirstName: string) => void
}

interface MemberWalletCardProps {
  wallet: MemberFamilyWallet
  onOpenPurchases?: (memberId: string, payerFirstName: string) => void
}

/** The limits a member lives with, one plain sentence each. */
function limitLines(wallet: MemberFamilyWallet): string[] {
  const { monthlyCap, orderMax, categoryNames } = wallet.limits
  return [
    monthlyCap !== null
      ? `Plafond du mois : ${formatXof(monthlyCap)}, dont ${formatXof(wallet.spentThisMonth)} déjà dépensés`
      : `Sans plafond mensuel · ${formatXof(wallet.spentThisMonth)} dépensés ce mois-ci`,
    orderMax !== null ? `Maximum par commande : ${formatXof(orderMax)}` : 'Pas de maximum par commande',
    categoryNames && categoryNames.length > 0
      ? `Produits autorisés : ${categoryNames.join(', ')}`
      : 'Tous les produits sont autorisés',
  ]
}

/** One wallet I am a member of: what I can still spend, my limits, my purchases. */
function MemberWalletCard({ wallet, onOpenPurchases }: MemberWalletCardProps) {
  const { semantic } = useTheme()
  const active = wallet.status === 'ACTIVE'
  const StatusIcon = active ? CircleCheck : CirclePause
  const statusColor = active ? colors.green[600] : colors.earth[600]

  return (
    <View style={[styles.card, { backgroundColor: semantic.bgCard }]}>
      <View style={styles.head}>
        <Text style={[styles.payer, { color: semantic.textPrimary }]} numberOfLines={1}>
          {`Portefeuille de ${wallet.payerFirstName}`}
        </Text>
        <View style={styles.status}>
          <StatusIcon size={14} color={statusColor} strokeWidth={2.2} />
          <Text style={[styles.statusText, { color: statusColor }]}>{active ? 'Actif' : 'Suspendu'}</Text>
        </View>
      </View>

      <View>
        <Text style={[styles.caption, { color: semantic.textSecondary }]}>
          {active ? 'Vous pouvez encore dépenser ce mois-ci' : `${wallet.payerFirstName} a mis ce portefeuille en pause`}
        </Text>
        {active && (
          <Text style={[styles.spendable, { color: semantic.textPrimary }]}>{formatXof(wallet.spendable)}</Text>
        )}
      </View>

      <View style={styles.limits}>
        {limitLines(wallet).map(line => (
          <Text key={line} style={[styles.caption, { color: semantic.textSecondary }]}>{line}</Text>
        ))}
      </View>

      {onOpenPurchases && (
        <TouchableOpacity
          style={[styles.link, { borderTopColor: semantic.borderLight }]}
          onPress={() => onOpenPurchases(wallet.memberId, wallet.payerFirstName)}
          accessibilityRole="button"
          accessibilityLabel={`Voir mes achats avec le portefeuille de ${wallet.payerFirstName}`}
        >
          <Text style={[styles.linkText, { color: colors.green[600] }]}>Voir mes achats</Text>
          <ChevronRight size={18} color={colors.green[600]} strokeWidth={2.2} />
        </TouchableOpacity>
      )}
    </View>
  )
}

/**
 * « Portefeuilles famille » on the buyer's wallet: one card per family wallet
 * this buyer may spend from. Never the wallet's total balance (FR-025).
 * Nothing shows for a buyer who is a member of none.
 */
export function MemberWalletsSection({ onOpenPurchases }: MemberWalletsSectionProps) {
  const { semantic } = useTheme()
  const enabled = useFamilyWalletEnabled()
  const [wallets, setWallets] = useState<MemberFamilyWallet[]>([])

  // Spending changes after each order: read again whenever the screen shows.
  useFocusEffect(useCallback(() => {
    let cancelled = false
    async function load(): Promise<void> {
      const found = await fetchMyFamilyWallets()
      if (!cancelled)
        setWallets(found)
    }
    load()
    return () => {
      cancelled = true
    }
  }, []))

  if (!enabled || wallets.length === 0)
    return null

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: semantic.textTertiary }]}>PORTEFEUILLES FAMILLE</Text>
      {wallets.map(wallet => (
        <MemberWalletCard key={wallet.memberId} wallet={wallet} onOpenPurchases={onOpenPurchases} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  section: { gap: spacing[3], marginTop: spacing[4] },
  sectionTitle: { ...typography.overline },
  card: { borderRadius: radius.lg, padding: spacing[4], gap: spacing[3] },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  payer: { ...typography.bodyL, fontFamily: fonts.sansSb, flex: 1 },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  statusText: { ...typography.caption },
  caption: { ...typography.caption },
  spendable: { fontFamily: fonts.mono, fontSize: 24, lineHeight: 32 },
  limits: { gap: spacing[1] },
  link: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: spacing[2],
  },
  linkText: { ...typography.bodyS, fontFamily: fonts.sansSb },
})
