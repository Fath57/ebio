import Eye from 'lucide-react-native/dist/esm/icons/eye'
import Megaphone from 'lucide-react-native/dist/esm/icons/megaphone'
import MousePointerClick from 'lucide-react-native/dist/esm/icons/mouse-pointer-click'
import Plus from 'lucide-react-native/dist/esm/icons/plus'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { appAlert } from '../../common/components/app-alert'
import { ScreenHeader } from '../../common/components/screen-header'
import { readApiError } from '../utils/read-api-error'

export type BannerRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'

export interface BannerRequest {
  id: string
  title: string
  subtitle: string | null
  imageUrl: string
  targetType: 'SUPPLIER' | 'PRODUCT'
  targetId: string | null
  targetLabel: string | null
  durationDays: number
  price: number
  requestedStartAt: string | null
  status: BannerRequestStatus
  rejectionReason: string | null
  banner: {
    id: string
    startsAt: string | null
    endsAt: string | null
    isActive: boolean
    impressions: number
    clicks: number
  } | null
  paidAt: string | null
  refundedAt: string | null
  reviewedAt: string | null
  createdAt: string
}

interface StatusPill {
  label: string
  color: string
  background: string
}

function formatAmount(value: number): string {
  return `${value.toLocaleString('fr-FR')} FCFA`
}

