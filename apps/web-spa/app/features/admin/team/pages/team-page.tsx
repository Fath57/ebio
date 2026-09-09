import type { StaffMember } from '../utils/team-queries'
import { Alert, AlertDescription } from '@boilerstone/ui/components/primitives/alert'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card, CardContent, CardHeader, CardTitle } from '@boilerstone/ui/components/primitives/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@boilerstone/ui/components/primitives/dialog'
import { Label } from '@boilerstone/ui/components/primitives/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@boilerstone/ui/components/primitives/select'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { toast } from '@boilerstone/ui/components/primitives/sonner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@boilerstone/ui/components/primitives/table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, Info, MailPlus, Shield, UserMinus, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { formatRelative } from '@/features/admin/deliveries/utils/deliveries-queries'
import { fetchRolesQueryOptions } from '@/features/admin/roles/utils/roles-queries'
import { AuditTimeline } from '@/features/admin/users/components/audit-timeline'
import { fetchRecentAuditQueryOptions } from '@/features/admin/users/utils/users-queries'
import { authClient } from '@/lib/auth-client'
import { InviteStaffForm } from '../forms/invite-staff-form'
import {
  changeStaffRoleMutationOptions,
  fetchStaffQueryOptions,
  removeStaffMutationOptions,
  resendInvitationMutationOptions,
} from '../utils/team-queries'

