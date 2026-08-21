import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'
import MessageCircle from 'lucide-react-native/dist/esm/icons/message-circle'
import Package from 'lucide-react-native/dist/esm/icons/package'
import Settings from 'lucide-react-native/dist/esm/icons/settings'
import ShoppingCart from 'lucide-react-native/dist/esm/icons/shopping-cart'
import Star from 'lucide-react-native/dist/esm/icons/star'
import TrendingUp from 'lucide-react-native/dist/esm/icons/trending-up'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { ModeSwitch } from '../../common/components/mode-switch'
import { ScreenHeader } from '../../common/components/screen-header'

interface DashboardData {
  pendingOrders: number
  revenue: number
  commission: number
  netRevenue: number
  criticalStockProducts: number
  unreadMessages: number
  averageRating: number | null
}

interface DashboardScreenProps {
  onGoBack: () => void
  onNavigateToProducts: () => void
  onNavigateToOrders: () => void
  onNavigateToSettings: () => void
  onNavigateToReviews: () => void
  onSwitchToBuyer: () => void
}

export function DashboardScreen({ onGoBack, onNavigateToProducts, onNavigateToOrders, onNavigateToSettings, onNavigateToReviews, onSwitchToBuyer }: DashboardScreenProps) {
  const { semantic } = useTheme()
  const tabBarHeight = useBottomTabBarHeight()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await apiFetch('/api/suppliers/me/dashboard')
        if (res.ok) {
          setData(await res.json())
        }
      }
      catch {
        // ignore
      }
      finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: semantic.bgPage }]}>
        <ActivityIndicator size="large" color={colors.green[400]} />
      </View>
    )
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: semantic.bgPage }]}
      contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + spacing[6] }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <ScreenHeader title="Tableau de bord" onBack={onGoBack} />

      {/* Mode switcher — back to buyer space */}
      <View style={styles.modeSwitchWrap}>
        <ModeSwitch
          mode="seller"
          onChange={(m) => {
            if (m === 'buyer') {
              onSwitchToBuyer()
            }
          }}
        />
      </View>

      {/* KPI cards */}
      <View style={styles.kpiRow}>
        <View style={[styles.kpiCard, { backgroundColor: semantic.bgCard }]}>
          <TrendingUp size={20} color={colors.green[400]} />
          <Text style={[styles.kpiValue, { color: semantic.textPrimary }]}>
            {((data?.revenue ?? 0) / 1000).toFixed(0)}
            k
          </Text>
          <Text style={[styles.kpiLabel, { color: semantic.textSecondary }]}>
            Revenus (FCFA)
          </Text>
        </View>

        <View style={[styles.kpiCard, { backgroundColor: semantic.bgCard }]}>
          <ShoppingCart size={20} color={colors.blue[400]} />
          <Text style={[styles.kpiValue, { color: semantic.textPrimary }]}>
            {data?.pendingOrders ?? 0}
          </Text>
          <Text style={[styles.kpiLabel, { color: semantic.textSecondary }]}>
            En attente
          </Text>
        </View>

        <View style={[styles.kpiCard, { backgroundColor: semantic.bgCard }]}>
          <Package size={20} color={colors.earth[400]} />
          <Text style={[styles.kpiValue, { color: semantic.textPrimary }]}>
            {data?.criticalStockProducts ?? 0}
          </Text>
          <Text style={[styles.kpiLabel, { color: semantic.textSecondary }]}>
            Stock critique
          </Text>
        </View>
      </View>

      {/* Secondary metrics */}
      <View style={styles.kpiRow}>
        <TouchableOpacity
          style={[styles.kpiCard, { backgroundColor: semantic.bgCard }]}
          onPress={onNavigateToReviews}
          activeOpacity={0.7}
        >
          <Star size={20} color={colors.earth[400]} />
          <Text style={[styles.kpiValue, { color: semantic.textPrimary }]}>
            {data?.averageRating != null ? data.averageRating.toFixed(1) : '—'}
          </Text>
          <Text style={[styles.kpiLabel, { color: semantic.textSecondary }]}>
            Note moyenne
          </Text>
        </TouchableOpacity>

        <View style={[styles.kpiCard, { backgroundColor: semantic.bgCard }]}>
          <MessageCircle size={20} color={colors.blue[400]} />
          <Text style={[styles.kpiValue, { color: semantic.textPrimary }]}>
            {data?.unreadMessages ?? 0}
          </Text>
          <Text style={[styles.kpiLabel, { color: semantic.textSecondary }]}>
            Messages
          </Text>
        </View>
      </View>

      {/* Earnings breakdown: gross, eBio commission, net — last 30 days */}
      {(data?.revenue ?? 0) > 0 && (
        <View style={[styles.earningsCard, { backgroundColor: semantic.bgCard }]}>
          <View style={styles.earningsRow}>
            <Text style={[styles.earningsLabel, { color: semantic.textSecondary }]}>
              Ventes livrées (30 j)
            </Text>
            <Text style={[styles.earningsValue, { color: semantic.textPrimary }]}>
              {(data?.revenue ?? 0).toLocaleString('fr-FR')}
              {' '}
              FCFA
            </Text>
          </View>
          <View style={styles.earningsRow}>
            <Text style={[styles.earningsLabel, { color: semantic.textSecondary }]}>
              Commission eBio
            </Text>
            <Text style={[styles.earningsValue, { color: semantic.textSecondary }]}>
              −
              {(data?.commission ?? 0).toLocaleString('fr-FR')}
              {' '}
              FCFA
            </Text>
          </View>
          <View style={[styles.earningsRow, styles.earningsTotalRow, { borderTopColor: semantic.borderLight }]}>
            <Text style={[styles.earningsLabel, { color: semantic.textPrimary, fontFamily: fonts.sansSb }]}>
              Net pour vous
            </Text>
            <Text style={[styles.earningsValue, { color: colors.green[600] }]}>
              {(data?.netRevenue ?? 0).toLocaleString('fr-FR')}
              {' '}
              FCFA
            </Text>
          </View>
        </View>
      )}

      {/* Pending orders */}
      {(data?.pendingOrders ?? 0) > 0 && (
        <TouchableOpacity
          style={[styles.alertCard, { backgroundColor: colors.earth[50] }]}
          onPress={onNavigateToOrders}
          activeOpacity={0.7}
        >
          <ShoppingCart size={20} color={colors.earth[600]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.alertTitle, { color: colors.earth[800] }]}>
              {data?.pendingOrders}
              {' '}
              commande
              {(data?.pendingOrders ?? 0) > 1 ? 's' : ''}
              {' '}
              en attente
            </Text>
            <Text style={[styles.alertSubtitle, { color: colors.earth[600] }]}>
              Traitez-les pour satisfaire vos clients
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Quick actions */}
      <Text style={[styles.sectionTitle, { color: semantic.textTertiary }]}>
        ACTIONS RAPIDES
      </Text>

      <View style={[styles.actionGroup, { backgroundColor: semantic.bgCard }]}>
        <TouchableOpacity style={styles.actionItem} onPress={onNavigateToProducts} activeOpacity={0.6}>
          <View style={[styles.actionIcon, { backgroundColor: colors.green[50] }]}>
            <Package size={18} color={colors.green[600]} />
          </View>
          <Text style={[styles.actionLabel, { color: semantic.textPrimary }]}>Mes produits</Text>
        </TouchableOpacity>

        <View style={styles.actionDivider} />

        <TouchableOpacity style={styles.actionItem} onPress={onNavigateToOrders} activeOpacity={0.6}>
          <View style={[styles.actionIcon, { backgroundColor: colors.blue[50] }]}>
            <ShoppingCart size={18} color={colors.blue[600]} />
          </View>
          <Text style={[styles.actionLabel, { color: semantic.textPrimary }]}>Commandes</Text>
        </TouchableOpacity>

        <View style={styles.actionDivider} />

        <TouchableOpacity style={styles.actionItem} onPress={onNavigateToSettings} activeOpacity={0.6}>
          <View style={[styles.actionIcon, { backgroundColor: colors.earth[50] }]}>
            <Settings size={18} color={colors.earth[600]} />
          </View>
          <Text style={[styles.actionLabel, { color: semantic.textPrimary }]}>Paramètres boutique</Text>
        </TouchableOpacity>

        <View style={styles.actionDivider} />

        <TouchableOpacity style={styles.actionItem} onPress={onNavigateToReviews} activeOpacity={0.6}>
          <View style={[styles.actionIcon, { backgroundColor: colors.coral[50] }]}>
            <Star size={18} color={colors.coral[600]} />
          </View>
          <Text style={[styles.actionLabel, { color: semantic.textPrimary }]}>Avis clients</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: spacing[10] },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
  },
  headerTitle: { ...typography.h2 },

  modeSwitchWrap: {
    marginTop: spacing[2],
    marginBottom: spacing[1],
  },
  kpiRow: {
    flexDirection: 'row',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    marginTop: spacing[2],
  },
  kpiCard: {
    flex: 1,
    alignItems: 'center',
    gap: spacing[1],
    padding: spacing[4],
    borderRadius: radius.lg,
  },
  kpiValue: { ...typography.h1 },
  kpiLabel: { ...typography.caption },

  earningsCard: {
    marginHorizontal: spacing[4],
    marginTop: spacing[3],
    padding: spacing[4],
    borderRadius: radius.lg,
    gap: spacing[2],
  },
  earningsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  earningsTotalRow: {
    borderTopWidth: 1,
    paddingTop: spacing[2],
    marginTop: spacing[1],
  },
  earningsLabel: { ...typography.bodyS },
  earningsValue: { ...typography.bodyS, fontFamily: fonts.sansSb },

  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginHorizontal: spacing[4],
    marginTop: spacing[5],
    padding: spacing[4],
    borderRadius: radius.lg,
  },
  alertTitle: { ...typography.h3 },
  alertSubtitle: { ...typography.bodyS, marginTop: 2 },

  sectionTitle: {
    ...typography.overline,
    paddingHorizontal: spacing[4],
    marginTop: spacing[6],
    marginBottom: spacing[2],
  },

  actionGroup: {
    marginHorizontal: spacing[4],
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionLabel: { ...typography.bodyL, fontFamily: fonts.sansMd },
  actionDivider: { height: 1, backgroundColor: colors.neutral[100], marginLeft: spacing[4] + 36 + spacing[3] },
})
