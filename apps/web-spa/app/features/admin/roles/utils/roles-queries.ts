import {
  rolesControllerCreate,
  rolesControllerDelete,
  rolesControllerFindAll,
  rolesControllerGetAllPermissions,
  rolesControllerUpdate,
} from '@boilerstone/openapi-generator/client/sdk.gen'

export interface RoleItem {
  id: string
  name: string
  description: string
  permissionIds: string[]
}

export interface RolesData {
  data: RoleItem[]
}

export interface PermissionItem {
  id: string
  subject: string
  action: string
}

export interface PermissionsData {
  data: PermissionItem[]
}

export function fetchRolesQueryOptions() {
  return {
    queryKey: ['admin', 'roles'],
    queryFn: async () => {
      const response = await rolesControllerFindAll()
      if (response.error)
        throw new Error('Failed to fetch roles')
      return response.data as RolesData
    },
  }
}

export function fetchPermissionsQueryOptions() {
  return {
    queryKey: ['admin', 'permissions'],
    queryFn: async () => {
      const response = await rolesControllerGetAllPermissions()
      if (response.error)
        throw new Error('Failed to fetch permissions')
      return response.data as PermissionsData
    },
  }
}

export function fetchRoleByIdQueryOptions(roleId: string) {
  return {
    queryKey: ['admin', 'roles', roleId],
    queryFn: async () => {
      const response = await rolesControllerFindAll()
      if (response.error)
        throw new Error('Failed to fetch roles')
      const rolesData = response.data as RolesData
      const role = rolesData?.data?.find(r => r.id === roleId)
      if (!role)
        throw new Error('Role not found')
      return role
    },
  }
}

export const createRoleMutationOptions = {
  mutationFn: async (data: { name: string, description: string, permissionIds: string[] }) => {
    const response = await rolesControllerCreate({
      body: data,
    })
    if (response.error)
      throw new Error('Failed to create role')
    return response.data
  },
}

export const updateRoleMutationOptions = {
  mutationFn: async ({ id, ...data }: { id: string, name: string, description: string, permissionIds: string[] }) => {
    const response = await rolesControllerUpdate({
      path: { id },
      body: data,
    })
    if (response.error)
      throw new Error('Failed to update role')
    return response.data
  },
}

export const deleteRoleMutationOptions = {
  mutationFn: async (id: string) => {
    const response = await rolesControllerDelete({
      path: { id },
    })
    if (response.error)
      throw new Error('Failed to delete role')
    return response.data
  },
}
