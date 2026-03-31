import * as React from 'react'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'

type TabType = 'filiere' | 'geographic'

interface CommunityGroup {
  id: string
  name: string
  description: string
  memberCount: number
  section: TabType
  isMember: boolean
}

interface Publication {
  id: string
  authorName: string
  content: string
  type: string
  createdAt: string
  likesCount: number
}

export function CommunityScreen() {
  const { semantic } = useTheme()
  const [activeTab, setActiveTab] = useState<TabType>('filiere')
  const [groups, setGroups] = useState<CommunityGroup[]>([])
  const [selectedGroup, setSelectedGroup] = useState<CommunityGroup | null>(null)
  const [publications, setPublications] = useState<Publication[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchGroups = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await apiFetch(`/api/groups?section=${activeTab}`)
      if (res.ok) {
        const data = await res.json()
        setGroups(data.groups ?? data)
      }
    }
    catch {
      // Silent fallback
    }
    finally {
      setIsLoading(false)
    }
  }, [activeTab])

  useEffect(() => {
    fetchGroups()
  }, [fetchGroups])

  async function fetchPublications(groupId: string): Promise<void> {
    try {
      const res = await apiFetch(`/api/groups/${groupId}/publications`)
      if (res.ok) {
        const data = await res.json()
        setPublications(data.publications ?? data)
      }
    }
    catch {
      // Silent fallback
    }
  }

  function handleSelectGroup(group: CommunityGroup): void {
    setSelectedGroup(group)
    fetchPublications(group.id)
  }

  async function handleToggleMembership(groupId: string, isMember: boolean): Promise<void> {
    const endpoint = isMember ? 'leave' : 'join'
    try {
      const res = await apiFetch(`/api/groups/${groupId}/${endpoint}`, {
        method: 'POST',
      })
      if (res.ok) {
        setGroups(prev =>
          prev.map(g =>
            g.id === groupId
              ? { ...g, isMember: !isMember, memberCount: g.memberCount + (isMember ? -1 : 1) }
              : g,
          ),
        )
        if (selectedGroup?.id === groupId) {
          setSelectedGroup({ ...selectedGroup, isMember: !isMember })
        }
      }
    }
    catch {
      // Error handling
    }
  }

  function renderGroupItem({ item }: { item: CommunityGroup }): React.ReactElement {
    return (
      <TouchableOpacity
        style={[
          styles.groupCard,
          { backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal },
          selectedGroup?.id === item.id && styles.groupCardActive,
        ]}
        onPress={() => handleSelectGroup(item)}
        accessibilityLabel={`Groupe ${item.name}`}
      >
        <View style={styles.groupHeader}>
          <Text style={[styles.groupName, { color: semantic.textPrimary }]}>{item.name}</Text>
          <Text style={[styles.groupMembers, { color: semantic.textTertiary }]}>
            {item.memberCount}
            {' '}
            membres
          </Text>
        </View>
        <Text style={[styles.groupDescription, { color: semantic.textSecondary }]} numberOfLines={2}>
          {item.description}
        </Text>
      </TouchableOpacity>
    )
  }

  function renderPublicationItem({ item }: { item: Publication }): React.ReactElement {
    return (
      <View style={[styles.publicationCard, { backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }]}>
        <View style={styles.publicationHeader}>
          <Text style={[styles.publicationAuthor, { color: semantic.textPrimary }]}>{item.authorName}</Text>
          <Text style={[styles.publicationDate, { color: semantic.textTertiary }]}>
            {new Date(item.createdAt).toLocaleDateString('fr-FR')}
          </Text>
        </View>
        <Text style={[styles.publicationContent, { color: semantic.textSecondary }]}>{item.content}</Text>
        <View style={styles.publicationFooter}>
          <Text style={[styles.publicationLikes, { color: semantic.textPrimaryColor }]}>
            {item.likesCount}
            {' '}
            J'aime
          </Text>
          <Text style={[styles.publicationType, { color: semantic.textTertiary }]}>{item.type}</Text>
        </View>
      </View>
    )
  }

  if (selectedGroup) {
    return (
      <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
        <View style={styles.groupDetailHeader}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              setSelectedGroup(null)
              setPublications([])
            }}
            accessibilityLabel="Retour"
          >
            <Text style={[styles.backButtonText, { color: semantic.textPrimaryColor }]}>Retour</Text>
          </TouchableOpacity>
          <Text style={[styles.groupDetailName, { color: semantic.textPrimary }]}>{selectedGroup.name}</Text>
          <TouchableOpacity
            style={[
              styles.joinButton,
              selectedGroup.isMember && [styles.leaveButton, { backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }],
            ]}
            onPress={() =>
              handleToggleMembership(selectedGroup.id, selectedGroup.isMember)}
            accessibilityLabel={selectedGroup.isMember ? 'Quitter le groupe' : 'Rejoindre le groupe'}
          >
            <Text
              style={[
                styles.joinButtonText,
                selectedGroup.isMember && [styles.leaveButtonText, { color: semantic.textSecondary }],
              ]}
            >
              {selectedGroup.isMember ? 'Quitter' : 'Rejoindre'}
            </Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={publications}
          keyExtractor={item => item.id}
          renderItem={renderPublicationItem}
          contentContainerStyle={styles.publicationList}
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: semantic.textTertiary }]}>Aucune publication dans ce groupe</Text>
          }
        />
      </View>
    )
  }

  return (
    <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
      <Text style={[styles.title, { color: semantic.textPrimary }]}>Communaute</Text>

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, { backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }, activeTab === 'filiere' && styles.tabActive]}
          onPress={() => setActiveTab('filiere')}
          accessibilityLabel="Groupes par filiere"
        >
          <Text
            style={[styles.tabText, { color: semantic.textSecondary }, activeTab === 'filiere' && styles.tabTextActive]}
          >
            Par filiere
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, { backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }, activeTab === 'geographic' && styles.tabActive]}
          onPress={() => setActiveTab('geographic')}
          accessibilityLabel="Groupes geographiques"
        >
          <Text
            style={[
              styles.tabText,
              { color: semantic.textSecondary },
              activeTab === 'geographic' && styles.tabTextActive,
            ]}
          >
            Geographique
          </Text>
        </TouchableOpacity>
      </View>

      {isLoading
        ? (
            <ActivityIndicator
              style={styles.loader}
              size="large"
              color={colors.green[400]}
            />
          )
        : (
            <FlatList
              data={groups}
              keyExtractor={item => item.id}
              renderItem={renderGroupItem}
              contentContainerStyle={styles.groupList}
              ListEmptyComponent={
                <Text style={[styles.emptyText, { color: semantic.textTertiary }]}>Aucun groupe disponible</Text>
              }
            />
          )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.neutral[0],
  },
  title: {
    ...typography.h1,
    color: colors.neutral[800],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[6],
    paddingBottom: spacing[3],
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing[4],
    gap: spacing[2],
    marginBottom: spacing[3],
  },
  tab: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    backgroundColor: colors.neutral[50],
  },
  tabActive: {
    backgroundColor: colors.green[50],
    borderColor: colors.green[400],
  },
  tabText: {
    fontFamily: fonts.sansMd,
    fontSize: 14,
    color: colors.neutral[600],
  },
  tabTextActive: {
    color: colors.green[800],
  },
  loader: {
    marginTop: spacing[8],
  },
  groupList: {
    paddingHorizontal: spacing[4],
    gap: spacing[3],
    paddingBottom: spacing[10],
  },
  groupCard: {
    backgroundColor: colors.neutral[50],
    borderRadius: radius.lg,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  groupCardActive: {
    borderColor: colors.green[400],
    backgroundColor: colors.green[50],
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[1],
  },
  groupName: {
    ...typography.h3,
    color: colors.neutral[800],
  },
  groupMembers: {
    ...typography.caption,
    color: colors.neutral[400],
  },
  groupDescription: {
    ...typography.bodyS,
    color: colors.neutral[600],
  },
  // Group detail
  groupDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingTop: spacing[6],
    paddingBottom: spacing[3],
    gap: spacing[3],
  },
  backButton: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
  },
  backButtonText: {
    fontFamily: fonts.sansMd,
    fontSize: 14,
    color: colors.green[600],
  },
  groupDetailName: {
    ...typography.h2,
    color: colors.neutral[800],
    flex: 1,
  },
  joinButton: {
    minHeight: 44,
    paddingHorizontal: spacing[4],
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.green[400],
    borderRadius: radius.md,
  },
  leaveButton: {
    backgroundColor: colors.neutral[50],
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  joinButtonText: {
    fontFamily: fonts.sansSb,
    fontSize: 14,
    color: colors.neutral[0],
  },
  leaveButtonText: {
    color: colors.neutral[600],
  },
  publicationList: {
    paddingHorizontal: spacing[4],
    gap: spacing[3],
    paddingBottom: spacing[10],
  },
  publicationCard: {
    backgroundColor: colors.neutral[50],
    borderRadius: radius.lg,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  publicationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing[2],
  },
  publicationAuthor: {
    fontFamily: fonts.sansSb,
    fontSize: 14,
    color: colors.neutral[800],
  },
  publicationDate: {
    ...typography.caption,
    color: colors.neutral[400],
  },
  publicationContent: {
    ...typography.bodyL,
    color: colors.neutral[600],
    marginBottom: spacing[2],
  },
  publicationFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  publicationLikes: {
    ...typography.caption,
    color: colors.green[600],
  },
  publicationType: {
    ...typography.overline,
    color: colors.neutral[400],
  },
  emptyText: {
    ...typography.bodyS,
    color: colors.neutral[400],
    textAlign: 'center',
    paddingVertical: spacing[8],
  },
})