/** "JJ/MM" for the pills; the year is obvious from context. */
function formatDayMonth(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

/** Derives the pill from the request status and, once approved, the banner window. */
export function describeRequestStatus(request: BannerRequest, now: Date = new Date()): StatusPill {
  switch (request.status) {
    case 'PENDING':
      return { label: 'En attente', color: colors.earth[600], background: colors.earth[50] }
    case 'REJECTED':
      return { label: 'Refusée', color: colors.coral[600], background: colors.coral[50] }
    case 'CANCELLED':
      return { label: 'Annulée', color: colors.neutral[600], background: colors.neutral[100] }
    case 'APPROVED': {
      const banner = request.banner
      const endsAt = banner?.endsAt ? new Date(banner.endsAt) : null
      const startsAt = banner?.startsAt ? new Date(banner.startsAt) : null
      if (endsAt && endsAt.getTime() < now.getTime()) {
        return { label: 'Terminée', color: colors.neutral[600], background: colors.neutral[100] }
      }
      if (startsAt && startsAt.getTime() > now.getTime()) {
        return { label: `Programmée dès le ${formatDayMonth(startsAt.toISOString())}`, color: colors.blue[600], background: colors.blue[50] }
      }
      if (endsAt) {
        return { label: `En ligne jusqu'au ${formatDayMonth(endsAt.toISOString())}`, color: colors.green[600], background: colors.green[50] }
      }
      return { label: 'En ligne', color: colors.green[600], background: colors.green[50] }
    }
    default:
      return { label: request.status, color: colors.neutral[600], background: colors.neutral[100] }
  }
}

interface BannerRequestsScreenProps {
  onGoBack: () => void
  onNewRequest: () => void
  /** Bumped by the navigator when the screen regains focus, to reload the list. */
  refreshKey?: number
}

/**
 * "Ma publicité": the shop's sponsored home-banner requests, newest first,
 * with their review status, live window and counters.
 */
export function BannerRequestsScreen({ onGoBack, onNewRequest, refreshKey = 0 }: BannerRequestsScreenProps) {
  const { semantic } = useTheme()
  const [requests, setRequests] = useState<BannerRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/suppliers/me/banner-requests')
      if (res.ok) {
        const data = await res.json() as BannerRequest[] | { items: BannerRequest[] }
        const items = Array.isArray(data) ? data : data.items
        setRequests([...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
      }
    }
    catch {
      // network failure: pull-to-refresh retries
    }
    finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  const cancelRequest = useCallback((request: BannerRequest) => {
    appAlert(
      'Annuler la demande ?',
      `Les ${formatAmount(request.price)} débités seront recrédités sur votre portefeuille boutique.`,
      [
        {
          text: 'Annuler la demande',
          style: 'destructive',
          onPress: async () => {
            setCancellingId(request.id)
            try {
              const res = await apiFetch(`/api/suppliers/me/banner-requests/${request.id}/cancel`, { method: 'POST' })
              if (!res.ok) {
                appAlert('Annulation impossible', await readApiError(res))
                return
              }
              load()
            }
            catch {
              appAlert('Annulation impossible', 'Vérifiez votre connexion et réessayez.')
            }
            finally {
              setCancellingId(null)
            }
          },
        },
        { text: 'Garder', style: 'cancel' },
      ],
    )
  }, [load])

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: semantic.bgPage }]}>
        <ActivityIndicator size="large" color={colors.green[400]} />
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader title="Ma publicité" onBack={onGoBack} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={(
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              setIsRefreshing(true)
              load()
            }}
            tintColor={colors.green[400]}
          />
        )}
      >
        {/* Explanation */}
        <View style={[styles.introCard, { backgroundColor: semantic.bgCard }]}>
          <View style={[styles.introIcon, { backgroundColor: colors.green[50] }]}>
            <Megaphone size={20} color={colors.green[600]} />
          </View>
          <View style={styles.introText}>
            <Text style={[styles.introTitle, { color: semantic.textPrimary }]}>Faites-vous remarquer</Text>
            <Text style={[styles.introBody, { color: semantic.textSecondary }]}>
              Votre bannière en page d'accueil de l'app client, validée par eBio sous 24 h.
              Le montant est débité de votre portefeuille boutique et remboursé si la demande est refusée.
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={onNewRequest}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Nouvelle demande de bannière"
        >
          <Plus size={16} color={colors.neutral[0]} strokeWidth={2.5} />
          <Text style={styles.primaryButtonText}>Nouvelle demande</Text>
        </TouchableOpacity>

        <Text style={[styles.sectionTitle, { color: semantic.textTertiary }]}>MES DEMANDES</Text>

        {requests.length === 0
          ? (
              <View style={[styles.emptyCard, { backgroundColor: semantic.bgCard }]}>
                <Text style={[styles.emptyText, { color: semantic.textSecondary }]}>
                  Aucune demande pour le moment. Créez votre première bannière pour apparaître en page d'accueil.
                </Text>
              </View>
            )
          : requests.map((request) => {
              const pill = describeRequestStatus(request)
              return (
                <View key={request.id} style={[styles.requestCard, { backgroundColor: semantic.bgCard }]}>
                  <Image source={{ uri: request.imageUrl }} style={styles.requestImage} resizeMode="cover" />
                  <View style={styles.requestBody}>
                    <View style={styles.requestHeader}>
                      <Text style={[styles.requestTitle, { color: semantic.textPrimary }]} numberOfLines={1}>
                        {request.title}
                      </Text>
                      <View style={[styles.pill, { backgroundColor: pill.background }]}>
                        <Text style={[styles.pillText, { color: pill.color }]}>{pill.label}</Text>
                      </View>
                    </View>
                    {request.subtitle
                      ? (
                          <Text style={[styles.requestSubtitle, { color: semantic.textSecondary }]} numberOfLines={1}>
                            {request.subtitle}
                          </Text>
                        )
                      : null}
                    <Text style={[styles.requestMeta, { color: semantic.textTertiary }]}>
                      {request.targetType === 'PRODUCT'
                        ? `Produit : ${request.targetLabel ?? 'supprimé'}`
                        : 'Ma boutique'}
                      {' · '}
                      {request.durationDays}
                      {' jours · '}
                      {formatAmount(request.price)}
                    </Text>
                    {request.status === 'APPROVED' && request.banner
                      ? (
                          <View style={styles.statsRow}>
                            <Eye size={14} color={semantic.textTertiary} />
                            <Text style={[styles.statsText, { color: semantic.textSecondary }]}>
                              {request.banner.impressions.toLocaleString('fr-FR')}
                              {' vues'}
                            </Text>
                            <Text style={[styles.statsText, { color: semantic.textTertiary }]}>·</Text>
                            <MousePointerClick size={14} color={semantic.textTertiary} />
                            <Text style={[styles.statsText, { color: semantic.textSecondary }]}>
                              {request.banner.clicks.toLocaleString('fr-FR')}
                              {' clics'}
                            </Text>
                          </View>
                        )
                      : null}
                    {request.status === 'REJECTED' && request.rejectionReason
                      ? (
                          <Text style={[styles.rejection, { color: colors.coral[600] }]}>
                            {request.rejectionReason}
                          </Text>
                        )
                      : null}
                    {request.status === 'PENDING'
                      ? (
                          <TouchableOpacity
                            style={styles.cancelLink}
                            onPress={() => cancelRequest(request)}
                            disabled={cancellingId === request.id}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel="Annuler la demande"
                          >
                            {cancellingId === request.id
                              ? <ActivityIndicator size="small" color={colors.coral[600]} />
                              : <Text style={[styles.cancelLinkText, { color: colors.coral[600] }]}>Annuler</Text>}
                          </TouchableOpacity>
                        )
                      : null}
                  </View>
                </View>
              )
            })}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingBottom: spacing[10] },

  introCard: {
    flexDirection: 'row',
    gap: spacing[3],
    marginHorizontal: spacing[4],
    marginTop: spacing[2],
    padding: spacing[4],
    borderRadius: radius.lg,
  },
  introIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  introText: { flex: 1, gap: spacing[1] },
  introTitle: { ...typography.h3 },
  introBody: { ...typography.bodyS },

  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    marginHorizontal: spacing[4],
    marginTop: spacing[3],
    minHeight: 48,
    backgroundColor: colors.green[400],
    borderRadius: radius.md,
    paddingVertical: spacing[3],
  },
  primaryButtonText: { ...typography.h3, color: colors.neutral[0] },

  sectionTitle: {
    ...typography.overline,
    paddingHorizontal: spacing[4],
    marginTop: spacing[6],
    marginBottom: spacing[2],
  },
  emptyCard: {
    marginHorizontal: spacing[4],
    padding: spacing[4],
    borderRadius: radius.lg,
  },
  emptyText: { ...typography.bodyS, textAlign: 'center' },

  requestCard: {
    marginHorizontal: spacing[4],
    marginBottom: spacing[3],
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  requestImage: {
    width: '100%',
    aspectRatio: 2,
    backgroundColor: colors.neutral[100],
  },
  requestBody: { padding: spacing[4], gap: spacing[1] },
  requestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  requestTitle: { ...typography.h3, flex: 1 },
  requestSubtitle: { ...typography.bodyS },
  requestMeta: { ...typography.caption },
  pill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
  },
  pillText: { ...typography.caption, fontFamily: fonts.sansSb },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    marginTop: spacing[1],
  },
  statsText: { ...typography.caption },
  rejection: { ...typography.bodyS, marginTop: spacing[1] },
  cancelLink: { alignSelf: 'flex-start', marginTop: spacing[2], minHeight: 24, justifyContent: 'center' },
  cancelLinkText: { ...typography.bodyS, fontFamily: fonts.sansSb },
})