export default function TeamPage() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const { data: session } = authClient.useSession()
  const currentUserId = session?.user?.id

  const [inviteOpen, setInviteOpen] = useState(false)
  const [memberToEdit, setMemberToEdit] = useState<StaffMember | null>(null)
  const [nextRoleId, setNextRoleId] = useState('')
  const [memberToRemove, setMemberToRemove] = useState<StaffMember | null>(null)
  const [auditOpen, setAuditOpen] = useState(false)

  const { data: staff, isLoading } = useQuery(fetchStaffQueryOptions())
  const { data: rolesData } = useQuery(fetchRolesQueryOptions())
  const roles = rolesData?.roles ?? []
  // Team-wide audit trail, fetched only once the section is expanded.
  const { data: audit, isLoading: isAuditLoading } = useQuery({
    ...fetchRecentAuditQueryOptions(),
    enabled: auditOpen,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'staff'] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] })
  }

  const { mutate: changeRole, isPending: isChangingRole } = useMutation({
    ...changeStaffRoleMutationOptions,
    onSuccess: () => {
      toast.success(t('admin.team.roleChanged'))
      setMemberToEdit(null)
      invalidate()
    },
    onError: (error: Error) => {
      toast.error(error.message || t('common.error'))
    },
  })

  const { mutate: resend, isPending: isResending } = useMutation({
    ...resendInvitationMutationOptions,
    onSuccess: () => {
      toast.success(t('admin.team.resent'))
    },
    onError: (error: Error) => {
      toast.error(error.message || t('common.error'))
    },
  })

  const { mutate: remove, isPending: isRemoving } = useMutation({
    ...removeStaffMutationOptions,
    onSuccess: () => {
      toast.success(t('admin.team.removed'))
      setMemberToRemove(null)
      invalidate()
    },
    onError: (error: Error) => {
      toast.error(error.message || t('common.error'))
    },
  })

  const openRoleDialog = (member: StaffMember) => {
    setNextRoleId(member.role?.id ?? '')
    setMemberToEdit(member)
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const members = staff?.members ?? []
  const dateFormatter = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('admin.team.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('admin.team.description')}</p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          {t('admin.team.invite')}
        </Button>
      </div>

      <Alert>
        <Info />
        <AlertDescription className="flex flex-wrap items-center gap-1">
          <span>{t('admin.team.rightsHint')}</span>
          <Link to="/admin/roles" className="font-medium underline underline-offset-4">
            {t('admin.team.manageRoles')}
          </Link>
        </AlertDescription>
      </Alert>

      {members.length === 0
        ? (
            <p className="text-muted-foreground">{t('admin.team.empty')}</p>
          )
        : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.team.member')}</TableHead>
                  <TableHead>{t('admin.team.role')}</TableHead>
                  <TableHead>{t('admin.team.status')}</TableHead>
                  <TableHead>{t('admin.team.createdAt')}</TableHead>
                  <TableHead className="text-right">{t('admin.team.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => {
                  const isSelf = member.id === currentUserId
                  return (
                    <TableRow key={member.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {member.name}
                            {isSelf && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                (
                                {t('admin.team.you')}
                                )
                              </span>
                            )}
                          </span>
                          <span className="text-xs text-muted-foreground">{member.email}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={member.role ? 'secondary' : 'default'}>
                          {member.role?.name ?? t('admin.team.superAdmin')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {member.invitationPending
                          ? <Badge variant="outline">{t('admin.team.pending')}</Badge>
                          : member.lastLoginAt
                            ? (
                                <span className="text-sm text-muted-foreground">
                                  {t('admin.team.lastLogin', { ago: formatRelative(member.lastLoginAt, i18n.language) ?? '' })}
                                </span>
                              )
                            : <span className="text-sm text-muted-foreground">{t('admin.team.neverConnected')}</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {dateFormatter.format(new Date(member.createdAt))}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isSelf}
                            title={t('admin.team.changeRole')}
                            aria-label={t('admin.team.changeRole')}
                            onClick={() => openRoleDialog(member)}
                          >
                            <Shield className="h-4 w-4" />
                          </Button>
                          {member.invitationPending && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={isSelf || isResending}
                              title={t('admin.team.resend')}
                              aria-label={t('admin.team.resend')}
                              onClick={() => resend(member.id)}
                            >
                              <MailPlus className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isSelf}
                            title={t('admin.team.remove')}
                            aria-label={t('admin.team.remove')}
                            onClick={() => setMemberToRemove(member)}
                          >
                            <UserMinus className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t('admin.team.recentActions')}</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setAuditOpen(open => !open)}>
            {auditOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            <span className="ml-1">{auditOpen ? t('common.hide') : t('common.show')}</span>
          </Button>
        </CardHeader>
        {auditOpen && (
          <CardContent>
            {isAuditLoading
              ? <Skeleton className="h-24 w-full" />
              : <AuditTimeline entries={(audit?.entries ?? []).slice(0, 20)} showTarget />}
          </CardContent>
        )}
      </Card>

      <InviteStaffForm open={inviteOpen} roles={roles} onOpenChange={setInviteOpen} />

      <Dialog
        open={memberToEdit !== null}
        onOpenChange={(open) => {
          if (!open)
            setMemberToEdit(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.team.changeRoleTitle')}</DialogTitle>
            <DialogDescription>{memberToEdit?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="staff-role">{t('admin.team.role')}</Label>
            <Select value={nextRoleId} onValueChange={setNextRoleId}>
              <SelectTrigger id="staff-role">
                <SelectValue placeholder={t('admin.team.rolePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {roles.map(role => (
                  <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMemberToEdit(null)} disabled={isChangingRole}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={isChangingRole || !nextRoleId || nextRoleId === memberToEdit?.role?.id}
              onClick={() => {
                if (memberToEdit)
                  changeRole({ id: memberToEdit.id, roleId: nextRoleId })
              }}
            >
              {isChangingRole ? t('common.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={memberToRemove !== null}
        onOpenChange={(open) => {
          if (!open)
            setMemberToRemove(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.team.removeTitle')}</DialogTitle>
            <DialogDescription>
              {t('admin.team.removeConfirm', { name: memberToRemove?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMemberToRemove(null)} disabled={isRemoving}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={isRemoving}
              onClick={() => {
                if (memberToRemove)
                  remove(memberToRemove.id)
              }}
            >
              {isRemoving ? t('common.saving') : t('admin.team.remove')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
