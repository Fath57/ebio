import {
  rolesControllerCreate,
  rolesControllerDelete,
  rolesControllerFindAll,
  rolesControllerGetCatalog,
  rolesControllerUpdate,
} from '@boilerstone/openapi-generator/client/sdk.gen'

export interface RolePermission {
  id: string
  action: string
  subject: string
  description: string | null
}

export interface RoleItem {
  id: string
  name: string
  description: string | null
  isDefault: boolean
  isSystem: boolean
  usersCount: number
  permissions: RolePermission[]
}

export interface RolesData {
  roles: RoleItem[]
}

export interface CatalogPermission {
  id: string
  key: string
  action: string
  subject: string
  description: string | null
}

export interface CatalogSection {
  key: string
  permissions: CatalogPermission[]
}

export interface PermissionCatalogData {
  sections: CatalogSection[]
}

export interface RolePayload {
  name: string
  description?: string
  permissionIds: string[]
}

/** `manage all` marks the super administrator role. */
export function hasAllRights(role: Pick<RoleItem, 'permissions'>) {
  return role.permissions.some(p => p.action === 'manage' && p.subject === 'all')
}

function errorMessage(error: unknown, fallback: string) {
  const message = (error as { message?: string } | undefined)?.message
  return message ?? fallback
}

export function fetchRolesQueryOptions() {
  return {
    queryKey: ['admin', 'roles'],
    queryFn: async () => {
      const response = await rolesControllerFindAll()
      if (response.error)
        throw new Error('Failed to fetch roles')
      return response.data as unknown as RolesData
    },
  }
}

export function fetchPermissionCatalogQueryOptions() {
  return {
    queryKey: ['admin', 'roles', 'catalog'],
    queryFn: async () => {
      const response = await rolesControllerGetCatalog()
      if (response.error)
        throw new Error('Failed to fetch permission catalog')
      return response.data as unknown as PermissionCatalogData
    },
  }
}

export function fetchRoleByIdQueryOptions(roleId: string) {
  return {
    queryKey: ['admin', 'roles', 'detail', roleId],
    queryFn: async () => {
      const response = await rolesControllerFindAll()
      if (response.error)
        throw new Error('Failed to fetch roles')
      const role = (response.data as unknown as RolesData).roles.find(r => r.id === roleId)
      if (!role)
        throw new Error('Role not found')
      return role
    },
  }
}

export const createRoleMutationOptions = {
  mutationFn: async (data: RolePayload) => {
    const response = await rolesControllerCreate({ body: data })
    if (response.error)
      throw new Error(errorMessage(response.error, 'Failed to create role'))
    return response.data as unknown as RoleItem
  },
}

export const updateRoleMutationOptions = {
  mutationFn: async ({ id, ...data }: RolePayload & { id: string }) => {
    const response = await rolesControllerUpdate({ path: { id }, body: data })
    if (response.error)
      throw new Error(errorMessage(response.error, 'Failed to update role'))
    return response.data as unknown as RoleItem
  },
}

export const deleteRoleMutationOptions = {
  mutationFn: async (id: string) => {
    const response = await rolesControllerDelete({ path: { id } })
    // 409 carries a French message (system role, or still assigned).
    if (response.error)
      throw new Error(errorMessage(response.error, 'Failed to delete role'))
    return response.data as unknown as { deleted: boolean }
  },
}
