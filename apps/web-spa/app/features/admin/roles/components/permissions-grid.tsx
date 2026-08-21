import { Checkbox } from '@boilerstone/ui/components/primitives/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@boilerstone/ui/components/primitives/table'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

interface Permission {
  id: string
  subject: string
  action: string
}

interface PermissionsGridProps {
  permissions: Permission[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
}

const SUBJECTS = ['Product', 'Order', 'User', 'Supplier', 'Rating', 'Report', 'Settings']
const ACTIONS = ['create', 'read', 'update', 'delete', 'manage']

export const PermissionsGrid: React.FC<PermissionsGridProps> = ({
  permissions,
  selectedIds,
  onChange,
}) => {
  const { t } = useTranslation()

  const getPermissionId = (subject: string, action: string) => {
    const perm = permissions.find(p => p.subject === subject && p.action === action)
    return perm?.id
  }

  const togglePermission = (permissionId: string) => {
    if (selectedIds.includes(permissionId)) {
      onChange(selectedIds.filter(id => id !== permissionId))
    }
    else {
      onChange([...selectedIds, permissionId])
    }
  }

  const toggleSubjectAll = (subject: string) => {
    const subjectPermissions = permissions.filter(p => p.subject === subject)
    const allSelected = subjectPermissions.every(p => selectedIds.includes(p.id))
    if (allSelected) {
      onChange(selectedIds.filter(id => !subjectPermissions.some(p => p.id === id)))
    }
    else {
      const newIds = [...selectedIds]
      subjectPermissions.forEach((p) => {
        if (!newIds.includes(p.id)) {
          newIds.push(p.id)
        }
      })
      onChange(newIds)
    }
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-left">
              {t('admin.roles.permissions.subject')}
            </TableHead>
            {ACTIONS.map(action => (
              <TableHead key={action} className="text-center">
                {t(`admin.roles.permissions.actions.${action}`)}
              </TableHead>
            ))}
            <TableHead className="text-center">
              {t('admin.roles.permissions.all')}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {SUBJECTS.map((subject) => {
            const subjectPermissions = permissions.filter(p => p.subject === subject)
            const allSelected = subjectPermissions.length > 0 && subjectPermissions.every(p => selectedIds.includes(p.id))
            return (
              <TableRow key={subject}>
                <TableCell className="font-medium">
                  {t(`admin.roles.permissions.subjects.${subject.toLowerCase()}`)}
                </TableCell>
                {ACTIONS.map((action) => {
                  const permId = getPermissionId(subject, action)
                  return (
                    <TableCell key={action} className="text-center">
                      {permId
                        ? (
                            <Checkbox
                              checked={selectedIds.includes(permId)}
                              onCheckedChange={() => togglePermission(permId)}
                            />
                          )
                        : <span className="text-muted-foreground">-</span>}
                    </TableCell>
                  )
                })}
                <TableCell className="text-center">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={() => toggleSubjectAll(subject)}
                  />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
