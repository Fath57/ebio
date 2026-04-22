import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import ArrowLeft from 'lucide-react-native/dist/esm/icons/arrow-left'
import Package from 'lucide-react-native/dist/esm/icons/package'
import Settings from 'lucide-react-native/dist/esm/icons/settings'
import ShoppingCart from 'lucide-react-native/dist/esm/icons/shopping-cart'
import TrendingUp from 'lucide-react-native/dist/esm/icons/trending-up'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'

interface DashboardData {
  pendingOrders: number
  revenue: number
  criticalStockProducts: number
  unreadMessages: number
  averageRating: number | null
}

interface DashboardScreenProps {
  onGoBack: () => void
  onNavigateToProducts: () => void
  onNavigateToOrders: () => void
  onNavigateToSettings: () => void
}

export function DashboardScreen({ onGoBack, onNavigateToProducts, onNavigateToOrders, onNavigateToSettings }: DashboardScreenProps) {
  const { semantic } = useTheme()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await apiFetch('/api/suppliers/me/dashboard')
        if (res.ok) {
          setData(await res.json())
        }
      } catch {
        // ignore
      } finally {
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
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onGoBack} hitSlop={8}>
          <ArrowLeft size={24} color={semantic.textPrimary} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: semantic.textPrimary }]}>
          Tableau de bord
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {/* KPI cards */}
      <View style={styles.kpiRow}>
        <View style={[styles.kpiCard, { backgroundColor: semantic.bgCard }]}>
          <TrendingUp size={20} color={colors.green[400]} />
          <Text style={[styles.kpiValue, { color: semantic.textPrimary }]}>
            {((data?.revenue ?? 0) / 1000).toFixed(0)}k
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
              {data?.pendingOrders} commande{(data?.pendingOrders ?? 0) > 1 ? 's' : ''} en attente
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
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: spacing[10] },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing[4], paddingVertical: spacing[4],
  },
  headerTitle: { ...typography.h2 },

  kpiRow: {
    flexDirection: 'row', gap: spacing[3],
    paddingHorizontal: spacing[4], marginTop: spacing[2],
  },
  kpiCard: {
    flex: 1, alignItems: 'center', gap: spacing[1],
    padding: spacing[4], borderRadius: radius.lg,
  },
  kpiValue: { ...typography.h1 },
  kpiLabel: { ...typography.caption },

  alertCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing[3],
    marginHorizontal: spacing[4], marginTop: spacing[5],
    padding: spacing[4], borderRadius: radius.lg,
  },
  alertTitle: { ...typography.h3 },
  alertSubtitle: { ...typography.bodyS, marginTop: 2 },

  sectionTitle: {
    ...typography.overline,
    paddingHorizontal: spacing[4],
    marginTop: spacing[6], marginBottom: spacing[2],
  },

  actionGroup: {
    marginHorizontal: spacing[4], borderRadius: radius.lg, overflow: 'hidden',
  },
  actionItem: {
    flexDirection: 'row', alignItems: 'center', gap: spacing[3],
    paddingHorizontal: spacing[4], paddingVertical: spacing[4],
  },
  actionIcon: {
    width: 36, height: 36, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  actionLabel: { ...typography.bodyL, fontFamily: fonts.sansMd },
  actionDivider: { height: 1, backgroundColor: colors.neutral[100], marginLeft: spacing[4] + 36 + spacing[3] },
})
