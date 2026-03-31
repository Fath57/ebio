import type { Subjects } from '../../modules/auth/casl/casl-ability.factory'
import type { RequiredPermission } from '../guards/casl.guard'
import { SetMetadata } from '@nestjs/common'
import { CHECK_PERMISSIONS_KEY } from '../guards/casl.guard'

export function CheckPermissions(...permissions: RequiredPermission[]) {
  return SetMetadata(CHECK_PERMISSIONS_KEY, permissions)
}

export const CanCreate = (subject: Subjects) => CheckPermissions({ action: 'create', subject })
export const CanRead = (subject: Subjects) => CheckPermissions({ action: 'read', subject })
export const CanUpdate = (subject: Subjects) => CheckPermissions({ action: 'update', subject })
export const CanDelete = (subject: Subjects) => CheckPermissions({ action: 'delete', subject })
export const CanManage = (subject: Subjects) => CheckPermissions({ action: 'manage', subject })
