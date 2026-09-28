import type { ReferralSummary } from '../referrals'
import Check from 'lucide-react-native/dist/esm/icons/check'
import Gift from 'lucide-react-native/dist/esm/icons/gift'
import Share2 from 'lucide-react-native/dist/esm/icons/share-2'
import Users from 'lucide-react-native/dist/esm/icons/users'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { appAlert } from '../../common/components/app-alert'
import { KeyboardAwareView } from '../../common/components/keyboard-aware-view'
import { ScreenHeader } from '../../common/components/screen-header'
import { claimReferralCode, fetchReferralSummary } from '../referrals'

function money(value: number): string {
  return `${value.toLocaleString('fr-FR').replace(/,/g, ' ')} FCFA`
}

/**
 * Le parrainage, vu de l'acheteur.
 *
 * Son code, ce qu'il rapporte, et où il en est. La règle est dite en toutes
 * lettres — « quand il reçoit sa première commande » — parce qu'un parrain qui
 * attend un versement le jour de l'inscription de son filleul se croit volé.
 */
export function ReferralScreen({ onGoBack }: { onGoBack: () => void }) {
  const { semantic } = useTheme()
  const [summary, setSummary] = useState<ReferralSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [claiming, setClaiming] = useState(false)

  const load = useCallback(async () => {
    const data = await fetchReferralSummary()
    setSummary(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const share = useCallback(async () => {
    if (!summary) {
      return
    }
    try {
      await Share.share({
        message: `Commandez local sur eBio 🌿 Avec mon code ${summary.code}, on reçoit chacun ${money(summary.refereeReward)} dès votre première commande livrée.\n${summary.link}`,
      })
    }
    catch {
      // Partage annulé : rien à dire.
    }
  }, [summary])

  const claim = useCallback(async () => {
    const code = draft.trim().toUpperCase()
    if (code.length < 4) {
      return
    }
    setClaiming(true)
    const result = await claimReferralCode(code)
    setClaiming(false)
    if (result.ok) {
      setDraft('')
      appAlert('Parrain enregistré', `${result.sponsorName} vous a parrainé. Votre récompense arrive avec votre première commande livrée.`)
      await load()
      return
    }
    appAlert('Code refusé', result.message)
  }, [draft, load])

  if (loading) {
    return (
      <View style={[styles.screen, styles.centered, { backgroundColor: semantic.bgPage }]}>
        <ActivityIndicator size="large" color={colors.green[400]} />
      </View>
    )
  }

  if (!summary) {
    return (
      <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
        <ScreenHeader title="Parrainage" onBack={onGoBack} />
        <View style={styles.centered}>
          <Text style={[styles.empty, { color: semantic.textSecondary }]}>
            Impossible d'afficher votre parrainage pour le moment.
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader title="Parrainage" onBack={onGoBack} />
      <KeyboardAwareView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <View style={styles.heroIcon}>
              <Gift size={22} color={colors.neutral[0]} strokeWidth={2.2} />
            </View>
            <Text style={styles.heroTitle}>
              {money(summary.sponsorReward)}
              {' '}
              par filleul
            </Text>
            <Text style={styles.heroBody}>
              Partagez votre code. Quand la personne reçoit sa première commande
              {summary.minOrderAmount > 0 ? ` d'au moins ${money(summary.minOrderAmount)}` : ''}
              , vous recevez
              {' '}
              {money(summary.sponsorReward)}
              {' '}
              et elle
              {' '}
              {money(summary.refereeReward)}
              , sur vos portefeuilles.
            </Text>

            <View style={styles.codeBox}>
              <Text style={styles.code} selectable>{summary.code}</Text>
            </View>

            <TouchableOpacity style={styles.shareButton} onPress={share} activeOpacity={0.85} accessibilityRole="button">
              <Share2 size={18} color={colors.green[800]} strokeWidth={2.4} />
              <Text style={styles.shareText}>Partager mon code</Text>
            </TouchableOpacity>
          </View>

          {!summary.active && (
            <View style={[styles.notice, { backgroundColor: colors.earth[50] }]}>
              <Text style={[styles.noticeText, { color: colors.earth[800] }]}>
                Le parrainage est suspendu pour le moment. Votre code reste valable pour plus tard.
              </Text>
            </View>
          )}

          <View style={styles.stats}>
            <Stat label="Filleuls en attente" value={String(summary.pending)} semantic={semantic} />
            <Stat label="Récompensés" value={String(summary.rewarded)} semantic={semantic} />
            <Stat label="Gagné" value={money(summary.earned)} semantic={semantic} />
          </View>

          {summary.sponsoredBy
            ? (
                <View style={[styles.card, { backgroundColor: semantic.bgCard }]}>
                  <View style={styles.cardRow}>
                    <View style={[styles.cardIcon, { backgroundColor: colors.green[50] }]}>
                      {summary.sponsoredBy.status === 'REWARDED'
                        ? <Check size={18} color={colors.green[600]} strokeWidth={2.4} />
                        : <Users size={18} color={colors.green[600]} strokeWidth={2.4} />}
                    </View>
                    <View style={styles.cardTexts}>
                      <Text style={[styles.cardTitle, { color: semantic.textPrimary }]}>
                        Parrainé par
                        {' '}
                        {summary.sponsoredBy.name}
                      </Text>
                      <Text style={[styles.cardBody, { color: semantic.textSecondary }]}>
                        {summary.sponsoredBy.status === 'REWARDED'
                          ? `${money(summary.refereeReward)} ont été versés sur votre portefeuille.`
                          : 'Votre récompense arrive avec votre première commande livrée.'}
                      </Text>
                    </View>
                  </View>
                </View>
              )
            : (
                <View style={[styles.card, { backgroundColor: semantic.bgCard }]}>
                  <Text style={[styles.cardTitle, { color: semantic.textPrimary }]}>On vous a parrainé ?</Text>
                  <Text style={[styles.cardBody, { color: semantic.textSecondary }]}>
                    Saisissez le code avant votre première commande livrée.
                  </Text>
                  <View style={styles.claimRow}>
                    <TextInput
                      style={[styles.input, { backgroundColor: semantic.bgSurface, color: semantic.textPrimary, borderColor: semantic.borderNormal }]}
                      value={draft}
                      onChangeText={text => setDraft(text.toUpperCase())}
                      placeholder="Code du parrain"
                      placeholderTextColor={semantic.textTertiary}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      maxLength={16}
                    />
                    <TouchableOpacity
                      style={[styles.claimButton, { opacity: draft.trim().length < 4 || claiming ? 0.5 : 1 }]}
                      onPress={claim}
                      disabled={draft.trim().length < 4 || claiming}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                    >
                      {claiming
                        ? <ActivityIndicator size="small" color={colors.neutral[0]} />
                        : <Text style={styles.claimText}>Valider</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
        </ScrollView>
      </KeyboardAwareView>
    </View>
  )
}

function Stat({ label, value, semantic }: { label: string, value: string, semantic: ReturnType<typeof useTheme>['semantic'] }) {
  return (
    <View style={[styles.stat, { backgroundColor: semantic.bgCard }]}>
      <Text style={[styles.statValue, { color: semantic.textPrimary }]} numberOfLines={1}>{value}</Text>
      <Text style={[styles.statLabel, { color: semantic.textTertiary }]} numberOfLines={2}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[6],
  },
  content: {
    padding: spacing[4],
    gap: spacing[4],
  },
  empty: {
    ...typography.bodyL,
    textAlign: 'center',
  },
  hero: {
    padding: spacing[5],
    borderRadius: radius.lg,
    backgroundColor: colors.green[800],
    gap: spacing[3],
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green[600],
  },
  heroTitle: {
    fontFamily: fonts.display,
    fontSize: 24,
    color: colors.neutral[0],
  },
  heroBody: {
    ...typography.bodyS,
    color: colors.green[100],
  },
  codeBox: {
    alignItems: 'center',
    paddingVertical: spacing[3],
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.green[400],
  },
  code: {
    fontFamily: fonts.mono,
    fontSize: 26,
    letterSpacing: 4,
    color: colors.neutral[0],
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    minHeight: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.neutral[0],
  },
  shareText: {
    fontFamily: fonts.sansBd,
    fontSize: 15,
    color: colors.green[800],
  },
  notice: {
    padding: spacing[3],
    borderRadius: radius.md,
  },
  noticeText: {
    ...typography.bodyS,
  },
  stats: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  stat: {
    flex: 1,
    padding: spacing[3],
    borderRadius: radius.md,
    gap: spacing[1],
  },
  statValue: {
    fontFamily: fonts.sansBd,
    fontSize: 16,
  },
  statLabel: {
    fontFamily: fonts.sansMd,
    fontSize: 11,
  },
  card: {
    padding: spacing[4],
    borderRadius: radius.lg,
    gap: spacing[2],
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTexts: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontFamily: fonts.sansSb,
    fontSize: 15,
  },
  cardBody: {
    ...typography.bodyS,
  },
  claimRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginTop: spacing[2],
  },
  input: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
    fontFamily: fonts.mono,
    fontSize: 16,
    letterSpacing: 2,
  },
  claimButton: {
    minHeight: 48,
    paddingHorizontal: spacing[5],
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.green[600],
  },
  claimText: {
    fontFamily: fonts.sansBd,
    fontSize: 15,
    color: colors.neutral[0],
  },
})
