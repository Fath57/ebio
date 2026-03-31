import { EntityManager } from '@mikro-orm/postgresql'
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { User } from '../auth/auth.entity'
import { CommunityGroup } from './entities/community-group.entity'
import { GroupMembership } from './entities/group-membership.entity'
import { Publication, PublicationStatus, PublicationType } from './entities/publication.entity'

@Injectable()
export class CommunityService {
  constructor(private readonly em: EntityManager) {}

  async getGroups(filters: { type?: string, sector?: string, region?: string, page?: number, limit?: number }, userId?: string) {
    const where: Record<string, unknown> = {}
    if (filters.type)
      where.type = filters.type
    if (filters.sector)
      where.sector = filters.sector
    if (filters.region)
      where.region = filters.region

    const page = filters.page ?? 1
    const limit = filters.limit ?? 20

    const [groups, total] = await this.em.findAndCount(CommunityGroup, where, {
      orderBy: { memberCount: 'DESC' },
      limit,
      offset: (page - 1) * limit,
    })

    let membershipMap = new Map<string, boolean>()
    if (userId) {
      const memberships = await this.em.find(GroupMembership, {
        user: { id: userId },
        group: { $in: groups },
      })
      membershipMap = new Map(memberships.map(m => [(m.group as unknown as CommunityGroup).id ?? String(m.group), true]))
    }

    return {
      groups: groups.map(g => ({
        id: g.id,
        name: g.name,
        type: g.type,
        memberCount: g.memberCount,
        isMember: membershipMap.has(g.id),
      })),
      total,
    }
  }

  async joinGroup(userId: string, groupId: string): Promise<void> {
    const group = await this.em.findOne(CommunityGroup, { id: groupId })
    if (!group)
      throw new NotFoundException('Groupe introuvable')

    const existing = await this.em.findOne(GroupMembership, { user: { id: userId }, group: { id: groupId } })
    if (existing)
      throw new ConflictException('Déjà membre de ce groupe')

    this.em.create(GroupMembership, { user: this.em.getReference(User, userId), group: this.em.getReference(CommunityGroup, groupId) })
    group.memberCount++
    await this.em.flush()
  }

  async leaveGroup(userId: string, groupId: string): Promise<void> {
    const membership = await this.em.findOne(GroupMembership, { user: { id: userId }, group: { id: groupId } })
    if (!membership)
      throw new NotFoundException('Non membre de ce groupe')

    const group = await this.em.findOne(CommunityGroup, { id: groupId })
    if (group && group.memberCount > 0)
      group.memberCount--

    this.em.remove(membership)
    await this.em.flush()
  }

  async getPublications(groupId: string, filters: { type?: string, page?: number, limit?: number }) {
    const where: Record<string, unknown> = { group: { id: groupId }, status: PublicationStatus.ACTIVE }
    if (filters.type)
      where.type = filters.type

    const page = filters.page ?? 1
    const limit = filters.limit ?? 20

    const [publications, total] = await this.em.findAndCount(Publication, where, {
      populate: ['author'],
      orderBy: { createdAt: 'DESC' },
      limit,
      offset: (page - 1) * limit,
    })

    return { publications, total, hasMore: page * limit < total }
  }

  async createPublication(userId: string, groupId: string, data: { type: string, content: string, mediaUrls?: string[] }) {
    const membership = await this.em.findOne(GroupMembership, { user: { id: userId }, group: { id: groupId } })
    if (!membership)
      throw new ConflictException('Vous devez être membre du groupe pour publier')

    const publication = this.em.create(Publication, {
      author: this.em.getReference(User, userId),
      group: this.em.getReference(CommunityGroup, groupId),
      type: data.type as PublicationType,
      content: data.content,
      mediaUrls: data.mediaUrls ?? [],
    })

    await this.em.flush()
    return publication
  }

  async reportPublication(_userId: string, publicationId: string, _reason: string): Promise<void> {
    const publication = await this.em.findOne(Publication, { id: publicationId })
    if (!publication)
      throw new NotFoundException('Publication introuvable')
    publication.reportCount++
    await this.em.flush()
    // ContentReport creation handled by admin module
  }

  getShareUrl(publicationId: string) {
    const baseUrl = 'https://ebio.bj/community'
    const url = `${baseUrl}/publications/${publicationId}`
    return {
      url,
      whatsappUrl: `https://wa.me/?text=${encodeURIComponent(url)}`,
      facebookUrl: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    }
  }
}
