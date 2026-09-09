import {
  staffControllerChangeRole,
  staffControllerInvite,
  staffControllerList,
  staffControllerRemove,
  staffControllerResendInvitation,
} from '@boilerstone/openapi-generator/client/sdk.gen'

export interface StaffMember {
  id: string
  name: string
  email: string
  phone: string | null
  /** `null` = super administrator without an explicit role. */
  role: { id: string, name: string } | null
  lastLoginAt: string | null
  createdAt: string
  invitationPending: boolean
}

export interface StaffData {
  members: StaffMember[]
}

function errorMessage(error: unknown, fallback: string) {
  const message = (error as { message?: string } | undefined)?.message
  return message ?? fallback
}

export function fetchStaffQueryOptions() {
  return {
    queryKey: ['admin', 'staff'],
    queryFn: async () => {
      const response = await staffControllerList()
      if (response.error)
        throw new Error('Failed to fetch staff')
      return response.data as unknown as StaffData
    },
  }
}

export const inviteStaffMutationOptions = {
  mutationFn: async (data: { name: string, email: string, roleId: string }) => {
    const response = await staffControllerInvite({ body: data })
    if (response.error)
      throw new Error(errorMessage(response.error, 'Failed to invite staff member'))
    return response.data as unknown as StaffMember
  },
}

export const changeStaffRoleMutationOptions = {
  mutationFn: async ({ id, roleId }: { id: string, roleId: string }) => {
    const response = await staffControllerChangeRole({ path: { id }, body: { roleId } })
    if (response.error)
      throw new Error(errorMessage(response.error, 'Failed to change role'))
    return response.data as unknown as StaffMember
  },
}

export const resendInvitationMutationOptions = {
  mutationFn: async (id: string) => {
    const response = await staffControllerResendInvitation({ path: { id } })
    if (response.error)
      throw new Error(errorMessage(response.error, 'Failed to resend invitation'))
    return response.data as unknown as { sent: boolean }
  },
}

export const removeStaffMutationOptions = {
  mutationFn: async (id: string) => {
    const response = await staffControllerRemove({ path: { id } })
    if (response.error)
      throw new Error(errorMessage(response.error, 'Failed to remove staff member'))
    return response.data as unknown as { removed: boolean }
  },
}
