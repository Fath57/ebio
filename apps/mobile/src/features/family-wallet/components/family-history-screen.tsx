import type { FamilyMember, FamilyTransaction, FamilyTransactionType } from '../family-wallet-api'
import ArrowDownLeft from 'lucide-react-native/dist/esm/icons/arrow-down-left'
import ArrowUpRight from 'lucide-react-native/dist/esm/icons/arrow-up-right'
import RotateCcw from 'lucide-react-native/dist/esm/icons/rotate-ccw'
import ShoppingBag from 'lucide-react-native/dist/esm/icons/shopping-bag'
import Wallet from 'lucide-react-native/dist/esm/icons/wallet'
import * as React from 'react'
import { useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { ListFooterLoader } from '../../common/components/list-footer-loader'
import { ScreenHeader } from '../../common/components/screen-header'
import { Thumbnail } from '../../common/components/thumbnail'
import { formatXof } from '../../common/hooks/use-money'
import { hasMoreAfter, PAGE_SIZE, usePaginatedList } from '../../common/hooks/use-paginated-list'
import { fetchFamilyTransactions, fetchFamilyWallet, fetchMyFamilyPurchases } from '../family-wallet-api'

/** The member's own purchases on one wallet, instead of the payer's whole history. */
export interface MemberHistoryScope {
  memberId: string
  payerFirstName: string
}

interface FamilyHistoryScreenProps {
  onBack: () => void
  /** Set for the member's view (contract §4); absent for the payer. */
  memberScope?: MemberHistoryScope | null
}

/** Lines shown under a purchase before « + N autres produits ». */
const VISIBLE_LINES = 3

const TYPE_ICONS: Record<FamilyTransactionType, typeof Wallet> = {
  TOPUP: ArrowDownLeft,
  ORDER_PAYMENT: ShoppingBag,
  REFUND: RotateCcw,
  FAMILY_TRANSFER_IN: Wallet,
  FAMILY_CLOSURE_OUT: ArrowUpRight,
}

/** What the line says it is, in plain French. */
function transactionTitle(item: FamilyTransaction, memberView: boolean): string {
  switch (item.type) {
    case 'TOPUP':
      return 'Recharge'
    case 'FAMILY_TRANSFER_IN':
      return 'Virement depuis votre portefeuille eBio'
    case 'FAMILY_CLOSURE_OUT':
      return 'Fermeture : solde rendu à votre portefeuille eBio'
    case 'REFUND':
      return item.order ? `Remboursement · ${item.order.shopName}` : 'Remboursement'
    case 'ORDER_PAYMENT': {
      const shop = item.order?.shopName ?? 'Commande'
      return memberView || !item.member ? shop : `${item.member.nickname} · ${shop}`
    }
  }
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
}

interface TransactionRowProps {
  item: FamilyTransaction
  memberView: boolean
  isFirst: boolean
  isLast: boolean
}

/** One movement; a purchase lists its products, each with its picture. */
function TransactionRow({ item, memberView, isFirst, isLast }: TransactionRowProps) {
  const { semantic } = useTheme()
  const Icon = TYPE_ICONS[item.type]
  const credit = item.amount > 0
  // The member sees what they spent, without a minus sign that would read as a debt.
  const amountText = memberView
    ? formatXof(Math.abs(item.amount))
    : `${credit ? '+' : '−'} ${formatXof(Math.abs(item.amount))}`
  const lines = item.order?.lines ?? []
  const hidden = lines.length - VISIBLE_LINES
  const meta = [formatDate(item.createdAt), item.order?.orderNumber].filter(Boolean).join(' · ')

  return (
    <View
      style={[
        styles.row,
        { backgroundColor: semantic.bgCard },
        isFirst && styles.rowFirst,
        isLast && styles.rowLast,
      ]}
    >
      <View style={[styles.rowInner, !isFirst && { borderTopWidth: 1, borderTopColor: semantic.borderLight }]}>
        <View style={styles.rowHead}>
          <View style={[styles.typeIcon, { backgroundColor: credit ? semantic.bgPrimaryLight : semantic.bgSurface }]}>
            <Icon size={18} color={credit ? colors.green[600] : semantic.textSecondary} strokeWidth={2} />
          </View>
          <View style={styles.flex}>
            <Text style={[styles.title, { color: semantic.textPrimary }]} numberOfLines={2}>
              {transactionTitle(item, memberView)}
            </Text>
            {meta.length > 0 && (
              <Text style={[styles.meta, { color: semantic.textTertiary }]} numberOfLines={1}>{meta}</Text>
            )}
          </View>
          <View style={styles.amountBlock}>
            <Text style={[styles.amount, { color: credit && !memberView ? colors.green[600] : semantic.textPrimary }]}>
              {amountText}
            </Text>
            {!memberView && item.balanceAfter !== null && (
              <Text style={[styles.meta, { color: semantic.textTertiary }]}>
                {`Solde ${formatXof(item.balanceAfter)}`}
              </Text>
            )}
          </View>
        </View>

        {lines.length > 0 && (
          <View style={styles.lines}>
            {lines.slice(0, VISIBLE_LINES).map(line => (
              <View key={`${item.id}-${line.name}`} style={styles.line}>
                <Thumbnail uri={line.imageUrl} style={styles.thumb} alt={`Photo de ${line.name}`} />
                <Text style={[styles.lineText, { color: semantic.textSecondary }]} numberOfLines={1}>
                  {`${line.quantity} × ${line.name}`}
                </Text>
              </View>
            ))}
            {hidden > 0 && (
              <Text style={[styles.meta, { color: semantic.textTertiary }]}>
                {hidden === 1 ? '+ 1 autre produit' : `+ ${hidden} autres produits`}
              </Text>
            )}
          </View>
        )}
      </View>
    </View>
  )
}

interface MemberChipsProps {
  members: FamilyMember[]
  selectedId: string | null
  onSelect: (memberId: string | null) => void
}

/** « Tous » then one chip per member: narrows the history to that member. */
function MemberChips({ members, selectedId, onSelect }: MemberChipsProps) {
  const { semantic } = useTheme()
  const options: Array<{ id: string | null, label: string }> = [
    { id: null, label: 'Tous' },
    ...members.map(member => ({ id: member.id, label: member.nickname })),
  ]
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chips}
      accessibilityRole="radiogroup"
      accessibilityLabel="Filtrer par proche"
    >
      {options.map((option) => {
        const selected = option.id === selectedId
        return (
          <TouchableOpacity
            key={option.id ?? 'all'}
            style={[
              styles.chip,
              {
                backgroundColor: selected ? semantic.bgPrimaryLight : semantic.bgSurface,
                borderColor: selected ? colors.green[400] : semantic.borderNormal,
              },
            ]}
            onPress={() => onSelect(option.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
          >
            <Text
              style={[styles.chipText, { color: selected ? colors.green[800] : semantic.textPrimary }]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        )
      })}
    </ScrollView>
  )
}

/**
 * The family wallet's history. The payer sees every movement and can narrow
 * it to one member; a member sees only their own purchases on that wallet.
 * Never an address nor a message (FR-027): the API does not send them.
 */
export function FamilyHistoryScreen({ onBack, memberScope = null }: FamilyHistoryScreenProps) {
  const { semantic } = useTheme()
  const memberView = memberScope !== null
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [memberId, setMemberId] = useState<string | null>(null)

  // The payer's chips come from the wallet itself, removed members included
  // as long as the API still lists them.
  useEffect(() => {
    if (memberView)
      return
    let cancelled = false
    async function loadMembers(): Promise<void> {
      try {
        const wallet = await fetchFamilyWallet()
        if (!cancelled && wallet)
          setMembers(wallet.members)
      }
      catch {
        // Without chips the whole history still shows.
      }
    }
    loadMembers()
    return () => {
      cancelled = true
    }
  }, [memberView])

  const { items, isLoading, isRefreshing, isLoadingMore, error, refresh, loadMore } = usePaginatedList<FamilyTransaction>(
    async (page) => {
      const result = memberScope
        ? await fetchMyFamilyPurchases(memberScope.memberId, page, PAGE_SIZE)
        : await fetchFamilyTransactions(page, PAGE_SIZE, memberId)
      return { items: result.items, hasMore: hasMoreAfter(page, PAGE_SIZE, result.total) }
    },
    memberScope ? memberScope.memberId : memberId,
  )

  const title = memberScope ? 'Mes achats' : 'Historique'
  const subtitle = memberScope ? `Portefeuille famille de ${memberScope.payerFirstName}` : 'Portefeuille famille'
  const selectedNickname = members.find(member => member.id === memberId)?.nickname ?? null
  const emptyText = memberView
    ? 'Aucun achat pour l’instant avec ce portefeuille famille.'
    : selectedNickname
      ? `${selectedNickname} n’a encore rien commandé avec le portefeuille famille.`
      : 'Aucune opération pour l’instant. Rechargez le portefeuille pour commencer.'

  return (
    <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader title={title} subtitle={subtitle} onBack={onBack} />
      {!memberView && members.length > 0 && (
        <View style={styles.chipsBar}>
          <MemberChips members={members} selectedId={memberId} onSelect={setMemberId} />
        </View>
      )}
      {isLoading
        ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.green[400]} />
            </View>
          )
        : (
            <FlatList
              data={items}
              keyExtractor={item => item.id}
              renderItem={({ item, index }) => (
                <TransactionRow item={item} memberView={memberView} isFirst={index === 0} isLast={index === items.length - 1} />
              )}
              contentContainerStyle={styles.content}
              refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
              onEndReached={loadMore}
              onEndReachedThreshold={0.5}
              ListFooterComponent={<ListFooterLoader isLoading={isLoadingMore} />}
              ListEmptyComponent={(
                <View style={[styles.emptyCard, { backgroundColor: semantic.bgCard }]}>
                  <Text style={[styles.body, { color: semantic.textSecondary }]}>{error ?? emptyText}</Text>
                  {error && (
                    <TouchableOpacity
                      style={styles.retry}
                      onPress={() => {
                        void refresh()
                      }}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.retryText, { color: colors.green[600] }]}>Réessayer</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            />
          )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  content: { padding: spacing[4], paddingBottom: spacing[10] },
  chipsBar: { paddingTop: spacing[3] },
  chips: { gap: spacing[2], paddingHorizontal: spacing[4] },
  chip: {
    minHeight: 44,
    maxWidth: 180,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing[4],
    justifyContent: 'center',
  },
  chipText: { ...typography.bodyS, fontFamily: fonts.sansSb },
  row: { paddingHorizontal: spacing[4] },
  rowFirst: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  rowLast: { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  rowInner: { paddingVertical: spacing[3], gap: spacing[2] },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] },
  typeIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...typography.bodyS, fontFamily: fonts.sansSb },
  meta: { ...typography.caption },
  amountBlock: { alignItems: 'flex-end', gap: spacing[1] },
  amount: { ...typography.bodyS, fontFamily: fonts.mono },
  lines: { gap: spacing[2], paddingLeft: 36 + spacing[3] },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  thumb: { width: 40, height: 40, borderRadius: radius.sm },
  lineText: { ...typography.caption, flex: 1 },
  emptyCard: { borderRadius: radius.lg, padding: spacing[5], gap: spacing[3] },
  body: { ...typography.bodyS },
  retry: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  retryText: { ...typography.h3 },
})
